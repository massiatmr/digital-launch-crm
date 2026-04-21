

## Plan : Connecter la landing Déménageur aux données du Studio

### Problème (cause racine)

L'offre "Système Déménageurs" déclenche **automatiquement** la landing page custom `src/pages/landing/demenageur.tsx` (détectée via mot-clé `demenag` dans le slug/niche).

Mais ce fichier utilise des **constantes hardcodées** (`painPoints`, `solutions`, deliverables figés en JSX) et **n'utilise jamais** les `sections` éditables stockées dans `offer_pages.sections`. Résultat : tout ce que tu édites dans le Studio (titres, items, icônes, prix, transformation, bonus) **n'apparaît jamais** sur la landing rendue → l'utilisateur voit le template figé "Digital Launch / site déménageur" sans aucun lien avec son offre.

À l'inverse, le **template générique** (`PublicOfferPage`) lit bien `sections` et affiche correctement tout ce qui est édité — comme le confirment les données en DB qui sont parfaitement structurées (5 pain_points, 5 deliverables avec valeurs, 3 bonuses, transformation avant/après, total_value 6250€).

### Solution

#### 1. Rendre `demenageur.tsx` data-driven (lecture des `sections`)
- Ajouter `useOfferPage(offer.id)` dans le composant pour récupérer la page.
- Remplacer les constantes hardcodées par lecture conditionnelle des sections du Studio :
  - **Hero** : `headline` / `subheadline` / `cta_text` depuis `offer_pages` (fallback aux textes actuels si vides).
  - **Pain points** : lire `sections[type=pain_points].items` (objets `{icon, title, description}`) au lieu du tableau hardcodé. Garder le visuel actuel (icône rouge + texte).
  - **Transformation** : lire `sections[type=transformation].before/after` et afficher dans la grille avant/après actuelle (aujourd'hui absente du template déménageur → on l'ajoute).
  - **Deliverables** : lire `sections[type=deliverables].items` (icône + titre + value + description) et `total_value`. Remplacer la liste figée des "services inclus".
  - **Bonuses** : lire `sections[type=bonuses].items` et afficher dans la section bonus existante.
  - **Solution / Garantie / FAQ / Pricing** : afficher si présents, sinon masquer la section.
  - **CTA** : utiliser `cta_text` édité.

#### 2. Garder l'identité visuelle "Déménageur" (rouge, photos)
- On **ne touche pas** au design : background image hero, palette rouge, glow, layout — tout reste identique.
- Les blocs "portfolio" (4 images projets) restent hardcodés car ce sont des assets locaux Digital Launch (logique : c'est notre vitrine, pas celle du client).
- Si l'utilisateur n'a aucune section configurée (offre vide), on garde un fallback élégant (textes par défaut actuels) pour éviter une page blanche.

#### 3. Helper de mapping icônes partagé
- Centraliser le map `ICON_MAP` (déjà présent dans `PublicOfferPage`) en helper exportable réutilisé par `demenageur.tsx`. Évite les divergences.

#### 4. Édition autorisée du nom de section (déjà OK)
- Vérifié : `OfferStudioSidebar` permet déjà d'éditer titre/items/icônes/valeurs correctement → pas de changement côté éditeur.

### Fichiers modifiés

```
src/pages/landing/demenageur.tsx     (data-driven : lit offerPage.sections au lieu de constantes hardcodées)
src/pages/PublicOfferPage.tsx        (export du HormoziIcon/ICON_MAP pour réutilisation)
```

Aucune migration DB. Aucun changement d'éditeur. Aucune perte du look "Déménageur".

### Résultat attendu

Après cette correction, ce que tu édites dans le Studio (titres, points de douleur, icônes, transformation, livrables avec leurs valeurs, bonus, FAQ, etc.) s'affichera **réellement** sur la landing déménageur, tout en conservant son design rouge/photos premium.

