# Plan : Système d'Offres, Landing Pages, Rendez-vous & Nurturing

## Vue d'ensemble

Construire un système complet de gestion d'offres avec pages de vente, prise de rendez-vous avec calendrier, séquences de nurturing automatiques, et filtrage pipeline par offre.

## Architecture

```text
┌─────────────────────────────────────────────────┐
│  Nouvelles tables DB                            │
│  ─────────────────                              │
│  offers          → nom, desc, slug, prix, niche │
│  offer_pages     → contenu landing page (JSON)  │
│  bookings        → RDV liés à un lead + offre   │
│  booking_emails  → séquence nurturing planifiée  │
│  leads.offer_id  → nouveau champ FK sur leads   │
└─────────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Nouvelles pages / routes                    │
│  ────────────────────                        │
│  /offers            → liste & gestion offres │
│  /offers/:id        → détail / édition offre │
│  /offers/:slug/page → landing page publique  │
│  /bookings          → gestion des RDV        │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Edge Functions                              │
│  ──────────────                              │
│  handle-booking  → crée RDV, event Google    │
│                    Calendar, séquence emails  │
└──────────────────────────────────────────────┘
```

## Etapes d'implémentation

### 1. Schéma base de données (migrations)

**Table `offers**` : id, owner_id, name, slug (unique), description, price, niche, features (jsonb), cover_image_url, is_active, created_at, updated_at. RLS par owner_id + politique SELECT publique pour les pages de vente.

**Table `offer_pages**` : id, offer_id (FK), headline, subheadline, body_content (jsonb — sections de la landing page), cta_text, cta_color, testimonials (jsonb), created_at, updated_at. RLS par owner via join sur offers.

**Table `bookings**` : id, owner_id, lead_id (FK nullable), offer_id (FK), name, email, phone, date, time_slot, status (enum: pending/confirmed/cancelled/completed), google_event_id, notes, created_at. RLS par owner_id + politique INSERT pour anon (formulaire public).

**Table `booking_emails**` : id, booking_id (FK), type (enum: 24h_before/12h_before/1h_before/confirmation), scheduled_at, sent_at, status. RLS par owner via join.

**Modification `leads**` : ajouter colonne `offer_id uuid nullable` FK vers offers.

### 2. Google Calendar — Connexion

Google Calendar nécessite un connecteur OAuth. Aucun connecteur Google Calendar n'est actuellement disponible dans les connecteurs Lovable. On va implémenter :

- Un bouton "Connecter Google Calendar" qui redirige vers OAuth Google
- Un edge function `handle-booking` qui crée l'événement via l'API Google Calendar
- La création d'événement côté invité se fera via un lien `.ics` dans l'email de confirmation

**Note** : La connexion Google Calendar nécessitera que tu configures tes identifiants OAuth Google (Client ID + Secret). On mettra ça en place après le système de base.

### 3. Pages & composants React

**OffersPage** (`/offers`) :

- Liste des offres sous forme de cartes avec statut actif/inactif
- Bouton créer une offre
- Stats par offre (nb leads, nb RDV, taux conversion)

**OfferDetailPage** (`/offers/:id`) :

- Formulaire d'édition : nom, description, prix, niche, features
- Aperçu de la landing page
- Liste des leads associés à cette offre
- Liste des RDV liés

**Landing Page publique** (`/offers/:slug/page`) :

- Route NON protégée (accessible sans auth)
- Headline, sous-titre, features, témoignages, CTA
- Formulaire de réservation de RDV intégré
- Design responsive et professionnel

**BookingsPage** (`/bookings`) :

- Vue calendrier + liste des RDV à venir
- Statut de chaque RDV
- Rappels email programmés visibles
- Filtrage par offre

### 4. Filtre pipeline par offre

- Ajouter un sélecteur d'offre dans `PipelinePage` (dropdown)
- Filtrer les leads par `offer_id`
- Badge offre visible sur les cartes pipeline
- Même filtre disponible sur `LeadsPage`

### 5. Sidebar — Nouvel onglet "Offres"

Ajouter dans la navigation (sidebar + mobile) :

- **Offres** (icône `Package`) entre Tâches et Leads
- **Rendez-vous** (icône `CalendarCheck`) après Offres

### 6. Edge Function `handle-booking`

- Reçoit les données du formulaire public (nom, email, tel, date, offre)
- Crée le booking en DB
- Crée ou lie le lead avec l'offer_id
- Programme les emails de nurturing (24h, 12h, 1h avant)
- Crée l'événement Google Calendar (quand connecté)
- Génère un fichier .ics pour l'invité

### 7. Séquence de nurturing RDV

Emails automatiques pré-rendez-vous :

- **Confirmation immédiate** : résumé du RDV + lien .ics
- **24h avant** : rappel + préparation + lien meet
- **12h avant** : rappel court
- **1h avant** : dernier rappel + lien meet direct

Pouvoir créer cette séquence et la personnaliser pour chaque offre.

Rappels pour toi (créés comme `reminders` existants) :

- Rappel 1h avant chaque RDV
- Et par email aussi 4 heures avant, 1h avant.

## Détails techniques

- Les landing pages publiques utilisent une route sans `ProtectedRoute`
- Le formulaire de booking utilise le client Supabase anon (RLS INSERT pour anon sur bookings) formulaire protéger contre sql injection
- Les séquences email nécessiteront la configuration email Lovable Cloud
- L'offre sera un tag/filtre sur le pipeline existant, pas un pipeline séparé
- Le slug d'offre est auto-généré depuis le nom (slugify)

## Ordre de livraison

1. Migrations DB (tables + enum + FK)
2. Hooks de données (useOffers, useBookings, etc.)
3. Pages Offres + Rendez-vous
4. Sidebar mise à jour
5. Filtre pipeline par offre
6. Landing page publique + formulaire booking
7. Edge function handle-booking
8. Séquence nurturing (emails)
9. Intégration Google Calendar (étape séparée, nécessite OAuth)