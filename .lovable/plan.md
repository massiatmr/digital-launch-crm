# Détail RDV : conversation + rappels manuels

Ouvrir un panneau de détail au clic sur une carte de "Prochains RDV" (et sur les RDV du jour) montrant tout ce qu'il faut pour gérer le RDV, voir l'historique des rappels et en envoyer un manuellement.

## 1. Nouveau composant `BookingDetailSheet`

Fichier : `src/components/bookings/BookingDetailSheet.tsx`

Sheet (côté droit, largeur ~520px) avec 3 sections :

### a) Détails du RDV
- Nom, statut (badge), offre
- Date + heure client (TZ client) + heure owner (TZ owner)
- Email, téléphone (cliquable wa.me si dispo)
- Lien Meet (bouton)
- Bouton "Voir le lead" → `/leads/:leadId` si `lead_id`
- Actions rapides : Confirmer / Annuler / Terminé / toggle `show_status`

### b) Résumé de la conversation
- Si `lead_id` : derniers messages WhatsApp (`whatsapp_messages`, 10 derniers, ordonnés)
- Bullet récap "Qualification" depuis `lead_qualification` (interest_level, pain_point, objections, summary) si dispo
- Lien "Ouvrir la conversation complète" → `/conversations?lead=:leadId`

### c) Rappels (Reminders)
Timeline des 4 types (`confirmation`, `24h_before`, `12h_before`, `1h_before`) :
- Source : `booking_emails` filtré sur `booking_id`
- Pour chaque ligne : type (label FR), statut (pending / sent / skipped / failed), `scheduled_at`, `sent_at`
- Corrélation log : jointure logique via `email_send_log.metadata->>'booking_id'` = booking.id pour afficher l'erreur si `dlq`/`failed`
- Bouton "Envoyer maintenant" sur chaque rappel `pending` ou `failed` → ouvre dialog d'aperçu (réutilise `SendBookingEmailToLeadDialog` en mode pré-rempli, ou nouvelle variante `SendBookingReminderDialog`) avec sujet/corps du template correspondant et possibilité d'éditer avant envoi
- Bouton "Renvoyer" sur rappels déjà `sent` (avec confirmation)
- Bouton "Envoyer un rappel custom" → choisir type + preview + envoyer

L'envoi passe par `send-test-booking-email` (déjà en place, log dans `email_send_log`) en passant `bookingId` réel pour que les variables (date/heure/meet/offre) soient résolues automatiquement côté edge function — pas besoin de retaper les vars.

## 2. Intégration dans `BookingsPage.tsx`

- State `selectedBookingId: string | null`
- Le `<button>` de chaque carte "Prochains RDV" : au lieu de seulement `setSelectedDate`, ouvre aussi le sheet (`setSelectedBookingId(b.id)`)
- Idem sur les `<motion.div>` du détail du jour : devient cliquable et ouvre le sheet
- `<BookingDetailSheet bookingId={selectedBookingId} onOpenChange={...} />` monté en bas de la page

## 3. Edge function : petite extension de `send-test-booking-email`

Ajouter un mode "send for real booking" :
- Si le payload contient `bookingId` (au lieu de `sampleVars`), le edge function :
  1. lit le booking + offer + owner
  2. construit les vars (`date`, `time`, `meetLink`, `offerName`, `name`, etc.) à partir des données réelles
  3. envoie au `recipientEmail = booking.email` (ou override fourni)
  4. met à jour la ligne `booking_emails` correspondante : `status = 'sent'`, `sent_at = now()` si le type matche
- Log `email_send_log` avec `metadata: { booking_id, type, manual: true }`

## Détails techniques

- Réutilise `useBookingEmailTemplates` pour récupérer le sujet/corps par `type` (offre → workspace → défaut)
- Query React : `useQuery(['booking-emails', bookingId])` + `useQuery(['booking-send-logs', bookingId])`
- Realtime non requis ; invalider à l'envoi
- Section conversation : `useQuery(['booking-conversation', leadId])` qui select `whatsapp_messages` + `lead_qualification`

## Fichiers touchés

- **Créé** : `src/components/bookings/BookingDetailSheet.tsx`
- **Modifié** : `src/pages/BookingsPage.tsx` (cartes cliquables + montage du sheet)
- **Modifié** : `supabase/functions/send-test-booking-email/index.ts` (support `bookingId` + update `booking_emails`)
