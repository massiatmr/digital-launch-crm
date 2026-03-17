## Refonte UI + Nouvelles fonctions sales automation

### Analyse de l'existant

L'interface actuelle est fonctionnelle mais monotone : dark flat, peu de contraste, pas d'animations, typographie Montserrat/Questrial peu impactante, cards toutes identiques sans hiérarchie visuelle. La page login ne montre même pas les testimonials ni l'image hero (probablement le `heroImageSrc` n'est pas passé). L'ensemble manque de dynamisme visuel.

---

### A. Refonte visuelle complète

**1. Nouvelle typographie — Inter + Geist Mono**

- Remplacer Montserrat/Questrial par **Inter** (body + headings) — plus moderne, meilleure lisibilité, standard SaaS 2025
- Ajouter **Geist Mono** pour les chiffres, stats, badges (effet premium)
- Mettre à jour `index.css` (Google Fonts import) et `tailwind.config.ts` (fontFamily)

**2. Design system amélioré — Glassmorphism + Gradients**

- Cards avec `backdrop-blur`, bordures subtiles en `white/5`, ombres douces
- Gradient subtil sur le header/sidebar (pas de flat noir pur)
- CSS variables : ajouter `--glass` et `--glass-border` pour le glassmorphism
- Boutons primaires avec gradient au lieu de couleur plate
- Stat cards du dashboard avec icône colorée en fond (cercle gradient)

**3. Animations et micro-interactions**

- Ajouter `framer-motion` comme dépendance
- Stagger animation sur les cards du dashboard (apparition en cascade)
- Hover scale + glow sur les pipeline cards
- Page transitions douces (fade + slide)
- Compteurs animés sur les stats du dashboard (count-up effect)
- Skeleton loaders stylisés au lieu du simple spinner

**4. Pipeline visual upgrade**

- Headers de colonnes avec gradient coloré par stage (pas juste un emoji)
- Cards avec barre latérale colorée selon le score (rouge/orange/bleu)
- Animation fluid au drop (card qui slide dans la nouvelle colonne)

**5. Sidebar refresh**

- Active link avec indicator bar à gauche (pas juste un bg change)
- Icons avec taille légèrement plus grande, spacing plus aéré
- Hover avec glow subtil

---

### B. Nouvelles fonctionnalités sales automation

**6. Séquences de relance automatique**

- Nouvelle page `/sequences` accessible depuis la sidebar
- Créer des templates de séquences : J+1 → WhatsApp, J+3 → Email, J+7 → Appel
- Associer une séquence à un lead ou un segment (tous les leads froids, etc.)
- L'IA génère automatiquement le contenu de chaque étape adapté au lead
- Dashboard de suivi des séquences en cours (quel lead, quelle étape, prochaine action)
- Table `sequences` et `sequence_steps` en base

**7. Lead warming — Réchauffement automatique des leads froids**

- Bouton "Réchauffer" sur les leads froids dans le pipeline
- L'IA analyse le profil du lead et propose un plan de réchauffement en 3 étapes
- Suggestions contextuelles : partage de contenu, message de valeur, offre exclusive
- Badge visuel "En réchauffement" sur les leads concernés

**8. Sales call prep — Fiche pré-appel**

- Bouton "Préparer l'appel" sur chaque lead
- Génère une fiche condensée : résumé, points clés, objections anticipées, questions à poser, proposition de closing
- Format imprimable / copiable en un clic
- Utilise l'historique des notes et l'IA pour personnaliser

**9. Scoring dynamique intelligent**

- Le score se recalcule automatiquement en fonction de l'activité : temps depuis dernier contact, nombre de relances, réponses reçues
- Leads sans action depuis X jours → passage auto de "warm" à "cold"
- Notification quand un lead chaud n'a pas été contacté depuis 48h

**10. Quick actions depuis le pipeline**

- Clic droit (ou menu ⋮) sur une card = actions rapides : Envoyer WhatsApp, Préparer appel, Lancer séquence, Changer score
- Pas besoin d'ouvrir le détail pour les actions courantes

---

### Fichiers impactés


| Fichier                                       | Changement                                         |
| --------------------------------------------- | -------------------------------------------------- |
| `src/index.css`                               | Nouvelle font, variables glass, animations framer  |
| `tailwind.config.ts`                          | fontFamily Inter/Geist, nouvelles couleurs glass   |
| `src/pages/Dashboard.tsx`                     | Stagger animations, glass cards, compteurs animés  |
| `src/pages/PipelinePage.tsx`                  | Cards redesign, quick actions menu, drop animation |
| `src/components/AppSidebar.tsx`               | Active indicator, spacing, hover glow              |
| `src/components/LeadScoreBadge.tsx`           | Nouveau design avec dot + gradient                 |
| `src/components/LeadStatusBadge.tsx`          | Idem                                               |
| `src/pages/AuthPage.tsx`                      | Fix hero image, animations d'entrée                |
| **NEW** `src/pages/SequencesPage.tsx`         | Page séquences de relance                          |
| **NEW** `src/components/QuickActionsMenu.tsx` | Menu contextuel pipeline                           |
| **NEW** `src/components/CallPrepSheet.tsx`    | Fiche pré-appel IA                                 |
| **NEW** `src/components/WarmUpPlan.tsx`       | Plan réchauffement lead                            |
| `src/App.tsx`                                 | Route `/sequences`                                 |
| `src/components/AppSidebar.tsx`               | Lien Séquences                                     |
| `package.json`                                | `framer-motion`, `react-countup`                   |
| Migration SQL                                 | Tables `sequences`, `sequence_steps` avec RLS      |


### Dépendances

- `framer-motion` — animations
- `react-countup` — compteurs animés dashboard

### Ordre d'exécution

1. Refonte CSS + typo + design system (fondation visuelle)
2. Redesign dashboard + pipeline + sidebar
3. Table sequences + page séquences
4. Quick actions + call prep + lead warming
5. Scoring dynamique  


### Problèmes identifiés

1. **Scroll impossible dans la réponse IA** : la zone de réponse (`aiAnswer`) n'a pas de max-height ni overflow-y, le contenu déborde sans scroll
2. **Vocal se coupe immédiatement** : `continuous: false` et `interimResults: false` — la reconnaissance s'arrête au premier silence. Pas de `useRef` dans GlobalNaturalLanguageInput (utilise un objet simple `{ current: null }`)
3. **Pas d'historique de conversation** : chaque question IA efface la précédente
4. **UX globale basique** : pas de markdown, pas d'animation de typing, input pas assez riche

### Plan d'implémentation

**1. Corriger le speech recognition (les 2 composants)**

- `continuous: true` + `interimResults: true` pour capter le discours en continu
- Utiliser un vrai `useRef` dans `GlobalNaturalLanguageInput` (actuellement `{ current: null }` perd la référence entre renders)
- Afficher les résultats intermédiaires en temps réel dans l'input
- Auto-restart sur `onend` si toujours en mode écoute (contourner les timeouts navigateur)

**2. Transformer le mode "Question IA" en chat conversationnel**

- Remplacer le simple `aiAnswer` string par un tableau `messages: {role, content}[]`
- Afficher les messages dans un fil de chat scrollable avec `max-h` + `overflow-y-auto` + `custom-scrollbar`
- Ajouter `react-markdown` pour le rendu des réponses IA (listes, gras, code)
- Animation de typing (3 dots pulsants) pendant le chargement
- Bouton "Effacer la conversation"

**3. Améliorer le container AI (AiFloatingButton)**

- Augmenter la taille du dialog desktop pour le chat (`sm:max-w-2xl` → `sm:max-w-3xl`, plus de hauteur)
- Sheet mobile : s'assurer que le contenu scrolle correctement dans `max-h-[85vh]`
- Ajouter le `custom-scrollbar` sur les zones scrollables

**4. UX polish**

- Textarea au lieu d'input pour les messages longs (auto-resize)
- Envoyer avec Enter, nouvelle ligne avec Shift+Enter
- Feedback visuel amélioré sur le bouton micro (pulsation + changement d'icône fluide)
- Placeholder dynamique qui change selon le contexte

**5. Fonctionnalités utiles supplémentaires**

- **Historique des conversations IA** : conserver les échanges de la session
- **Suggestions rapides** : chips cliquables sous l'input ("Leads à rappeler", "Résumé pipeline", "Leads chauds sans action")
- **Copier la réponse IA** : bouton copier sur chaque réponse

### Fichiers modifiés

- `src/components/GlobalNaturalLanguageInput.tsx` — refonte majeure (chat, speech fix, markdown, suggestions)
- `src/components/AiFloatingButton.tsx` — taille container, scroll
- `src/components/AudioVisualizer.tsx` — aucun changement
- `src/components/NaturalLanguageInput.tsx` — fix speech recognition (continuous + useRef)
- `package.json` — ajouter `react-markdown`

### Dépendances

- `react-markdown` pour le rendu markdown des réponses IA

&nbsp;