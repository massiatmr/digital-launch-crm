# Architecture decisions

- Manual lead bookings must invoke `handle-booking` with an authenticated `lead_id`, so calendar sync, reminders, and lead linkage stay centralized without duplicate leads.
- WhatsApp greeting resolution lives in the dependency-free functions `_shared/whatsappPersonalization.ts` module and is re-exported to the browser, so all messaging paths share identical rules without importing frontend code into deployed functions.
