## 1. Fix "Rattraper 7 derniers jours"

Diagnostic probable : le backfill lit `meta_capi_configs` par `workspace_id` mais si `cfg.access_token`/`dataset_id` sont vides, la boucle échoue silencieusement lead par lead ; et l'erreur toast affiche `error.message` de `functions.invoke` qui renvoie juste "non-2xx status code" sans détail.

À faire :
- **`supabase/functions/meta-capi-send/index.ts`** (branche `backfill`) :
  - valider `cfg.dataset_id` + `cfg.access_token` avant la boucle, retourner 400 avec message clair si manquant.
  - retourner aussi `errors: [{lead_id, status, message}]` (max 5) pour affichage.
  - wrapper `sendEventForLead` avec try/catch qui retourne l'erreur au lieu de la propager.
- **`src/components/settings/MetaCapiSection.tsx`** :
  - lire le vrai détail via `FunctionsHttpError` (`error.context.text()`) et l'afficher dans le toast.
  - si `sent === 0 && failed > 0`, afficher aussi le premier message d'erreur retourné.

## 2. Récap coûts par campagne (funnel Meta)

Sous le tableau `MetaCampaignsSection` sur le Dashboard, ajouter une section **"Coûts par étape du funnel"** par campagne : CPL, coût / RDV booké, coût / RDV fait (proposition), coût / client signé.

Attribution utilisée : `leads.meta_campaign_id` (déjà stocké). Depuis chaque lead on chaîne :
- **RDV bookés** = `bookings` liés au lead sur la période (créés dans la période).
- **RDV faits (propositions)** = `bookings.show_status = 'Show'`.
- **Clients signés** = `clients` créés depuis ces leads (via `clients.lead_id` ou `leads.status = 'won'`) sur la période.

À faire :
- **`supabase/functions/meta-ads-insights/index.ts`** :
  - après avoir compté `crmLeadsByCampaign`, agréger 3 maps supplémentaires par `meta_campaign_id` :
    - `bookedByCampaign` (jointure `bookings` ↔ `leads` sur la période)
    - `showedByCampaign` (`bookings.show_status = 'Show'`)
    - `signedByCampaign` (`clients` liés aux leads de la campagne, ou `leads.status='won'` selon ce qui existe)
  - retourner `booked_count`, `showed_count`, `signed_count` et les coûts calculés (`spend / count`) dans chaque objet campagne.
- **`src/hooks/useMetaCampaigns.ts`** : étendre le type retourné avec les nouveaux champs.
- **`src/components/dashboard/MetaCampaignsSection.tsx`** : sous le tableau existant, ajouter un bloc "Funnel" par campagne (grid 4 colonnes : CPL / coût RDV booké / coût RDV fait / coût client) avec le compteur au-dessus du coût. Style aligné sur le design existant (glass-card, tokens neon).

## 3. Créneaux configurables + durée = temps bloqué

Aujourd'hui : les slots sont générés toutes les 60 min (`t += 60`) et la durée du RDV bloque les slots qui overlap un `busy`. L'utilisateur veut choisir l'incrément (15/30/45/60) indépendamment de la durée. La logique d'overlap est déjà correcte, il suffit d'ajouter le pas.

À faire :
- **Migration** : `ALTER TABLE availability_settings ADD COLUMN slot_interval_minutes int NOT NULL DEFAULT 60;` avec check `slot_interval_minutes IN (15, 30, 45, 60)`.
- **`supabase/functions/check-availability/index.ts`** et **`landing-availability/index.ts`** :
  - lire `slot_interval_minutes`, le passer à `generateHourlySlots` (renommer `generateSlots(startTime, endTime, durationMin, stepMin)` — le pas remplace le `+= 60` en dur).
  - garder la vérification d'overlap `slotStart < busyEnd && slotEnd > busyStart` telle quelle → un RDV existant bloquera automatiquement tous les slots qui chevauchent sa durée réelle.
- **`src/hooks/useAvailabilitySettings.ts`** : ajouter `slot_interval_minutes` au type + default 60.
- **`src/components/bookings/AvailabilityPanel.tsx`** : ajouter un `Select` "Espacement des créneaux" (15/30/45/60 min) à côté du champ durée. Persister dans l'upsert.

## Fichiers touchés

Backend
- `supabase/functions/meta-capi-send/index.ts`
- `supabase/functions/meta-ads-insights/index.ts`
- `supabase/functions/check-availability/index.ts`
- `supabase/functions/landing-availability/index.ts`
- Nouvelle migration SQL (colonne `slot_interval_minutes`)

Frontend
- `src/components/settings/MetaCapiSection.tsx`
- `src/components/dashboard/MetaCampaignsSection.tsx`
- `src/hooks/useMetaCampaigns.ts`
- `src/components/bookings/AvailabilityPanel.tsx`
- `src/hooks/useAvailabilitySettings.ts`

## Hors périmètre
- Pas de re-attribution rétroactive des leads sans `meta_campaign_id`.
- Pas de coût par ad/adset (uniquement niveau campagne, comme le tableau actuel).
