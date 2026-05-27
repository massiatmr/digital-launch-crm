# Activation auto WhatsApp Cloud API par workspace (agence multi-clients, mode Dev)

## Contexte
L'agence est admin sur les Business Managers de ses clients. L'OAuth Facebook existant détecte déjà les WABA des clients mais elles ne sont pas utilisables car : (1) pas abonnées à l'app Meta de l'agence, (2) pas de `phone_number_id` stocké. On résout les deux d'un clic avec le token agency (qui contient déjà `whatsapp_business_management`), avec un fallback System User pour les cas où l'abonnement échoue.

## 1. UI — `MetaOAuthPicker` : activation 1-clic des WABA

Dans le picker post-OAuth, pour chaque WABA détectée :
- Liste les **numéros de téléphone** de la WABA (un appel `GET /{waba_id}/phone_numbers` au moment d'ouvrir le picker)
- Pour chaque numéro : badge statut (`Non connecté` / `Connecté ici` / `Connecté ailleurs`) + bouton **"Activer dans ce workspace"**
- Au clic → invoke edge function `whatsapp-activate-waba` qui :
  1. `POST /{waba_id}/subscribed_apps` avec le token agency → abonne la WABA à l'app
  2. Récupère `phone_number_id` + nom d'affichage
  3. Upsert dans `whatsapp_config` du workspace courant (token agency + phone_number_id + waba_id + display_name + app_secret depuis env)
  4. Retourne `{ ok, error? }`
- En cas d'échec (permission refusée par le BM client, WABA déjà claim par une autre app, etc.) → toast d'erreur + bouton **"Configurer manuellement (System User)"** qui ouvre le mini-wizard fallback

## 2. Mini-wizard fallback (`WhatsAppSystemUserWizard.tsx`)
Sheet 4 étapes, chacune avec capture/lien direct vers le BM du client :
1. Aller dans **Business Manager > Users > System Users** du client → "Add" → nom suggéré "DigitalLaunch CRM" → rôle Admin
2. Cliquer **"Add Assets"** → sélectionner la WABA + l'app `Digital Launch CRM`
3. **"Generate Token"** → cocher `whatsapp_business_messaging` + `whatsapp_business_management` → expiration "Never" → copier
4. Coller le token + sélectionner le numéro dans un dropdown (rempli par appel API avec le token saisi)
→ Submit invoke `whatsapp-activate-waba` avec `manual_token: true`, qui fait le `subscribed_apps` + stocke en DB.

## 3. Bouton "?" Help — Guide WhatsApp complet (`WhatsAppHelpDialog.tsx`)
Dialog accordéon avec sections :
- **Activation auto** : explique le flux 1-clic et ce que ça fait techniquement
- **Activation manuelle (System User)** : repris du wizard, version détaillée
- **Limites mode Dev** : quotas (1000 conv/24h, ~5 WABA), quand passer en Live, lien App Review
- **Compteur consommation** : appel `GET /{app_id}/conversations_analytics` → affiche `X / 1000 conversations utilisées (24h glissantes)` avec barre de progression + warning si > 80%
- **Webhook** : confirme que l'URL est gérée côté plateforme (rien à faire côté client)
- **Dépannage** : "WABA Connecté ailleurs" → contacter Digital Launch ; "Permission refusée" → re-vérifier rôle Admin BM ; "Numéro déjà utilisé par WhatsApp Business app mobile" → migrer vers Cloud API

## 4. Backend

### `whatsapp-activate-waba` (nouvelle edge function)
- Input : `{ workspace_id, waba_id, phone_number_id, manual_token? }`
- Vérifie que l'user est membre du workspace
- Récupère le token : soit `manual_token`, soit le token agency stocké dans `meta_oauth_tokens` (ou équivalent) de l'user
- Appelle `POST https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps` avec le token
- Si OK → fetch `GET /{phone_number_id}?fields=display_phone_number,verified_name`
- Upsert `whatsapp_config` (workspace_id, phone_number_id, waba_id, access_token, app_secret, display_name, business_name, connected_at)
- Retourne erreur précise pour driver le fallback côté UI

### `whatsapp-app-usage` (nouvelle edge function, lecture seule)
- Appelle Graph API pour compter les conversations actives sur les dernières 24h de l'app
- Cache 5 min (sinon spam)
- Utilisé par le compteur du Help

### `whatsapp-webhook` (existant)
- Vérifier qu'il route bien par `phone_number_id` → workspace via `whatsapp_config`
- Valider signature avec `app_secret` (env partagé, c'est la même app Meta agence)

## 5. Migration DB
Ajouter à `whatsapp_config` si manquant :
- `display_name`, `business_name`, `verified_name`, `connected_at`, `last_health_check_at`, `health_status` (text: 'ok' | 'subscription_failed' | 'token_expired')

Pas de nouvelle table. RLS owner/workspace existante conservée.

## 6. Fichiers touchés
- `supabase/migrations/...` — colonnes additives sur `whatsapp_config`
- `supabase/functions/whatsapp-activate-waba/index.ts` — nouveau
- `supabase/functions/whatsapp-app-usage/index.ts` — nouveau
- `supabase/functions/whatsapp-webhook/index.ts` — vérif routing multi-workspace
- `src/components/settings/MetaOAuthPicker.tsx` — ajout liste numéros + bouton activation
- `src/components/settings/WhatsAppSystemUserWizard.tsx` — nouveau (fallback)
- `src/components/settings/WhatsAppHelpDialog.tsx` — nouveau (bouton "?")
- `src/pages/SettingsIntegrationsPage.tsx` — intégration du bouton "?" + compteur usage

## Notes techniques
- L'`app_secret` Meta reste un secret global de l'app agency (pas par workspace)
- Le token utilisé pour envoyer/recevoir = le token user agency tant que sa session OAuth est valide ; si expiration → fallback System User devient nécessaire (à terme, prévoir refresh). Pour démarrer : on stocke le long-lived token (60j) du user agency par workspace
- Le mode Dev limite à ~5 WABA actives simultanément sur l'app ; au-delà l'App Review devient inévitable (le compteur Help le rendra visible)
