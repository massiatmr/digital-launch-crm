# Plan : Landing Pages Pro + Disponibilités Google Calendar en temps réel

## Contexte

Les landing pages publiques actuelles sont minimalistes (hero + features + formulaire basique). L'utilisateur veut :

1. Des landing pages beaucoup plus riches et professionnelles (style sales page longue)
2. Un système de réservation avec disponibilités réelles synchronisées depuis Google Calendar
3. Le contenu `body_content` de `offer_pages` exploité pour des sections riches (pain points, garanties, témoignages, portfolio)

## Architecture

```text
┌─────────────────────────────────────┐
│  PublicOfferPage (refonte complète)  │
│  ├── Navbar sticky                  │
│  ├── Hero (headline + CTA + badge)  │
│  ├── Pain Points ("Cela vous        │
│  │    ressemble ?")                 │
│  ├── Solution / Proposition         │
│  ├── Features / Inclus              │
│  ├── Portfolio / Réalisations       │
│  ├── Garantie 100%                  │
│  ├── Témoignages                    │
│  ├── Formulaire de réservation      │
│  │    └── Calendrier interactif     │
│  │        avec dispo Google Cal     │
│  └── Footer                        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Edge Function: check-availability  │
│  ├── Reçoit owner_id + date        │
│  ├── Lit google_tokens              │
│  ├── Appelle Google Calendar API    │
│  │   (freebusy query)              │
│  ├── Compare avec créneaux définis  │
│  │   (11:00-15:30 par défaut)      │
│  └── Retourne créneaux libres       │
└─────────────────────────────────────┘
```

## Etapes

### 1. Edge Function `check-availability`

Nouvelle edge function qui :

- Prend `owner_id` et `date` en paramètres
- Récupère le token Google du owner (avec refresh si expiré, réutilisant la logique existante de `handle-booking`)
- Appelle l'API Google Calendar **FreeBusy** pour la journée demandée
- Définit les créneaux de base ( de 11:00 à 15:30) rendez vous durée de 1h, en slots de 15 min
- Filtre les créneaux occupés et retourne uniquement les disponibles
- Si pas de token Google, retourne tous les créneaux par défaut (fallback)

### 2. Migration DB : enrichir `offer_pages`

Ajouter une colonne `sections JSONB DEFAULT '[]'` à `offer_pages` pour stocker les sections structurées de la landing page (pain points, garantie, portfolio, etc.). Cela permet d'éditer le contenu depuis le back-office sans toucher au code.

### 3. Refonte complète de `PublicOfferPage.tsx`

Transformer la page minimaliste en une vraie sales page professionnelle :

- **Navbar** : logo/nom de l'offre + CTA sticky
- **Hero** : headline bold, subheadline, badge de confiance (garantie 100%), CTA vers le formulaire
- **Section "Est-ce que cela vous ressemble ?"** : pain points avec icones (contenu depuis `body_content` ou `sections`)
- **Section Solution** : proposition de valeur, ce qui vous différencie
- **Section Features/Inclus** : grille de ce qui est inclus dans l'offre
- **Section Portfolio** : exemples de réalisations (images depuis `sections`)
- **Section Garantie** : mise en avant de la garantie remboursement
- **Section Témoignages** : depuis `testimonials` de `offer_pages`
- **Formulaire de réservation redesigné** :
  - Calendrier visuel interactif (composant `Calendar` existant de shadcn)
  - Quand une date est sélectionnée, appel à `check-availability` pour afficher les créneaux libres en temps réel
  - Créneaux occupés grisés/désactivés
  - Design en 2 colonnes : calendrier à gauche, créneaux + infos à droite
  - Inputs nom/email/téléphone avec meilleur design
- **Footer** : mentions légales, contact

Le contenu spécifique (texte déménageur fourni par l'utilisateur) sera stocké dans `body_content`/`sections` de l'offer_page et rendu dynamiquement.

### 4. Mise à jour du back-office `OfferDetailPage`

Ajouter dans l'onglet "Landing Page" la possibilité d'éditer les sections riches :

- Pain points (liste de textes)
- Garantie (texte)
- Portfolio (images + descriptions)
- Témoignages (nom, texte, note)

Cela permettra de personnaliser chaque landing page sans coder.

## Détails techniques

- **Google FreeBusy API** : `POST https://www.googleapis.com/calendar/v3/freeBusy` avec `timeMin`/`timeMax` pour la journée, retourne les blocs occupés. On compare avec les slots prédéfinis pour filtrer.
- **Timezone** : `Europe/Paris` partout (cohérent avec l'existant).
- **Fallback** : si Google Calendar n'est pas connecté, on affiche tous les créneaux par défaut.
- **Calendrier** : réutilisation du composant `Calendar` de shadcn (déjà dans le projet). Dates passées désactivées.
- **Animations** : `framer-motion` pour les sections au scroll (déjà utilisé).
- Le contenu "déménageur" fourni sera inséré comme contenu par défaut lors de la création ou via l'éditeur du back-office.