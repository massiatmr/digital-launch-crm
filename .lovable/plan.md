# Rappels WhatsApp automatiques pour les RDV

## Objectif
Dans **Bookings → Notifications & rappels**, ajouter la possibilité d'envoyer des **messages WhatsApp via template HSM** au lead pour : confirmation, J-24h, J-12h, J-1h (mêmes moments que les emails actuels). Les templates HSM sont obligatoires hors fenêtre 24h, donc on s'appuie sur ceux déjà synchronisés dans `whatsapp_templates`.

## 1. Base de données

### Nouvelle table `workspace_booking_wa_templates` (config par workspace)
Une ligne par type de rappel (`confirmation`, `24h_before`, `12h_before`, `1h_before`).
- `workspace_id` (FK workspaces, cascade)
- `type` (enum `booking_email_type` réutilisé)
- `enabled` (bool, default false)
- `template_id` (FK `whatsapp_templates`, nullable — la ligne peut exister activée mais non configurée)
- `language` (text, default 'fr')
- `variables_map` (jsonb) — mapping `{ "1": "{{name}}", "2": "{{date}}", "3": "{{time}}" }` (clés = numéro de variable Meta, valeurs = placeholders)
- Unique `(workspace_id, type)`
- Grants `authenticated` (SELECT/INSERT/UPDATE/DELETE) + `service_role`, RLS scoped via `is_workspace_member`

### Nouvelle table `booking_wa_reminders` (file d'envois planifiés)
Calquée sur `booking_emails`.
- `booking_id` (FK bookings, cascade), `type`, `scheduled_at`, `status` ('pending'|'sent'|'failed'|'cancelled'|'skipped'), `sent_at`, `error_message`
- Index sur `(status, scheduled_at)`
- RLS : owner du booking voit, service_role gère tout

## 2. Backend

### Modification `handle-booking/index.ts`
Après l'insert dans `booking_emails`, faire le même insert dans `booking_wa_reminders` avec les 4 mêmes `scheduled_at`. Pas de filtrage côté `handle-booking` : on plannifie systématiquement, le cron filtrera selon `enabled` + présence d'un `phone` sur le lead.

### Nouvelle edge function `process-booking-wa-reminders`
Cron toutes les minutes (pg_cron + `net.http_post`, secret partagé service-role).
Pour chaque `booking_wa_reminders` due :
1. Charge `booking` + `lead` (need `phone`, `workspace_id`)
2. Charge `workspace_booking_wa_templates` pour ce `(workspace_id, type)` : si désactivé ou pas de `template_id`, marque `skipped`
3. Charge `whatsapp_templates` pour récupérer `name` + `business_account_id`
4. Calcule les variables en remplaçant `{{name}}`, `{{date}}`, `{{time}}`, `{{offer_name}}`, `{{meet_url}}` depuis le booking
5. Invoke `send-whatsapp-message` (déjà existante) avec `{ to: lead.phone, template: { name, language, variables: [...] }, lead_id, workspace_id }`
6. Update status `sent` ou `failed` avec `error_message`

### Cron
Job pg_cron `process-booking-wa-reminders-every-minute` via `supabase--insert` (pas migration, contient l'URL projet + service-role).

## 3. UI — `NotificationsTab.tsx`

Nouvelle Card **"Rappels WhatsApp (templates)"** sous "Notifications admin" :

```text
┌─────────────────────────────────────────────────────┐
│ 💬 Rappels WhatsApp                                 │
│ Templates HSM envoyés automatiquement au lead       │
├─────────────────────────────────────────────────────┤
│ ✅ Confirmation       [select template ▾] [⚙ vars] │
│ ⬜ 24h avant          [select template ▾] [⚙ vars] │
│ ⬜ 12h avant          [select template ▾] [⚙ vars] │
│ ✅ 1h avant           [select template ▾] [⚙ vars] │
└─────────────────────────────────────────────────────┘
```

Chaque ligne :
- Switch `enabled`
- Select des templates `APPROVED` pour ce workspace (filtré sur `whatsapp_templates` du `workspace_id` courant)
- Bouton "Variables" → petit popover qui montre les variables du template (`variables_count`) et permet de mapper chacune sur un placeholder : `{{name}}`, `{{date}}`, `{{time}}`, `{{offer_name}}`, `{{meet_url}}`, ou texte fixe

Note d'aide : "Les templates doivent être approuvés par Meta (catégorie UTILITY recommandée). Synchronise-les depuis Settings → Intégrations."

État vide : si aucun WhatsApp connecté → bandeau "Configure d'abord un numéro WhatsApp dans Intégrations" + lien.

### Hook : `useBookingWaTemplates(workspaceId)`
- `query` : select des 4 lignes (auto-init si absentes côté upsert)
- `mutation` : update partiel
- Réutilise React Query.

## 4. Fichiers

- `supabase/migrations/...` — création des 2 tables + grants + RLS + auto-seed des 4 lignes par workspace (trigger ou seed côté hook)
- `supabase/functions/handle-booking/index.ts` — ajout de l'insert WA rappels
- `supabase/functions/process-booking-wa-reminders/index.ts` — nouveau
- `supabase/insert` — cron pg_cron pour appeler la fonction toutes les minutes
- `src/hooks/useBookingWaTemplates.ts` — nouveau
- `src/components/bookings/NotificationsTab.tsx` — ajout de la Card
- `src/components/bookings/WaReminderRow.tsx` — nouveau (row config par type)

## Hors scope
- Préconfiguration / création automatique de templates Meta (l'utilisateur les crée + sync via le flow existant)
- Rappels WhatsApp admin (seulement client pour l'instant — facile à étendre plus tard)
- Logs détaillés UI (le statut sera lisible plus tard via une page Audit dédiée si besoin)
