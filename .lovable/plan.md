# Automatisation par offre + refonte UX

## Objectif

1. Permettre **une séquence WhatsApp distincte par offre/niche** (templates + délais + IA).
2. Refondre la page `/settings/automation` pour qu'elle soit **lisible, progressive et orientée tâche** (au lieu d'un mur d'options).

---

## Partie 1 — Séquences par offre

### Modèle de données

Ajouter une colonne `offer_id uuid NULL` à `followup_sequence_steps`.

- `offer_id = NULL` → séquence **"Par défaut"** (utilisée si aucune séquence spécifique n'existe pour l'offre du lead).
- `offer_id = <uuid>` → séquence **dédiée à cette offre**.

Index composite : `(owner_id, offer_id, step_order)`.

### Logique de déclenchement

Mettre à jour le trigger SQL `create_followup_sequence_for_lead` :

1. Si `lead.offer_id` est défini, chercher d'abord les steps avec `offer_id = lead.offer_id`.
2. Si rien trouvé (ou pas d'offre sur le lead), retomber sur les steps avec `offer_id IS NULL`.
3. Itérer comme aujourd'hui.

Côté `execute-followup-task` : aucun changement (le `template_id` du step est déjà résolu à la création de la tâche).

### Templates

Pas de changement de schéma sur `whatsapp_templates` — ils restent globaux côté Meta. La spécialisation par niche se fait au niveau du **step** (chaque step pointe vers le template adapté).

Ajouter dans `TemplatesManager` un **filtre "Utilisé par offre"** (lecture seule) qui montre quels templates sont référencés par quelle séquence offre, pour aider à comprendre qui sert à quoi.

### UI éditeur de séquence

`SequenceEditor` reçoit un nouveau **sélecteur d'offre en haut** :

```text
[ Par défaut ▼ ]  (toutes offres sans séquence dédiée)
─────────────────
Étape 1 : Message d'intro      Template : "intro_generique"   ⏱ 0min
Étape 2 : Relance 1            Template : "relance_24h"       ⏱ 24h
[+ Ajouter une étape]
```

Switcher sur une offre charge la séquence de cette offre (ou propose **"Dupliquer depuis Par défaut"** si vide).

Bouton **"Supprimer la séquence dédiée à cette offre"** → reverts à la séquence par défaut.

### Hooks

`useSequenceSteps(offerId | null)` accepte un argument optionnel pour filtrer. `useUpsertSequenceStep` inclut `offer_id` dans le payload.

---

## Partie 2 — Refonte UX `/settings/automation`

### Problème actuel

4 onglets, chacun bourré de cartes. Mode test, switch global, conditions de déclenchement, fenêtre 24h, prompts contextuels, A/B test, brief IA, templates… Tout est au même niveau visuel, rien ne guide.

### Nouvelle structure

```text
┌─ Header compact ──────────────────────────────────┐
│ 🤖 Automatisation WhatsApp                        │
│ [Mode test ⚠] [Active ✓] [3 séquences actives]    │
│                              [▶ Lancer maintenant]│
└───────────────────────────────────────────────────┘

┌─ Sélecteur d'offre (sticky) ──────────────────────┐
│ Séquence pour : [ Par défaut ▼ ]                  │
└───────────────────────────────────────────────────┘

┌─ Vue principale : Séquence visuelle ──────────────┐
│  🆕 Nouveau lead                                  │
│   │                                               │
│   ▼  Étape 1 — Intro      [template] [délai] [✎] │
│   │                                               │
│   ▼  Étape 2 — Relance    [template] [délai] [✎] │
│  [+ Ajouter une étape]                            │
└───────────────────────────────────────────────────┘

┌─ Réglages avancés (accordéon, fermé par défaut) ──┐
│ ▸ Brief IA (ton, exemples, prompts contextuels)   │
│ ▸ Conditions de déclenchement (sources, statut)   │
│ ▸ Fenêtre 24h & escalade appel                    │
│ ▸ Templates WhatsApp (catalogue Meta)             │
│ ▸ Mode test & exécution                           │
└───────────────────────────────────────────────────┘
```

### Principes

- **Une seule action principale visible** : éditer la séquence affichée.
- **Sélecteur d'offre toujours visible** → on sait pour quelle niche on configure.
- **Réglages globaux cachés dans un accordéon** "Réglages avancés" → on ne les voit que si on en a besoin.
- **Header status compact** : badges + bouton "Lancer maintenant" remplacent les 3 cartes du haut actuelles.
- **Templates** deviennent une sous-section de l'accordéon (ils ne sont consultés qu'à la création initiale ou lors d'un ajout).
- **Brief IA + prompts contextuels** regroupés en une seule sous-section avec toggles "personnaliser" pour éviter d'afficher 4 textareas vides par défaut.

### Composants modifiés / créés

- `SettingsAutomationPage.tsx` → réécriture du layout (header + sélecteur + accordéon).
- `SequenceEditor.tsx` → ajoute la prop `offerId`, le sélecteur d'offre, l'action "Dupliquer depuis Par défaut".
- Nouveau `OfferSequenceSwitcher.tsx` (sélecteur + bouton dupliquer/supprimer).
- Réutilisation des sections existantes (Brief IA, Conditions, etc.) dans un `<Accordion>` shadcn.

---

## Migration DB (résumé non-technique)

- Ajout d'un champ "offre" sur les étapes de séquence pour pouvoir avoir une séquence différente par offre.
- Quand un nouveau lead est créé, le système cherche d'abord la séquence de son offre, sinon prend la séquence par défaut.
- Aucune perte de données : toutes les étapes existantes deviennent automatiquement "Par défaut".

## Hors-périmètre

- Pas de duplication de la table `followup_automation_settings` par offre (le brief IA et les réglages globaux restent partagés). Si tu veux aussi un brief IA par offre plus tard, on l'ajoutera dans une 2e itération.
- Templates Meta restent globaux (gérés côté WABA, pas de tag offre stocké chez Meta).
