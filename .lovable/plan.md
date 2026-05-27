# Connexion manuelle WhatsApp via System User (workspaces clients agence)

## Objectif
Permettre de connecter le numéro WhatsApp HKSN (et tout futur client) au CRM en collant un **token System User** généré dans le Business Manager du client, sans passer par l'OAuth Facebook (qui mélange les permissions du profil agence).

## UX — Settings → Intégrations

À côté du bouton "Connecter Facebook" actuel, ajouter un bouton secondaire **"Connecter manuellement (System User)"** (visible toujours, mais surtout utile sur les workspaces clients).

Au clic → ouvre un **Sheet wizard 4 étapes** (`WhatsAppSystemUserWizard.tsx`, fichier déjà présent à étoffer) :

### Étape 1 — Créer le System User
Instructions + capture annotée :
- Aller sur `business.facebook.com` → BM du client → Business Settings → Users → **System Users** → Add
- Nom suggéré : `DigitalLaunch CRM`, rôle **Admin**
- Lien direct vers la page

### Étape 2 — Attacher les assets
- Add Assets → sélectionner la **WABA** (Full control)
- Add Assets → l'app **Digital Launch CRM** (Full control)
- Note explicative : "Si l'app n'apparaît pas, demande-nous de partager l'app avec votre BM"

### Étape 3 — Générer le token
- Generate Token → app `Digital Launch CRM`
- Scopes : `whatsapp_business_messaging` + `whatsapp_business_management`
- Expiration : **Never**
- Copier le token

### Étape 4 — Coller et sélectionner
- Input texte : coller le token
- Bouton **"Vérifier le token"** → appelle l'edge function `whatsapp-activate-waba` en mode `discover`
- Affiche la liste des **WABA + numéros** trouvés via Graph API
- L'utilisateur sélectionne le bon numéro (HKSN dans ce cas)
- Bouton **"Connecter"** → la même edge function en mode `activate` :
  1. `POST /{waba_id}/subscribed_apps` pour abonner l'app aux webhooks
  2. `GET /{phone_number_id}?fields=display_phone_number,verified_name`
  3. Upsert dans `whatsapp_config` du `workspace_id` courant
  4. Retour succès → toast + ferme le sheet + refresh de la section WhatsApp

## Backend

### `supabase/functions/whatsapp-activate-waba/index.ts` (nouveau)
Inputs :
- `{ workspace_id, mode: 'discover', token }` → retourne `[{ waba_id, waba_name, numbers: [{ id, display_phone_number, verified_name }] }]`
- `{ workspace_id, mode: 'activate', token, waba_id, phone_number_id }` → fait subscribe + upsert config

Sécurité :
- Vérifier que l'utilisateur appelant est **membre admin du workspace** ciblé (via `workspace_members`)
- Stocker le token dans `whatsapp_config.access_token` (colonne déjà existante)
- Stocker également `system_user: true` (nouvelle colonne booléenne) pour distinguer des tokens OAuth user (qui expirent à 60j)

Gestion d'erreurs Meta typiques :
- `(#10) Application does not have permission` → message "Le System User n'a pas accès à l'app, retournez à l'étape 2"
- `(#100) phone_number_id invalid` → message "Numéro introuvable, le token a peut-être perdu l'accès à la WABA"
- Token invalide → message clair "Token rejeté par Meta"

### Migration DB
Sur `whatsapp_config`, ajouter si absent :
- `system_user boolean default false`
- `connected_at timestamptz default now()`
- `display_name text`, `verified_name text` (si pas déjà là)

Pas de modif RLS — la table reste scopée par `workspace_id`.

### Webhook existant
`whatsapp-webhook` route déjà par `phone_number_id` → `workspace_id` via `whatsapp_config`. Aucune modif nécessaire : un nouveau numéro avec son `phone_number_id` distinct est automatiquement routé vers le bon workspace.

## Coexistence avec l'OAuth Facebook existant

- Le bouton OAuth Facebook reste pour Digital Launch (tes propres numéros)
- Pour les workspaces clients, on recommande le wizard System User (ajout d'un petit texte explicatif dans la section)
- Les deux flux écrivent dans la **même table** `whatsapp_config`, donc l'inbox, l'envoi, et tout le reste fonctionnent à l'identique

## Fichiers touchés

- `supabase/migrations/...` — colonnes additives sur `whatsapp_config`
- `supabase/functions/whatsapp-activate-waba/index.ts` — nouvelle edge function
- `src/components/settings/WhatsAppSystemUserWizard.tsx` — wizard 4 étapes (étoffer le composant existant)
- `src/pages/SettingsIntegrationsPage.tsx` — ajout du bouton "Connecter manuellement" + appel du wizard
- `src/components/settings/WhatsAppHelpDialog.tsx` — référencer la méthode System User dans le help (si déjà ouvert)

## Hors scope
- App Review Meta (mode Dev suffit pour < 5 WABA actives)
- Refresh automatique de token (le System User token = never expire, donc pas besoin)
- Migration des connexions OAuth existantes vers System User (à la demande plus tard)
