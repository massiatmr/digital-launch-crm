# Dashboard Meta Ads — Campagnes, Leads et Coût par Lead

## Objectif

Ajouter une section "Campagnes Meta Ads" sur le Dashboard qui affiche, pour chaque page Facebook connectée du workspace actif :
- la liste des campagnes (statut ACTIVE / PAUSED)
- le nombre de leads reçus depuis chaque campagne
- la dépense et le coût par lead (CPL)
- un toggle pour inclure les campagnes désactivées

Période synchronisée avec le sélecteur de période existant du Dashboard (7j, 30j, 90j, etc.).

## Ce qui est en place

- Pages Facebook connectées via OAuth dans `meta_pages` (avec `page_access_token`).
- Scopes OAuth déjà demandés : `pages_manage_ads` et `business_management` (pas encore `ads_read`, à ajouter).
- Webhook Facebook Lead Ads écrit les leads avec `source = 'facebook'` mais ne stocke pas encore `ad_id` / `campaign_id`.

## Plan d'implémentation

### 1. Base de données (migration)

Ajouter sur `leads` les colonnes d'attribution Meta :
- `meta_ad_id text`
- `meta_adset_id text`
- `meta_campaign_id text`
- `meta_form_id text` (déjà partiellement présent côté webhook, on persiste explicitement)
- `meta_page_id text`

Index combiné `(workspace_id, meta_campaign_id, created_at)` pour les agrégations dashboard.

Créer une table de cache pour éviter d'appeler l'API Meta à chaque chargement :
```
meta_campaigns_cache (
  id uuid pk,
  workspace_id uuid,
  page_id text,
  campaign_id text,
  campaign_name text,
  status text,           -- ACTIVE / PAUSED / ARCHIVED
  objective text,
  daily_budget numeric,
  fetched_at timestamptz
)
meta_campaign_insights_cache (
  id uuid pk,
  workspace_id uuid,
  campaign_id text,
  date_from date,
  date_to date,
  spend numeric,
  impressions int,
  clicks int,
  leads_meta int,        -- leads comptés par Meta
  fetched_at timestamptz
)
```

RLS : lecture/écriture limitée au workspace (mêmes patterns que `meta_pages`).

### 2. Scope OAuth

Ajouter `ads_read` à `facebook-auth-init/index.ts`. Les utilisateurs déjà connectés devront se reconnecter une fois pour autoriser ce scope (badge déjà existant pour reconnexion).

### 3. Webhook Facebook Lead Ads

Dans `facebook-webhook/index.ts`, lors de la récupération du lead via Graph API, persister sur la ligne insérée :
- `meta_ad_id`, `meta_adset_id`, `meta_campaign_id`, `meta_form_id`, `meta_page_id`

(Ces champs sont déjà retournés par l'endpoint `/{lead_id}` quand on demande les champs `ad_id,adset_id,campaign_id,form_id`.)

### 4. Nouvelle edge function `meta-ads-insights`

Authentifiée (JWT user). Paramètres : `workspace_id`, `date_from`, `date_to`, optionnel `include_paused`.

Logique :
1. Charger `meta_pages` du workspace avec `token_valid = true`.
2. Pour chaque page, appeler `GET /{page_id}/?fields=...` puis parcourir les ad accounts liés via `business_management` ou directement `/{page_id}/leadgen_forms` + `/act_{account_id}/campaigns`.
3. Récupérer `campaigns?fields=id,name,status,objective,daily_budget&effective_status=...` (filtrer ACTIVE/PAUSED selon toggle).
4. Récupérer `insights?fields=spend,impressions,clicks,actions&time_range={...}&level=campaign`.
5. Mettre à jour `meta_campaigns_cache` et `meta_campaign_insights_cache` (TTL 30 min — si `fetched_at` récent, retourner le cache directement).
6. Calculer côté SQL le nb de leads CRM par `meta_campaign_id` dans la période, puis renvoyer un JSON :
```
[{
  campaign_id, campaign_name, status, page_name,
  spend, currency, leads_crm, leads_meta,
  cpl_crm, cpl_meta
}]
```

Si une page a son `token_valid = false`, on saute et on remonte un flag `needs_reconnect` au front.

### 5. Frontend Dashboard

Nouvelle section dans `src/pages/Dashboard.tsx`, sous les KPIs existants :

```text
┌─ Campagnes Meta Ads ──────────────── [✓ Actives uniquement] [↻] ┐
│ Page          Campagne         Statut   Leads  Dépense   CPL   │
│ Digital L.    Déménageurs FR   ACTIVE     12   240 €    20 €   │
│ Digital L.    B2B SaaS         PAUSED      3    45 €    15 €   │
│ HKSN          Coachs Sport     ACTIVE      8   180 €    22 €   │
└─────────────────────────────────────────────────────────────────┘
```

- Composant `<MetaCampaignsSection workspaceId={...} period={...} />`.
- Hook `useMetaCampaigns(workspaceId, dateRange, includePaused)` qui appelle l'edge function via `supabase.functions.invoke`.
- Toggle Switch shadcn "Inclure désactivées" (off par défaut).
- Bouton refresh manuel (force-refresh côté edge function).
- État vide propre :
  - aucune page Meta connectée → CTA "Connecter Meta" → `/settings/integrations`
  - token expiré → bandeau orange "Reconnecter Meta"
  - aucune campagne sur la période → message neutre.
- Mobile : passage en stack de cards au lieu du tableau.

Style : `glass-card`, mono pour les chiffres (Geist Mono déjà en place), badge purple/gris pour le statut.

### 6. Mémoire projet

Ajouter `mem://features/dashboard/meta-ads-insights` documentant : scopes requis, tables cache (TTL 30min), attribution via `meta_campaign_id` sur leads, refresh manuel disponible.

## Limitations connues

- Le CPL CRM ne couvre que les nouveaux leads (avec `meta_campaign_id` rempli) ; les anciens leads n'auront pas l'attribution. Affiché tel quel, avec une note "depuis le déploiement".
- L'API Meta Insights n'est pas temps réel (latence 15-60 min côté Meta).
- Si l'utilisateur n'a pas de compte Business Manager lié à la page, l'API renverra une liste vide → message clair dans l'UI.

## Fichiers touchés

- migration SQL (nouvelles colonnes `leads` + 2 tables cache)
- `supabase/functions/facebook-auth-init/index.ts` (scope `ads_read`)
- `supabase/functions/facebook-webhook/index.ts` (persist ad/campaign ids)
- `supabase/functions/meta-ads-insights/index.ts` (nouvelle)
- `src/pages/Dashboard.tsx` (intégration section)
- `src/components/dashboard/MetaCampaignsSection.tsx` (nouveau)
- `src/hooks/useMetaCampaigns.ts` (nouveau)
