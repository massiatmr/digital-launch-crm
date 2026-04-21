

## Plan : Logo workspace, sections éditables, renommage offre

### Problèmes identifiés

1. **Logo absent sur landing pages** : Le RPC `get_offer_branding` ne renvoie le logo que si `is_active = true`. Et sur le template générique, quand `logo_url_light` ET `logo_url` sont absents, on tombe sur du texte. Plusieurs workspaces n'ont aucun logo uploadé → texte affiché.
2. **Texte invisible dans les sections** : L'éditeur Studio gère mal certains types de sections :
   - `pain_points` (variante "hormozi") attend `{icon, title, description}` mais l'éditeur n'édite que du texte brut → affichage vide.
   - `bonuses` / `deliverables` n'ont pas de champ `value` (prix) éditable.
   - Pas de moyen d'éditer `total_value` pour deliverables, ni `anchor`/`final` pour pricing.
3. **Renommer une offre dans le CRM** : Le titre est éditable uniquement via le Studio (sidebar). Pas d'édition rapide depuis `OffersPage` ou `OfferDetailPage`.

---

### Corrections

#### 1. Fiabiliser le logo workspace sur les landing pages
- **`PublicOfferPage.tsx` (template générique)** : prioriser `logo_url` (logo principal) puis `logo_url_light` (variante claire). Aujourd'hui c'est l'inverse, donc si seul le logo principal existe il s'affiche bien — mais on garde un seul code de sélection clair partagé.
- **`landing/demenageur.tsx`** : déjà correct, mais on renforce pour ne plus afficher `<span>{brandName}</span>` à côté du logo quand un vrai logo workspace est présent (évite double affichage).
- **Helper partagé `getBrandLogo(branding)`** dans `PublicOfferPage.tsx` exporté pour cohérence.
- **Fallback texte** : si vraiment aucun logo, afficher un petit badge stylisé avec l'initiale du `company_name` au lieu du nom complet en plain text.

#### 2. Éditeur de sections complet (Studio sidebar)
Étendre `OfferStudioSidebar.tsx` pour gérer correctement chaque type :
- **`pain_points`** : détecter si `variant === 'hormozi'` → afficher trois champs par item : sélecteur d'icône (liste déroulante), titre, description. Sinon : un seul textarea.
- **`deliverables` / `bonuses`** : ajouter un champ `value` (prix affiché à droite, ex "997€") en plus de titre/description. Pour `deliverables` : ajouter un champ `total_value` au niveau section.
- **`pricing`** : ajouter champs `anchor` (prix barré) et `final` (prix affiché).
- **`transformation`** : déjà OK (before/after).
- **`solution` / `guarantee`** : déjà OK.
- Bouton "Ajouter" crée un objet structuré correct selon le type (avec `icon: 'AlertCircle'` par défaut pour pain_points hormozi).

#### 3. Renommer une offre depuis le CRM
- **`OffersPage.tsx`** : ajouter un menu "⋮" sur chaque carte avec action "Renommer" → ouvre une petite Dialog avec un Input + bouton Enregistrer (utilise `useUpdateOffer`).
- **`OfferDetailPage.tsx`** : rendre le titre `h1` cliquable → mode édition inline (clic = devient Input, Enter/blur = sauvegarde).

---

### Fichiers modifiés

```
src/pages/PublicOfferPage.tsx          (logo: helper + fallback initiale)
src/pages/landing/demenageur.tsx       (cacher span quand logo workspace)
src/components/offers/OfferStudioSidebar.tsx  (édition complète des sections)
src/pages/OffersPage.tsx               (menu Renommer sur cartes)
src/pages/OfferDetailPage.tsx          (titre éditable inline)
```

Aucune migration DB nécessaire.

