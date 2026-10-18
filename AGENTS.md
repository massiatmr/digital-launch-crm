# Architecture decisions

- Manual lead bookings must invoke `handle-booking` with an authenticated `lead_id`, so calendar sync, reminders, and lead linkage stay centralized without duplicate leads.
- WhatsApp greeting resolution lives in the dependency-free functions `_shared/whatsappPersonalization.ts` module and is re-exported to the browser, so all messaging paths share identical rules without importing frontend code into deployed functions.
- Signup returns the Auth response to the invitation page; only an authenticated session consumes the invitation, so duplicate signup and unconfirmed users cannot be mistaken for successful activation.
- Workspace loading accepts pending invitations through a locked, idempotent authenticated RPC before reading memberships; identity comes from the verified account email, and existing membership roles are preserved to prevent duplicate-account and privilege changes.
