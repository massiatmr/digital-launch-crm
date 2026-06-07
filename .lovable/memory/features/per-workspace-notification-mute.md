---
name: Per-workspace notification mute
description: Each user can mute email/push notifications per workspace via user_workspace_notification_prefs; default enabled; filtered in notify-new-lead, handle-booking, detect-booking-from-conversation, whatsapp-webhook via _shared/notificationPrefs.ts.
type: feature
---
Table `user_workspace_notification_prefs(user_id, workspace_id, email_enabled, push_enabled)` PK (user_id, workspace_id). Owner-only RLS (user_id = auth.uid()). Default (no row) = both channels ON.

UI: `src/components/settings/WorkspaceNotificationPrefs.tsx` listed in SettingsNotificationsPage. Switches per workspace, upsert on toggle.

Edge functions use `_shared/notificationPrefs.ts#getMutedUserIds(admin, workspaceId, userIds, "email"|"push")` to filter recipients (members + owner). Filter applied in:
- notify-new-lead (email + push)
- handle-booking (email + push members)
- detect-booking-from-conversation (email recipients + owner push)
- whatsapp-webhook (3 push call sites: incoming call, missed call, new message)

Other workspace members are NOT affected by one user's mute — preferences are strictly per-user.
