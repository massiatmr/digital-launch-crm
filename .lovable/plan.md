

# Plan : KPIs avancés, champ Show/No-show, et corrections mobile

## 1. Migration DB : ajouter `show_status` aux leads

Ajouter une colonne `show_status` de type enum (`'pending'`, `'show'`, `'noshow'`) à la table `leads`, avec `'pending'` par défaut. Cela permettra de tracker si le prospect s'est présenté au rendez-vous.

```sql
CREATE TYPE public.show_status AS ENUM ('pending', 'show', 'noshow');
ALTER TABLE public.leads ADD COLUMN show_status show_status NOT NULL DEFAULT 'pending';
```

## 2. Mettre à jour le code pour le champ show/noshow

- **`DbLead` dans `useLeadData.ts`** : ajouter `show_status: 'pending' | 'show' | 'noshow'`
- **`LeadEditForm.tsx`** : ajouter un select "Présence au RDV" (Pending / Show / No-show) pour les leads au statut `proposal`, `won`, `lost`
- **`PipelineCard`** : afficher un petit badge show/noshow quand renseigné

## 3. Refonte du Dashboard avec les KPIs demandés

Remplacer les 4 stats actuelles par **8 KPIs** organisés en 2 rangées :

**Rangée 1 — KPIs demandés :**
- **Nouveaux leads (30j)** : `leads.filter(created_at > 30 jours)`. Alerte visuelle si < 5 (seuil bas).
- **Temps moyen New → Contacté** : différence moyenne entre `created_at` et `last_contacted_at` pour les leads passés de `new` à `contacted`. Affiché en heures/jours.
- **Taux de Show-up** : `leads.show_status === 'show'` / total leads avec `show_status !== 'pending'`. Indicateur critique pour les RDV.
- **Tâches en attente** : nombre de reminders non terminés (`!done`). Avec sous-texte "X en retard" si `due_date < now`.

**Rangée 2 — KPIs complémentaires proposés :**
- **Taux de Closing** (existant) : won / (proposal + won + lost)
- **Taux de Qualification** : qualified+ / (contacted + qualified + proposal + won + lost). Mesure l'efficacité du screening.
- **Valeur pipeline** : nombre de leads en `proposal` (deals en cours à closer)
- **Leads à relancer** : leads `ghost` + leads non contactés depuis > 7 jours. Indicateur d'action immédiate.

Chaque KPI aura une couleur conditionnelle (vert/orange/rouge) selon la performance.

## 4. Corrections mobile

Problèmes identifiés dans le code :

- **Pipeline** (`PipelinePage.tsx`) : les colonnes ont `min-w-[160px] sm:min-w-[220px]` ce qui force un scroll horizontal large. Le conteneur overflow-x-auto avec `-mx-4 px-4` crée un comportement de zoom/dezoom. Corrections :
  - Réduire `min-w` sur mobile à `140px`
  - Ajouter `touch-action: pan-x` pour éviter les conflits de zoom
  - Ajouter `overflow-x: hidden` sur le body en mobile pour empêcher le scroll horizontal global

- **Dashboard** : les graphiques recharts débordent sur petit écran. Le PieChart avec labels textuels dépasse. Corrections :
  - Masquer les labels du PieChart sur mobile, garder uniquement le tooltip
  - Réduire la hauteur des charts sur mobile
  - Empiler les stats 2x2 au lieu de 4 colonnes (déjà fait via `grid-cols-2`)

- **Layout global** (`AppLayout.tsx`) : ajouter `overflow-x-hidden` sur le `<main>` pour empêcher tout débordement horizontal

- **index.css** : ajouter une règle globale `html, body { overflow-x: hidden; }` et `touch-action: manipulation` sur les conteneurs principaux pour éviter le double-tap zoom

## Fichiers modifiés

1. **Migration SQL** : nouvelle colonne `show_status`
2. **`src/hooks/useLeadData.ts`** : type `DbLead` mis à jour
3. **`src/components/LeadEditForm.tsx`** : select show/noshow ajouté
4. **`src/pages/Dashboard.tsx`** : refonte complète des KPIs
5. **`src/pages/PipelinePage.tsx`** : fixes mobile (min-width, touch-action)
6. **`src/components/AppLayout.tsx`** : overflow-x-hidden sur main
7. **`src/index.css`** : règles anti-zoom mobile

