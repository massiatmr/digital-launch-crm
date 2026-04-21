

## Problème

Sur `/offers/:id/studio` et `/settings/:tab`, l'espace utile est écrasé par une double colonne latérale :
- La sidebar principale de l'app (240px ouverte / 64px réduite)
- Une seconde colonne interne (420px pour le Studio, ~260px pour Settings)

Sur un viewport 1061px, il ne reste que ~380px pour le contenu principal (preview Studio ou contenu Settings), ce qui rend l'expérience inutilisable.

## Solution

Adopter un pattern "focus mode" pour les pages outils qui ont déjà leur propre navigation interne : la sidebar principale se réduit automatiquement (icônes seulement) sur ces routes, libérant ~180px supplémentaires.

### 1. Auto-collapse de la sidebar principale sur les routes "outils"

Dans `AppLayout.tsx`, détecter les routes qui possèdent leur propre navigation interne et forcer `collapsed = true` automatiquement (l'utilisateur peut toujours la rouvrir manuellement).

Routes concernées :
- `/offers/:id/studio` (chat + édition + preview)
- `/settings/*` (sidebar groupée par scope)

### 2. Studio : refonte du layout en 3 colonnes ajustables

Remplacer la colonne fixe de 420px par un layout responsive :

```text
┌──┬─────────┬──────────────────────────┐
│  │ Chat/   │                          │
│≡ │ Édition │      Preview live        │
│  │ (340px) │      (flex-1)            │
└──┴─────────┴──────────────────────────┘
```

- Sidebar app : auto-collapse en mode icônes (64px)
- Panneau Studio : 340px au lieu de 420px, avec poignée resize (`react-resizable-panels` déjà installé)
- Preview : prend tout l'espace restant
- Sur tablette (<1280px) : panneau Studio passe en `Sheet` overlay déclenché par un bouton, preview en plein écran par défaut

### 3. Settings : sidebar interne plus compacte

- Sidebar app auto-collapse (64px)
- Sidebar interne Settings : passer de boutons larges à une liste plus dense (icône + label court, 200px au lieu de ~260px)
- Sur mobile : déjà en Select dropdown, on garde

### 4. Bouton de retour explicite

Quand la sidebar principale est auto-collapsée, ajouter un bouton "←" dans le header de la page outil pour revenir à la vue normale (re-expand).

## Détails techniques

**`AppLayout.tsx`** :
- Ajouter `useLocation()` + `useEffect` qui force `setCollapsed(true)` quand `pathname` matche `/offers/*/studio` ou `/settings*`
- Mémoriser l'état précédent pour le restaurer en quittant la route

**`OfferStudioPage.tsx`** :
- Retirer `fixed inset-0` (il sort du flux et casse la sidebar) → utiliser `h-[calc(100vh-4rem)]` dans le flux normal
- Remplacer le split flex par `ResizablePanelGroup` (panneau gauche min 300px / max 500px, défaut 340px)
- Sur `<1280px` : panneau gauche dans un `Sheet` côté gauche, déclenché par bouton dans le header

**`SettingsPage.tsx`** :
- Réduire la sidebar interne : `w-52` au lieu de `w-64`, padding réduit, labels en `text-sm`
- Sticky top à `top-16` (sous le WorkspaceHeader)

**Pas de changement** sur les autres pages (Pipeline, Clients, Bookings…) qui restent avec sidebar principale ouverte par défaut.

## Fichiers modifiés

- `src/components/AppLayout.tsx` — auto-collapse selon route
- `src/pages/OfferStudioPage.tsx` — layout resizable + sortir de `fixed inset-0`
- `src/pages/SettingsPage.tsx` — sidebar interne compacte

