## Objectif

Permettre à chaque workspace de connecter **sa propre app Meta dédiée WhatsApp Cloud API** (App ID + App Secret + token permanent + WABA + numéro), totalement indépendante de la Facebook App globale (qui reste pour Login / Pages / Lead Forms / import leads).

## État actuel (à savoir)

- La table `whatsapp_config` est déjà scopée par `workspace_id` (champs : `phone_number_id`, `business_account_id`, `access_token`, `verify_token`, `webhook_subscribed`, `is_active`…). Bon point de départ.
- **Blocage architectural #1** — le webhook `whatsapp-webhook` vérifie la signature HMAC avec **un seul secret global** `FB_APP_SECRET`. Impossible aujourd'hui de recevoir des webhooks d'une autre app Meta.
- **Blocage #2** — pas de champ `app_id` / `app_secret` par workspace.
- **Blocage #3** — l'UI actuelle (`MetaOAuthPicker`, `WhatsAppSystemUserWizard`) suppose que l'app Meta = l'app globale Digital Launch CRM. Pas de saisie manuelle d'une app cliente.
- L'envoi (`send-whatsapp-message`, médias, audio, réactions, templates, calls) charge déjà la config par `workspace_id` → **aucun changement de logique d'envoi nécessaire**, juste utiliser les nouveaux champs si présents.

## Plan

### 1. Base de données — migration

Étendre `whatsapp_config` (plutôt que créer une nouvelle table : évite migration de données et double source de vérité) :

```
ALTER TABLE public.whatsapp_config
  ADD COLUMN app_id text,
  ADD COLUMN app_secret text,
  ADD COLUMN status text DEFAULT 'not_configured',
  ADD COLUMN connection_mode text DEFAULT 'global'; -- 'global' | 'dedicated'
```

- `connection_mode = 'dedicated'` → webhook utilise `app_secret` du row pour vérifier HMAC.
- `connection_mode = 'global'` → conserve le comportement actuel (FB_APP_SECRET global) pour ne rien casser sur les workspaces existants.
- `status` ∈ `not_configured | incomplete | connected | error | webhook_unverified` (calculé côté edge mais persisté pour affichage rapide).
- Pas de table séparée `workspace_whatsapp_connections` : les colonnes existantes (`phone_number_id`, `business_account_id`, `access_token`, `verify_token`) couvrent exactement le besoin. Création d'une table parallèle ferait diverger envoi et réception.

### 2. Webhook multi-app (`whatsapp-webhook`)

Le routage se fait déjà via `verify_token` (handshake) et via `phone_number_id` du payload (POST). Modifs :

- **GET handshake** : déjà OK (lookup verify_token → row).
- **POST** : lookup du row par `metadata.phone_number_id` **avant** la vérif HMAC. Si `connection_mode = 'dedicated'` → utiliser `row.app_secret` pour HMAC ; sinon fallback `FB_APP_SECRET` global.
- Webhook URL reste unique (`/functions/v1/whatsapp-webhook`) — pas besoin de path `/{workspace_id}`. Le routage par `phone_number_id` + `verify_token` est suffisant et c'est le pattern recommandé par Meta. Évite de devoir reconfigurer Meta si le workspace change de slug.
- Champ "Webhook URL" affiché en lecture seule dans l'UI = cette URL unique + le `verify_token` propre au workspace.

### 3. UI — section "WhatsApp Cloud API" dans Réglages Workspace

Nouvelle section dans `SettingsIntegrationsPage` (ou page dédiée `SettingsWhatsAppPage`), **indépendante** du bloc Facebook OAuth existant.

Composant `WhatsAppDedicatedAppCard` avec :
- Toggle "Utiliser une app Meta dédiée à ce workspace" → bascule `connection_mode`.
- Formulaire (saisie manuelle) : App ID, App Secret, Permanent Access Token, WABA ID, Phone Number ID.
- Verify Token : auto-généré (déjà le cas), bouton "régénérer".
- Webhook URL : lecture seule, bouton copier.
- Badge statut : `Non configuré / Incomplet / Connecté / Erreur / Webhook non vérifié`.
- Bouton "Tester la connexion" → appel Graph API pour valider token + récupérer `display_phone_number` + `verified_name`, met à jour `status` et `webhook_subscribed`.

### 4. Help guide intégré

Composant `WhatsAppDedicatedAppGuide` (Dialog ou Accordion) avec les 9 étapes listées, copy-to-clipboard pour Webhook URL + Verify Token, liens directs vers `developers.facebook.com/apps`, `business.facebook.com/wa/manage`.

### 5. Edge function `whatsapp-config-manage`

Ajouter actions :
- `save_dedicated` : upsert (`app_id`, `app_secret`, `access_token`, `waba_id`, `phone_number_id`, `connection_mode='dedicated'`).
- `test_dedicated` : appelle `GET /{phone_number_id}?fields=display_phone_number,verified_name` avec le token → calcule `status`.
- `subscribe_waba` : appelle `POST /{waba_id}/subscribed_apps` pour abonner l'app dédiée au WABA (sinon les messages entrants n'arrivent pas).

### 6. Envoi des messages — vérification

Audit rapide de `send-whatsapp-message`, `send-whatsapp-media`, `send-whatsapp-audio`, `send-whatsapp-reaction`, `whatsapp-templates-manage`, `whatsapp-call-*` : tous chargent déjà `whatsapp_config` par `workspace_id`. **Aucun changement** — ils utiliseront automatiquement le `access_token` + `phone_number_id` du workspace (dédié ou global).

### 7. Isolation stricte réception

Le trigger `handle_inbound_whatsapp` et l'insert dans `whatsapp_messages` utilisent déjà `workspace_id`. La RLS sur `whatsapp_messages` filtre par membre de workspace. **Aucun message ne peut fuir** d'un workspace à l'autre tant que le webhook insère avec le bon `workspace_id` (déduit du `phone_number_id`).

### 8. Non-régression

- Facebook Login, Pages, Lead Forms, import leads Meta : **zéro modification**. Le bloc OAuth Meta actuel reste en place pour ces usages.
- Workspaces existants : `connection_mode` par défaut = `'global'` → comportement actuel préservé. Migration progressive workspace par workspace.

## Détails techniques

**Fichiers modifiés**
- Migration SQL : `ALTER TABLE whatsapp_config` (colonnes + index sur `phone_number_id` déjà présent).
- `supabase/functions/whatsapp-webhook/index.ts` : sélection du secret HMAC selon `connection_mode`.
- `supabase/functions/whatsapp-config-manage/index.ts` : actions `save_dedicated`, `test_dedicated`, `subscribe_waba`.
- `src/pages/SettingsIntegrationsPage.tsx` : intégration de la nouvelle section.
- Nouveaux composants : `src/components/settings/WhatsAppDedicatedAppCard.tsx`, `WhatsAppDedicatedAppGuide.tsx`.

**Sécurité**
- `app_secret` et `access_token` stockés en clair dans Postgres comme aujourd'hui (RLS = owner du workspace uniquement). Acceptable au vu de l'architecture existante.
- HMAC obligatoire : si `connection_mode='dedicated'` et `app_secret` manquant → reject 403.

**Hors scope**
- Embedded Signup multi-tenant (flow OAuth WhatsApp). Reste possible plus tard via une 2ᵉ action `save_via_embedded_signup` qui pousse dans les mêmes colonnes.
- Rotation automatique du token (les tokens permanents System User n'expirent pas).
