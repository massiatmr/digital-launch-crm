## Objectif

Casser la page `/bookings` (actuellement tout affiché d'un coup) en 3 sous-onglets clairs, et permettre de configurer des emails personnalisés (admin + rappels client) par offre.

## 1. Réorganisation UI — `src/pages/BookingsPage.tsx`

Wrapper la page dans un `Tabs` (composant `@/components/ui/tabs` déjà présent) avec 3 onglets :

**Onglet 1 — "Rendez-vous" (par défaut)**
- En haut : carte "Prochains RDV" pleine largeur (liste claire, badge statut, bouton ouvrir détail).
- En dessous : la vue actuelle calendrier semaine (`WeekAvailabilityView`) + détail du jour sélectionné.
- Filtre offre + connexion Google Calendar conservés dans le header.

**Onglet 2 — "Disponibilités"**
- `AvailabilityPanel` (horaires, jours travaillés, durée, lead time, blackouts).
- Bouton connecter Google Calendar si pas connecté.

**Onglet 3 — "Notifications & Rappels"**
- Section "Notifications admin" : toggles pour activer mail confirmation immédiate aux membres workspace + rappel 1h avant (déjà actifs côté serveur ; on expose juste les toggles via `workspaces.notification_email` + une nouvelle colonne `booking_admin_reminders_enabled`).
- Section "Emails au client" : sélecteur d'offre → éditeur des 4 templates (`confirmation`, `24h_before`, `12h_before`, `1h_before`) avec activable/désactivable, sujet + corps HTML, variables disponibles (`{{name}}`, `{{date}}`, `{{time}}`, `{{meet_link}}`, `{{offer_name}}`).
- Bouton "Réinitialiser au défaut" par template.

## 2. Schéma DB (migration)

Nouvelle table `offer_booking_email_templates` :

```
id uuid pk, owner_id uuid, workspace_id uuid,
offer_id uuid fk offers(id) on delete cascade,
type booking_email_type not null,  -- enum existant
enabled boolean default true,
subject text, body_html text,
created_at, updated_at,
unique (offer_id, type)
```

RLS : workspace_id-based comme `followup_sequence_steps`.

Nouvelle colonne `workspaces.booking_admin_reminders_enabled boolean default true`.

Defaults : pas de seed — si pas de row pour `(offer_id, type)`, on utilise les templates HTML codés en dur (déjà présents dans `handle-booking` et `process-booking-reminders`). Les éditer = créer la row.

## 3. Edge functions

**`handle-booking/index.ts`** :
- Quand on insère les rows `booking_emails` pour client, ne planifier `24h_before`/`12h_before`/`1h_before` que si la row offer-template correspondante est `enabled` (ou si pas de row = enabled par défaut).
- Email confirmation client : si template offer existe, l'utiliser ; sinon défaut.

**`process-booking-reminders/index.ts`** :
- Étendre pour gérer aussi `24h_before` et `12h_before` (pas seulement `1h_before`).
- Pour chaque envoi : charger `offer_booking_email_templates` matching `(offer_id, type)` → utiliser subject/body si présent + remplacer placeholders ; sinon défaut.
- Garder l'email admin (1h_before workspace members) en parallèle, gated par `workspaces.booking_admin_reminders_enabled`.

## 4. Hooks

Nouveau `src/hooks/useBookingEmailTemplates.ts` :
- `useOfferBookingEmailTemplates(offerId)` → list 4 types
- `useUpsertOfferBookingEmailTemplate()` → insert/update
- `useResetOfferBookingEmailTemplate(offerId, type)` → delete row

## 5. Composant éditeur

`src/components/bookings/OfferEmailTemplatesEditor.tsx` :
- Sélecteur d'offre (réutilise `useOffers`).
- 4 cards (une par type) avec Switch enabled, Input subject, Textarea body_html, badge variables disponibles, bouton "Aperçu" (modal HTML rendu), bouton "Réinitialiser".

## Fichiers touchés

- migration SQL (table + colonne)
- `src/pages/BookingsPage.tsx` (refactor en tabs)
- `src/components/bookings/NotificationsTab.tsx` (nouveau)
- `src/components/bookings/OfferEmailTemplatesEditor.tsx` (nouveau)
- `src/hooks/useBookingEmailTemplates.ts` (nouveau)
- `supabase/functions/handle-booking/index.ts` (lookup templates + gating)
- `supabase/functions/process-booking-reminders/index.ts` (étendre aux 3 types + templates)

## Hors scope (à confirmer)

- Préview live d'envoi test (bouton "M'envoyer cet email") — pas inclus, à ajouter si demandé.
- Éditeur WYSIWYG : on reste en HTML brut + textarea pour rester simple.