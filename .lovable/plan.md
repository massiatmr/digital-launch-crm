

## Problème

Actuellement, le filtre de période dans le Dashboard et la Pipeline filtre les leads par leur **date de création** (`created_at`). Un lead créé il y a 6 mois mais closé (gagné/perdu) cette semaine n'apparaît pas dans les stats des 7 derniers jours.

## Solution

Utiliser `updated_at` au lieu de `created_at` pour le filtre de période. Le champ `updated_at` est automatiquement mis à jour à chaque modification du lead (trigger existant `update_updated_at_column`), donc un changement de statut récent fera apparaître le lead dans la période correspondante.

## Changements

### 1. `src/pages/Dashboard.tsx` (ligne ~92)
- Remplacer `new Date(l.created_at)` par `new Date(l.updated_at)` dans le filtre de période

### 2. `src/pages/PipelinePage.tsx` (ligne ~256)
- Même changement : filtrer sur `l.updated_at` au lieu de `l.created_at`

C'est tout — deux lignes à modifier. Le champ `updated_at` existe déjà et est maintenu par un trigger SQL.

