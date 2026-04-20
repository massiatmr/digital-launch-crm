

# Assistant IA — Chat unifié style ChatGPT + confirmation avant action

L'assistant actuel force l'utilisateur à choisir manuellement entre "Action IA" et "Question IA" via un toggle. C'est rigide et peu naturel. Objectif : un **chat conversationnel unique** qui détecte automatiquement l'intention (question, modification, création, RDV, import…) et **confirme toujours** avant toute écriture en base.

## Ce que tu vas voir

### 1. Interface unifiée style ChatGPT
- Plus de toggle "Action / Question" — un seul chat persistant avec bulles utilisateur à droite, réponses IA à gauche
- Avatar IA (Sparkles) + typing indicator pendant la réflexion
- Historique conversationnel gardé en mémoire (l'IA se souvient du contexte sur les 10 derniers tours)
- Markdown complet, bouton "Copier" par réponse, bouton "Effacer le chat"
- Suggestions rapides visibles uniquement quand le chat est vide
- Micro, pièce jointe (📎), drag-drop : **conservés** dans la barre de saisie

### 2. Détection automatique d'intention
À chaque message, l'IA classe l'intention en une des catégories :

| Intention | Action |
|---|---|
| `question` | Réponse textuelle directe (pas de DB touchée) |
| `update_lead` | Propose les modifs dans une **carte de confirmation** inline |
| `create_lead` | Propose la fiche lead à créer avec **bouton Confirmer / Annuler** |
| `book_meeting` | Affiche les créneaux dispos, confirmation avant création |
| `create_reminder` | Propose titre + date, confirmation avant insertion |
| `bulk_import` | Ouvre la preview existante (déjà en place) |

La détection se fait via **tool calling** Gemini : un seul appel retourne `{ intent, payload, assistant_reply }`.

### 3. Cartes de confirmation inline (la clé)
Au lieu d'un dialog qui pop, chaque action proposée apparaît **dans le fil de chat** comme une carte :

```text
[IA] Ok, je vais mettre à jour Marc Dupont :
  ┌────────────────────────────────┐
  │ ✎ Modifications proposées      │
  │ • Statut → Qualifié            │
  │ • Score → 🔥 Chaud              │
  │ • Note ajoutée : "Rappel demain"│
  │ [✓ Confirmer] [✎ Modifier] [✗] │
  └────────────────────────────────┘
```
Rien n'est écrit en base tant que l'utilisateur n'a pas cliqué **Confirmer**. Après confirmation, la carte se transforme en "✅ Appliqué" et le chat continue.

Pour une création de lead, la carte liste nom / email / téléphone / entreprise / source avec champs éditables inline avant confirmation.

## Architecture technique

### Backend — nouvelle edge function `ai-assistant-chat`
- Entrée : `{ messages: ChatMessage[], context: { pipeline_summary, leads_index, workspace_id } }`
- Un seul appel à Gemini 2.5 Flash avec **tool calling** définissant les actions possibles :
  - `answer_question(text)` 
  - `propose_update_lead(lead_id, changes, summary[])`
  - `propose_create_lead(fields)`
  - `propose_booking(date, time_slot?, contact)`
  - `propose_reminder(lead_id, action, due_date)`
- Retourne `{ intent, assistant_reply, payload }` — **jamais** d'écriture DB côté serveur. Le backend ne fait que proposer.
- Validation JWT (pattern existant)

### Frontend — refonte `GlobalNaturalLanguageInput.tsx`
- Suppression du state `mode`, `bookingIntent`, `proposal`, `showDialog` (dialog) → remplacés par un tableau unique `messages: ChatMessage[]` où chaque message peut contenir une `action_card` embedded
- Nouveau type :
```ts
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  action?: {
    type: 'update_lead' | 'create_lead' | 'booking' | 'reminder';
    payload: any;
    status: 'pending' | 'confirmed' | 'cancelled';
  };
};
```
- Nouveau composant `ActionCard` rendu inline dans le chat → bouton Confirmer appelle le hook approprié (`useApplyProposal`, `useCreateLead`, `useCreateReminder`, `handle-booking`)
- `useRef` d'un `AbortController` pour annuler les requêtes en vol

### Ce qu'on garde
- `useSpeechRecognition` (micro)
- Drag-drop + bouton 📎 + `BulkImportPreview` (intact)
- `useAnalyzeNote` / `useApplyProposal` / `useCreateLead` / `useCreateReminder` (réutilisés par les confirmations)
- `check-availability` et `handle-booking` (appelés depuis les cartes RDV)

### Ce qu'on supprime
- Toggle Mode Action/Ask
- Dialog modal de confirmation (`Dialog` actuel)
- Panneau bookingSlots externe (remplacé par carte inline)

## Fichiers touchés

| Fichier | Action |
|---|---|
| `supabase/functions/ai-assistant-chat/index.ts` | **Nouveau** — classifier + proposeur |
| `src/components/GlobalNaturalLanguageInput.tsx` | Refonte UI chat unifié, suppression du mode toggle |
| `src/components/assistant/ActionCard.tsx` | **Nouveau** — carte de confirmation inline (update / create / booking / reminder) |

## Étapes de livraison

1. Edge function `ai-assistant-chat` avec tool calling multi-intentions
2. Composant `ActionCard` (variantes update / create / booking / reminder) avec boutons Confirmer / Modifier / Annuler
3. Refonte `GlobalNaturalLanguageInput` en chat unique avec rendu des cartes dans le fil
4. Test end-to-end : question, modification de lead, création, RDV, rappel, import fichier

