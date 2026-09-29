# Architecture decisions

- Manual lead bookings must invoke `handle-booking` with an authenticated `lead_id`, so calendar sync, reminders, and lead linkage stay centralized without duplicate leads.
