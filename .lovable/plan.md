
The user wants a Settings page where they can connect their Facebook account and manage which Meta Pages and Lead Forms feed leads into the CRM — instead of relying on hardcoded `FB_PAGE_ACCESS_TOKEN` / `FB_LEAD_OWNER_ID` secrets.

Currently:
- `facebook-webhook` uses a single `FB_PAGE_ACCESS_TOKEN` env secret + single `FB_LEAD_OWNER_ID`
- `fb-check-subscription` debugs that single token
- No UI to add/manage pages

## Plan: Meta Integration Settings

### 1. Database (migration)
New table `meta_pages`:
- `id`, `owner_id` (auth.uid), `page_id` (text, unique per owner), `page_name`, `page_access_token` (long-lived), `is_active` (bool), `subscribed` (bool), `forms` (jsonb — cached list of lead forms), `created_at`, `updated_at`
- RLS: owner-only CRUD
- Webhook lookups use service role to find `owner_id` by `page_id`

### 2. Facebook OAuth flow (edge functions)
- **`facebook-auth-init`**: returns Facebook Login URL with scopes `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`, `pages_manage_ads`
- **`facebook-auth-callback`**: exchanges `code` → user access token → fetches `/me/accounts` → stores each page with its long-lived page token in `meta_pages`
- **`facebook-pages-manage`**: authenticated endpoint to:
  - list pages of current user
  - subscribe/unsubscribe a page to the app webhook (`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`)
  - fetch & cache lead forms (`GET /{page-id}/leadgen_forms`)
  - toggle `is_active`, delete page
- Requires new secrets: `FB_APP_ID`, `FB_APP_SECRET` → ask user via add_secret

### 3. Update `facebook-webhook`
- Look up the page in `meta_pages` by `page_id` from webhook payload
- Use its stored `page_access_token` (not the env secret) to fetch lead details
- Use its `owner_id` (not env `FB_LEAD_OWNER_ID`) to assign the lead
- Skip pages where `is_active = false`
- Keep env-secret fallback for backward compatibility during transition

### 4. UI: new `/settings/integrations` page (also add "Paramètres" group in sidebar)
- "Meta / Facebook" card with:
  - "Connecter mon compte Facebook" button → opens OAuth popup
  - List of connected pages: name, page_id, status badge (Abonnée/Non abonnée), toggle active, "S'abonner aux leads" button, "Voir les formulaires" expandable list, delete
  - Webhook URL display (read-only) + "Verify Token" copy field for users who configure it manually in Meta App Dashboard
- Add link in `AppSidebar.tsx` ("Paramètres" → Integrations, Tests)

### 5. Technical details
- Reuse existing redirect pattern from `google-auth` / `google-calendar-callback`
- Tokens stored encrypted-at-rest by Supabase; never expose page tokens client-side (only via authenticated edge function)
- Add notification toasts on subscribe/unsubscribe success

### Required from user
- Facebook App credentials: `FB_APP_ID` + `FB_APP_SECRET` (from developers.facebook.com → My App → Settings → Basic)
- Add OAuth redirect URI in their FB App: `https://rvangzupebrajhhhvewu.supabase.co/functions/v1/facebook-auth-callback`

### Files to create/modify
- **New migration**: `meta_pages` table + RLS
- **New edge functions**: `facebook-auth-init`, `facebook-auth-callback`, `facebook-pages-manage`
- **Modified**: `supabase/functions/facebook-webhook/index.ts` (multi-page lookup)
- **New page**: `src/pages/SettingsIntegrationsPage.tsx`
- **Modified**: `src/App.tsx` (route), `src/components/AppSidebar.tsx` (nav link)
- **Add secrets**: `FB_APP_ID`, `FB_APP_SECRET`
