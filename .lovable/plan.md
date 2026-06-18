## Refonte mobile — page détail du lead

Objectif : rendre la sheet détail respirable sur iPhone (390px et moins car c'est moins que ça bug, genre le width des elements ne s'adapte plus quand l'ecran est plus petit, ils ont un width fix, mais puisque l'écran est petit ça depasse vers la droite), régler les éléments écrasés, les contours flous et le clipping des focus.

### 1. SheetContent (`src/pages/PipelinePage.tsx`)

- Remplacer `p-6` par `p-4 sm:p-6` (réduit ~16px de chaque côté gagnés sur mobile).
- Retirer le double système de hauteur en supprimant `overflow-y-auto custom-scrollbar` ici (le scroll est déjà géré à l'intérieur par `LeadDetailContent`).

### 2. LeadDetailContent (`src/components/LeadDetailContent.tsx`)

- Hauteur : remplacer `h-[calc(100vh-80px)]` par `h-[100dvh] sm:h-[calc(100vh-80px)]` pour utiliser la dynamic viewport iOS et éviter le scroll fantôme sous la barre Safari.
- Header sticky : padding plus aéré (`pb-3 pr-10`), titre `text-base sm:text-lg` pour éviter l'écrasement avec les badges.
- Cartes (`bg-card p-3/4`) : retirer les `overflow-hidden` qui coupent les focus rings/glows ; remplacer par `overflow-x-hidden` uniquement où nécessaire pour conserver les anneaux de focus visibles.
- Boutons d'actions (WhatsApp / téléphone / email / Fusionner / Supprimer) : passer en `w-full sm:w-auto` sur la rangée principale et `justify-center` pour éviter les boutons coupés ; ajouter `min-h-10` pour la cible tactile.
- ScrollArea : conserver le `pb-40 sm:pb-6` déjà ajouté ; ajouter `px-1` pour laisser respirer les bordures contre la barre de scroll.
- Bloc « Message initial du lead » : passer en `text-xs sm:text-sm` pour réduire le pavé sur mobile, garder le wrap.

### 3. LeadEditForm (`src/components/LeadEditForm.tsx`)

- Padding carte : `p-3 sm:p-5` (au lieu de `p-5`).
- Grille : passer en `gap-3 sm:gap-4`.
- Inputs / SelectTrigger : forcer `h-11 text-base` sur mobile (`sm:h-10 sm:text-sm`) pour des cibles tactiles iOS et éviter le zoom auto Safari sur focus (< 16px).
- Labels : `text-xs font-medium uppercase tracking-wider text-muted-foreground` pour un contour plus lisible et marquer chaque champ.
- Bouton « Enregistrer » : `w-full sm:w-auto` en bas, séparé par une bordure top `border-t border-border pt-3` pour bien le détacher du dernier champ.

### 4. Détails visuels

- Tabs : ajouter `gap-1` sur la `TabsList` et `text-[11px] sm:text-xs` pour que les 3 onglets cessent d'être collés.
- Toutes les cartes : bordure unifiée `border border-border/60` + `rounded-xl` pour des contours nets en dark mode.

### Détails techniques

- Aucune modification de logique métier ni de schéma : uniquement classes Tailwind / structure JSX.
- Les classes `h-11`, `text-base` sur mobile suivent la règle iOS 16px anti-zoom focus.
- Pas de hardcoded colors : on garde `border-border`, `bg-card`, `text-muted-foreground` (design tokens existants).
- Fichiers touchés :
  - `src/pages/PipelinePage.tsx` (1 ligne sheet)
  - `src/components/LeadDetailContent.tsx`
  - `src/components/LeadEditForm.tsx`

Vérification après build : screenshot mobile 390×844 de la sheet ouverte sur un lead pour confirmer espacement, contours et bouton Enregistrer entièrement visible.