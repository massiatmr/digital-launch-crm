

L'user veut que les owners de workspace puissent connecter leur Facebook + WhatsApp **sans créer leur propre app Meta**. Donc on utilise UNE SEULE app Meta (la mienne, déjà configurée via `FB_APP_ID`/`FB_APP_SECRET`) et chaque owner fait juste un OAuth login → on récupère ses pages + WhatsApp Business Accounts automatiquement.

État actuel :
- Facebook OAuth est déjà en place (`facebook-auth-init` + `facebook-auth-callback`) avec scopes pages → ✅ marche déjà pour les pages
- WhatsApp est en mode "manuel" : l'user doit copier-coller `phone_number_id`, `business_account_id`, `access_token` depuis sa propre app Meta → ❌ à remplacer par OAuth Embedded Signup

## Plan

### 1. Facebook : étendre l'OAuth existant
Ajouter les scopes WhatsApp + Instagram + business management au flow OAuth existant pour tout faire en 1 connexion :
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management`

Améliorer `facebook-auth-callback` : après récupération du user token, **aussi** récupérer les WhatsApp Business Accounts (`/me/businesses` → `owned_whatsapp_business_accounts` → `phone_numbers`) et les enregistrer automatiquement dans `whatsapp_config` scopés au workspace.

### 2. WhatsApp : flow simplifié "Embedded Signup"
Remplacer le formulaire manuel actuel (phone_number_id / business_account_id / access_token) par :
- **Bouton unique "Connecter WhatsApp avec Facebook"** → lance le même OAuth Facebook avec scopes WA
- Le callback détecte les WABA disponibles, les sauvegarde et permet à l'user de choisir le numéro à activer
- Auto-subscribe au webhook après sélection

Si plusieurs numéros disponibles → écran de sélection. Sinon auto-config.

### 3. UI `/settings/integrations`
- **Carte Facebook** : 1 bouton "Connecter Meta" (pages + WA en une fois)
- **Carte WhatsApp** : 
  - Si pas connecté → message "Connecte Meta d'abord" + bouton vers la carte Facebook
  - Si connecté → liste des numéros WA détectés avec toggle activer/désactiver, status webhook, test send
  - Plus de champs manuels (gardés en fallback "mode avancé" repliable)

### 4. Edge functions à modifier
- `facebook-auth-init` : ajouter les scopes WhatsApp
- `facebook-auth-callback` : après pages, fetch WABA + phone numbers → upsert dans `whatsapp_config` (workspace-scoped, plusieurs lignes possibles)
- `whatsapp-config-manage` : nouvelle action `list_detected_numbers` (renvoie tous les numéros détectés du workspace), action `activate_number` (set `is_active=true` + subscribe webhook)

### 5. DB
Le schema actuel a `whatsapp_config` avec unique `workspace_id` → il faut **lever cette contrainte** pour permettre plusieurs numéros par workspace, et ajouter un champ `is_primary` ou utiliser `is_active` pour distinguer le numéro courant utilisé pour l'envoi.

Migration : drop unique `whatsapp_config_workspace_id_unique`, recréer unique sur `(workspace_id, phone_number_id)`.

### 6. Prérequis Meta côté toi (admin)
Pour que ça marche pour TOUT le monde sans App Review, ton app Meta doit être en mode :
- **Live mode** + **Advanced Access** approuvé pour : `pages_show_list`, `pages_manage_metadata`, `leads_retrieval`, `whatsapp_business_management`, `whatsapp_business_messaging`
- Sinon → seuls les users ajoutés en testeurs/devs sur l'app pourront connecter

Note : tant que l'App Review WhatsApp n'est pas approuvée, seuls toi + comptes ajoutés comme testeurs pourront connecter WA. Pour Facebook Pages c'est probablement déjà ok.

## Récap technique
- 1 OAuth = pages FB + WhatsApp en même temps
- Auto-detect tous les numéros WA et pages, sauvegarde scopée au workspace
- UI simplifiée : 1 bouton, plus de copier-coller de tokens
- Plusieurs numéros WA par workspace supportés

