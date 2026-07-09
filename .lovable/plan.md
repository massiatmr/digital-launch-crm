## Objectif

Meta ne "voit" que 2 leads sur ta campagne Landing alors que le CRM en a 4 : Meta ne sait pas relier les soumissions du site à la pub qui les a générées. On va envoyer un événement **Lead** via l'API Conversions (CAPI) à chaque nouveau lead site + landing, avec les paramètres de matching Meta (fbc / fbp / fbclid, URL, IP, User-Agent) pour ré-attribuer proprement.

Aujourd'hui `meta-capi-send` n'envoie que `QualifiedLead`, `Schedule`, `Purchase`. Rien au moment de la capture → Meta rate l'attribution du signal le plus important.

## Ce qui change

### 1. Config CAPI par workspace
Ajouter un toggle **"Nouveau lead → `Lead`"** dans `meta_capi_configs` (colonne `send_lead boolean default true`) et dans l'écran `MetaCapiSection`. Actif par défaut.

### 2. Capture des cookies Meta côté site (landing + form)
Pour que Meta ré-attribue au bon clic pub, on stocke sur chaque lead les identifiants de matching :

- `fbc` (cookie `_fbc`) ou reconstruit depuis `fbclid` en URL
- `fbp` (cookie `_fbp`)
- `page_url`, `user_agent`, `client_ip` (côté edge function)

Ces valeurs arrivent déjà partiellement via `ingest-lead` (payload `utm`, `page_url`). On étend :

- **`ingest-lead`** : lit `body.fbc`, `body.fbp`, `body.fbclid`, `body.page_url`, `req.headers['user-agent']`, `x-forwarded-for` → stocke dans `leads.metadata` (`fbc`, `fbp`, `event_source_url`, `client_user_agent`, `client_ip_address`).
- **`landing-book`** : idem sur la création du lead depuis la landing.
- **Snippet client** à coller sur les landings externes (fourni dans `LandingApiKeysSection` en plus du code d'ingestion existant) : lit `document.cookie` pour `_fbc`/`_fbp`, prend `fbclid` de `location.search`, `location.href` en `page_url`, et pousse dans le POST vers `/ingest-lead` et `/landing-book`.

### 3. Envoi de l'événement `Lead` à la création
Dans `ingest-lead` (branche "nouveau lead" uniquement, jamais sur dédup) et dans `landing-book`, on invoque `meta-capi-send` en fire-and-forget avec `event_name = "Lead"` juste après l'insert.

Dans `meta-capi-send` :

- accepter la nouvelle constante `Lead` et respecter `cfg.send_lead`.
- passer `action_source = "website"` quand l'événement vient d'une page (Lead / Schedule côté site), garder `system_generated` pour QualifiedLead/Purchase.
- ajouter au `user_data` les champs de matching s'ils sont présents dans `lead.metadata` : `fbc`, `fbp`, `client_ip_address`, `client_user_agent`.
- ajouter `event_source_url` dans le payload racine (obligatoire pour `action_source=website`).
- générer un `event_id` déterministe (`lead:<lead_id>:Lead`) pour dédupliquer si un pixel côté client envoie aussi le même event.

### 4. Rétro-attribution des leads existants
Un bouton "Renvoyer les événements Lead à Meta" dans `MetaCapiSection` qui appelle une nouvelle route de `meta-capi-send` (`{ backfill: true, workspace_id }`) : itère les leads du workspace créés dans les 7 derniers jours qui n'ont pas encore de flag `metadata.capi_lead_sent`, envoie `Lead`, et marque le lead. Permet de rattraper les 2 leads manquants de la campagne actuelle.

## Fichiers touchés

- Migration SQL : `ALTER TABLE meta_capi_configs ADD COLUMN send_lead boolean NOT NULL DEFAULT true;`
- `supabase/functions/meta-capi-send/index.ts` — support event `Lead`, `action_source=website`, fbc/fbp/ip/UA/event_source_url, `event_id`, mode `backfill`.
- `supabase/functions/ingest-lead/index.ts` — capture fbc/fbp/fbclid/UA/IP/URL dans `metadata`, invoke CAPI `Lead` sur insert.
- `supabase/functions/landing-book/index.ts` — même capture + invoke CAPI `Lead` sur création du lead.
- `src/components/settings/MetaCapiSection.tsx` — nouveau toggle "Nouveau lead → Lead" et bouton "Rattraper les 7 derniers jours".
- `src/components/settings/LandingApiKeysSection.tsx` — enrichir le snippet fourni à l'utilisateur pour inclure `_fbc`/`_fbp`/`fbclid`/`page_url` dans le POST.

## Hors périmètre

- Leads Facebook Lead Ads : Meta attribue déjà via `lead_id` capté par le webhook, on ne change rien.
- Pixel client (fbq) : reste indépendant ; l'`event_id` déterministe permettra à Meta de dédupliquer si un pixel Lead est aussi tiré côté navigateur.
