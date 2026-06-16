---
name: Per-workspace notification mute
description: Per-user, per-workspace notification toggles (email, push, whatsapp) stored in user_workspace_notification_prefs. Default ON. Workspace owners can also override prefs for any member of their workspace.
type: feature
---
Table `user_workspace_notification_prefs(user_id, workspace_id, email_enabled, push_enabled, whatsapp_enabled)` PK (user_id, workspace_id). Default (no row) = all channels ON.

RLS:
- Users manage their own row (SELECT/INSERT/UPDATE/DELETE where user_id = auth.uid()).
- Workspace owners can manage prefs of any member of their workspace via `is_workspace_owner(workspace_id, auth.uid())` policies.

UI:
- `src/components/settings/WorkspaceNotificationPrefs.tsx` — self-service per workspace (Email/Push/WhatsApp switches) in SettingsNotificationsPage.
- `src/components/settings/MemberNotificationControls.tsx` — owner-side inline switches (Email/Push/WhatsApp) rendered per member in `SettingsWorkspacesPage` MembersList (only when `canManage`).

Edge functions use `_shared/notificationPrefs.ts#getMutedUserIds(admin, workspaceId, userIds, "email"|"push"|"whatsapp")` to filter recipients. Filter applied in:
- notify-new-lead (email + push)
- handle-booking (email + push members)
- detect-booking-from-conversation (email + owner push)
- whatsapp-webhook (3 push call sites)

Add `"whatsapp"` filtering at WhatsApp send sites if/when team notifications go out via WA.
