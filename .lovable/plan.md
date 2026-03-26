
# Plan : Système d'Offres, Landing Pages, Rendez-vous & Nurturing

## ✅ Étapes complétées

### 1. Migrations DB
- Tables `offers`, `offer_pages`, `bookings`, `booking_emails` créées
- Enums `booking_status`, `booking_email_type` créés
- Colonne `offer_id` ajoutée sur `leads`
- RLS policies en place (owner-based + anon INSERT sur bookings)

### 2. Hooks de données
- `useOfferData.ts` : useOffers, useOffer, useOfferBySlug, useCreateOffer, useUpdateOffer, useDeleteOffer, useOfferPage, useUpdateOfferPage, useBookings, useCreateBooking, useUpdateBooking, useBookingEmails

### 3. Pages React
- `/offers` — Liste et gestion des offres
- `/offers/:id` — Détail/édition d'une offre avec tabs (détails, landing page, leads, RDV)
- `/offers/:slug/page` — Landing page publique avec formulaire de réservation
- `/bookings` — Gestion des rendez-vous avec filtrage par offre

### 4. Navigation
- Sidebar : Offres + Rendez-vous ajoutés entre Tâches et Leads
- Mobile : Offres + Rendez-vous dans le menu "Plus"

### 5. DbLead type
- `offer_id` ajouté au type DbLead

## 🔜 Prochaines étapes

### 5. Filtre pipeline par offre
- Ajouter dropdown offre dans PipelinePage et LeadsPage
- Badge offre sur les cartes

### 6. Edge Function handle-booking
- Créer le lead automatiquement à la réservation
- Programmer les emails de nurturing

### 7. Séquence nurturing (emails)
- Configuration email domain
- Templates de rappel (confirmation, 24h, 12h, 1h)

### 8. Intégration Google Calendar
- OAuth Google (nécessite Client ID + Secret)
- Création d'événements automatiques
