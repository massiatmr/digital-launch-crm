# Calendrier par workspace + multi-providers

Chantier en 3 phases. Chaque phase est livrable indépendamment.

## Phase 1 — Migration vers workspace (base)

**Tables migrées (ajout `workspace_id` + RLS workspace) :**
- `availability_settings` : devient unique par workspace (au lieu de par owner). Migration : on copie les settings du owner du workspace vers une ligne workspace_id.
- `availability_blackouts` : ajout `workspace_id`, RLS = membres du workspace.
- `google_tokens` → renommé en `calendar_accounts` (cf phase 2). Pour phase 1 : ajout `workspace_id` + RLS.

**RPC mises à jour :**
- `get_availability_for_offer` / FreeBusy : résolvent les settings via `offer.workspace_id` au lieu du `owner_id`.

**Edge functions touchées :**
- `bookings-availability`, `create-booking-from-public-page`, `google-calendar-*` : passent par `workspace_id` (résolu via l'offer ou le lead).

**UI :**
- `/settings/calendar` : tous les réglages (horaires, slots, blackouts, lien public) deviennent workspace-scoped. Lecture seule si l'utilisateur n'est pas owner du workspace.

## Phase 2 — Abstraction multi-providers

**Nouvelle table `calendar_accounts` (remplace `google_tokens`) :**

| col | type |
|---|---|
| id | uuid PK |
| workspace_id | uuid (non null) |
| provider | enum `google` \| `microsoft` \| `caldav` \| `ical` |
| display_name | text |
| is_primary | bool (1 seul primary par workspace = celui qui crée les events) |
| credentials | jsonb chiffré côté edge (refresh_token / app_password / ics_url) |
| calendar_id | text (ex: 'primary', email Outlook, URL CalDAV) |
| sync_freebusy | bool default true |
| created_by | uuid |
| created_at / updated_at |

Migration des `google_tokens` existants → `calendar_accounts` avec `provider='google'`, `workspace_id` = workspace solo de l'utilisateur.

**Abstraction code :**
- `supabase/functions/_shared/calendar/` : un fichier par provider (`google.ts`, `microsoft.ts`, `caldav.ts`, `ical.ts`) exposant `{ getFreeBusy, createEvent, updateEvent, deleteEvent }`.
- `getFreeBusy(workspace_id, range)` agrège tous les comptes du workspace (lecture seule pour ical).
- `createEvent` n'écrit que sur le compte `is_primary = true`.

## Phase 3 — Connexion des providers

**Google :** déjà OK, juste rebranché sur workspace.

**Microsoft Outlook :**
- OAuth 2.0 Microsoft Identity (per-user, via app Azure AD à créer par toi).
- Edge functions `microsoft-oauth-start` / `microsoft-oauth-callback`.
- Secrets : `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, redirect URI à configurer.

**CalDAV / iCloud :**
- Form UI : URL serveur + email + mot de passe d'application.
- Edge function `caldav-test-connection` (PROPFIND).
- Pour iCloud : URL fixe `https://caldav.icloud.com/`.

**Flux iCal (.ics) :**
- Simple input URL, on parse côté edge avec un parseur ICS (npm `node-ical` via esm.sh).
- Synchro 1×/h via pg_cron (cache busy slots dans `calendar_external_busy`).

**UI `/settings/calendar/accounts` :**
- Liste des comptes connectés du workspace + bouton "Ajouter un agenda" (4 cards : Google, Microsoft, iCloud/CalDAV, Lien iCal).
- Toggle `is_primary` (radio, 1 seul).
- Toggle `sync_freebusy` par compte.

## Détails techniques

**Sécurité :**
- RLS toutes tables : `is_workspace_member(workspace_id, auth.uid())` pour SELECT, `is_workspace_owner(...)` pour UPDATE/DELETE des credentials.
- Credentials stockés chiffrés via une clé `CALENDAR_ENCRYPTION_KEY` (AES-GCM côté edge) — pour iCloud app password notamment.

**Bookings :**
- `bookings.workspace_id` est déjà là → ne change pas.
- L'event externe est créé sur le compte `is_primary` du workspace au moment du booking.

**Compat ascendante :**
- Les comptes Google existants restent fonctionnels (migration auto vers `calendar_accounts`).
- Si un workspace n'a aucun `calendar_account`, le booking est créé sans event externe (comme aujourd'hui sans Google connecté).

## Étapes d'exécution

1. **Migration SQL phase 1** (workspace_id + RLS) — je créerai la migration et attendrai validation.
2. Edge functions + UI `/settings/calendar` adaptées.
3. **Migration SQL phase 2** (table `calendar_accounts` + backfill depuis `google_tokens`).
4. Refacto edge functions vers l'abstraction `_shared/calendar`.
5. Phase 3 : Microsoft (OAuth + secrets) puis CalDAV puis iCal, livrés un par un.

Je commence par la phase 1 si tu valides. Tu veux que je découpe en 3 livraisons séparées ou que j'enchaîne ?
