## Objectif

Quand un lead arrive via une landing page externe **avec un RDV pris immédiatement** ou meme quelques minutes apres le premier signal (endpoint `landing-book`), déclencher une **séquence WhatsApp différente** de celle utilisée pour les leads Meta/IA — configurable **par offre**, et **sans la phase de qualification IA** (le RDV est déjà pris).

## Comportement fonctionnel

- **Déclencheur unique** : appel réussi à `landing-book` → lead créé/rattaché + booking créé (laisser quelques minutes le temps que le lead choissise un creneau).
- **Sur ce chemin uniquement** :
  - La séquence de qualification IA standard est **désactivée** pour ce lead (aucune tâche `qualification`, `followup_1/2`, `last_followup` créée).
  - Une **nouvelle séquence "RDV direct site"** attachée à l'offre est déclenchée à la place.
  - Les rappels avant RDV (24h/12h/1h) existants continuent de fonctionner normalement (ils sont liés au booking, pas à la séquence lead).
- Les leads Meta/formulaire IA gardent exactement le flux actuel.

## Portée : "par offre"

Chaque offre peut définir sa propre séquence "RDV direct site", indépendante de la séquence globale de qualification. Fallback : si l'offre n'a rien défini, on utilise une séquence par défaut au niveau workspace ; si rien non plus, aucun message auto n'est envoyé (les rappels de booking suffisent).

## Modèle de données

Réutilise `followup_sequence_steps` en ajoutant deux colonnes de scoping :

```
followup_sequence_steps
  + sequence_kind text NOT NULL DEFAULT 'qualification'
      -- 'qualification' (existant) | 'website_booking' (nouveau)
  + offer_id uuid NULL REFERENCES offers(id) ON DELETE CASCADE
```

Résolution à l'exécution (ordre) :

1. `sequence_kind = 'website_booking'` + `offer_id = <offre du lead>`
2. `sequence_kind = 'website_booking'` + `offer_id IS NULL` + `workspace_id = <ws>` (fallback workspace)
3. rien → pas de séquence auto (les rappels de booking restent actifs)

Aucune migration destructive : toutes les lignes existantes deviennent `sequence_kind = 'qualification'` avec `offer_id = NULL` (comportement actuel préservé).

## Backend

### 1. Migration

- Ajouter `sequence_kind` + `offer_id` à `followup_sequence_steps`.
- Index sur `(workspace_id, sequence_kind, offer_id, step_order)`.
- Politiques RLS existantes conservées (déjà scoping owner/workspace).

### 2. Trigger `create_followup_sequence_for_lead`

Adapter pour :

- Si le lead vient de `landing-book` (marqueur : `lead.source = 'website'` **ET** un booking existe pour ce lead créé dans les 60s) → **ne PAS créer** les étapes `sequence_kind='qualification'`. À la place, itérer les étapes `sequence_kind='website_booking'` résolues selon l'ordre ci-dessus.
- Sinon : comportement actuel inchangé.

Alternative plus propre côté code : la fonction `landing-book` passe un flag `skip_qualification=true` lors de l'insert lead (via `metadata.website_booking = true`), et le trigger lit ce flag. C'est la voie retenue → pas d'ambiguïté temporelle.

### 3. `supabase/functions/landing-book`

- Après création du lead + booking, marquer `leads.metadata.website_booking = true` et `booking_context = 'direct_site'`.
- Le trigger SQL lit ce flag pour choisir la séquence.

### 4. `supabase/functions/execute-followup-task` / `process-followup-tasks`

Aucun changement de logique — les tâches créées avec les steps de la nouvelle séquence sont traitées comme les autres (même moteur d'envoi, même throttle, même annulation sur réponse inbound).

## Frontend

### `/settings/automation` → onglet "Séquence"

- Ajouter un **switcher de contexte** en haut : `Qualification IA` | `RDV direct site (landing)`.
- Quand on est sur "RDV direct site" : ajouter un sélecteur d'offre (`Toutes les offres (défaut workspace)` ou une offre précise).
- Le composant `SequenceEditor` existant est réutilisé, avec `sequence_kind` et `offer_id` passés en props.
- Hooks `useSequenceSteps` / `useUpsertSequenceStep` étendus pour accepter ces deux filtres.

### `OfferSequenceSwitcher` (déjà présent)

- Étendre pour montrer les 2 dimensions : `kind` et `offer`.

Aucune modification du reste de l'UI (Pipeline, Conversations, Bookings).

## Garde-fous

- Si un lead website avec RDV répond en WhatsApp avant la fin de la séquence, `handle_inbound_whatsapp` annule les tâches en attente (comportement déjà en place, aucun changement).
- Si l'offre est modifiée après création du lead, on ne rebascule pas de séquence (idempotence).
- Test rapide accessible via `/settings/tests` : bouton "Simuler booking landing" qui appelle `landing-book` en dry-run.

## Ce qui **ne change pas**

- Flux Meta/lead form → séquence qualification IA identique.
- Rappels booking 24h/12h/1h (email + WhatsApp) → identiques.
- Détection RDV depuis conversation → identique.
- Landing API keys / endpoints publics → identiques.

## Résumé des fichiers touchés

- **Migration SQL** : `followup_sequence_steps` (2 colonnes + index), fonction `create_followup_sequence_for_lead` (branchement sur `metadata.website_booking`).
- **Edge function** : `supabase/functions/landing-book/index.ts` (poser le flag metadata).
- **Frontend** :
  - `src/hooks/useSequenceSteps.ts` (filtres kind + offer)
  - `src/components/automation/SequenceEditor.tsx` (props kind/offer)
  - `src/components/automation/OfferSequenceSwitcher.tsx` (switch kind + picker offre)
  - `src/pages/SettingsAutomationPage.tsx` (nouvel onglet contexte)