
# Audit complet du comportement IA actuel

Ton IA est répartie sur **5 fonctions edge** + **1 trigger SQL** + **1 table de réglages** (`followup_automation_settings`). Voici la carte complète de qui décide quoi.

---

## 1. Cycle de vie d'une conversation (vue d'ensemble)

```text
Nouveau lead (Meta / manuel)
   │
   ▼
[Trigger SQL] create_followup_sequence_for_lead
   │   → crée les tâches de la séquence (intro + relances)
   │   → priorise séquence par offre, sinon "Par défaut"
   ▼
[Cron 1 min] process-followup-tasks
   │
   ▼
execute-followup-task  ──► génère + envoie le message
   │                       (template Meta OU texte IA libre)
   ▼
generate-followup-message  ──► écrit le texte WhatsApp
                               (système de prompts contextuels)

Lead répond
   │
   ▼
whatsapp-webhook (inbound)
   │  → trigger SQL handle_inbound_whatsapp :
   │     • annule TOUTES les relances auto en attente
   │     • crée une tâche "qualification" immédiate
   │  → appelle qualify-conversation (fire-and-forget)
   ▼
qualify-conversation  ──► extrait BANT + intent (Gemini Flash)
                          → décide actions auto :
                             - not_interested → lead "lost"
                             - ready_to_book  → tâche propose_meeting
                             - confirms_slot  → tâche slot_confirmation

[Cron 5 min] detect-inactive-conversations
   │
   ▼  3 cas :
   • reactivation  (silence > seuil, ex 12h, fenêtre <24h)
   • template_24h  (silence > 24h → template Meta)
   • manual_call   (lead chaud + 2 relances OU engagé puis silence 24h+)
```

---

## 2. Les 5 cerveaux IA et leurs instructions

### A. `generate-followup-message` — écrit les messages WhatsApp
**Le plus gros prompt.** Construit dynamiquement à chaque envoi.

Composé de :
1. **`baseInstructions`** = `settings.ai_instructions` ou fallback `"Tu es un closer humain, direct, conversationnel."`
2. **`contextualPrompt`** = sélectionné selon l'état du lead, parmi 5 modes :
   - `qualification` — pose 1 question essentielle
   - `objection` — recadre l'objection
   - `closing` — propose 2 créneaux
   - `reactivation` — réveille le silence
   - `slot_confirmation` — confirme le créneau accepté (4-5 phrases)
   - Choix automatique via `pickPromptKey(qualification, taskType)`.
   - Chaque mode peut être surchargé par `settings.prompt_<mode>`.
3. **Règles strictes injectées en dur dans le code** (non éditables aujourd'hui) :
   - Max 2 phrases (sauf slot_confirmation)
   - 1 seule question par message
   - Pas de "Bonjour" si déjà dit, pas de signature, 1 emoji max
   - **NICHE STRICTE** : interdit "chantier/BTP" si la niche ≠ bâtiment
   - **ANTI-RÉPÉTITION** : relire l'historique, changer d'angle
   - Email : ne jamais redemander si déjà connu
   - Créneaux : utiliser uniquement la liste calculée (Google Calendar sync)
4. **Contexte injecté** : nom, entreprise, source, message initial, offre (nom/niche/desc/features/prix), qualification BANT, historique 10 derniers messages, exemples de style (`settings.ai_examples`).
5. **Modèle** : `settings.ai_model` ou `google/gemini-3-flash-preview`.

### B. `qualify-conversation` — analyse les réponses du lead
- Prompt système **codé en dur** (analyste commercial → JSON BANT).
- Extrait : `pain_point`, `urgency`, `budget_signal`, `decision_maker`, `objections[]`, `interest_level (0-100)`, `intent` (8 valeurs), `summary`.
- Modèle : `google/gemini-2.5-flash` (hardcodé).
- Décide les **actions auto** : auto-stop si `not_interested`, crée `propose_meeting` si `ready_to_book`, crée `slot_confirmation` si `confirms_slot`.

### C. `detect-inactive-conversations` — surveille les silences
**Pas d'IA**, c'est de la logique pure. Mais 3 seuils décident du comportement :
- `inactivity_threshold_hours` (défaut 12) → tâche `reactivation`
- 24h → bascule `template_24h` (si `enable_24h_template_switch`)
- Escalade `manual_call` (si `enable_call_escalation`) : lead chaud + ≥2 relances OU engagé silencieux >24h

### D. `suggest-replies` — 3 suggestions dans l'inbox
- Prompt **codé en dur** : 3 angles fixes (closing / qualif / objection).
- Modèle hardcodé `gemini-2.5-flash`.

### E. Trigger `create_followup_sequence_for_lead` — programme la séquence
- Lit `followup_sequence_steps` (templates + délais) avec **priorité par offre** (sinon "Par défaut").
- Filtré par `trigger_sources` + `trigger_only_new_status`.

---

## 3. Ce qui est déjà personnalisable (table `followup_automation_settings`)

| Champ | Rôle |
|---|---|
| `is_enabled` | On/off global |
| `ai_instructions` | Ton/personnalité globale (texte libre) |
| `ai_examples` | Exemples de style (few-shot) |
| `ai_model` | Choix modèle Lovable AI |
| `prompt_qualification` / `_objection` / `_closing` / `_reactivation` | Surcharge des 4 modes contextuels |
| `trigger_sources[]` / `trigger_only_new_status` | Filtres déclenchement |
| `inactivity_threshold_hours` | Seuil silence pour réactivation |
| `enable_24h_template_switch` / `template_reactivation_id` | Bascule template Meta après 24h |
| `enable_call_escalation` | Escalade vers appel manuel |
| `enable_ab_test` | Variante B (autre angle) |
| `auto_stop_on_not_interested` | Lost auto si désintéressé |
| `dry_run` | Mode test (n'envoie pas réellement) |
| `initial_delay_minutes` / `followup_*_delay_*` | Délais legacy (remplacés par `followup_sequence_steps`) |
| `template_*_id` | Templates Meta par étape (legacy idem) |

---

## 4. Ce qui est **hardcodé** et que tu ne peux PAS encore régler

C'est le cœur de ce qu'il faut sortir en variables :

1. **Règles strictes** dans `generate-followup-message` :
   - Max phrases, max emoji, 1 question max, NICHE STRICTE, ANTI-RÉPÉTITION, gestion email
2. **Prompt par défaut `slot_confirmation`** (4-5 phrases structurées) — pas surchargeable
3. **Mapping intent → mode** (`pickPromptKey`) : ex. `interest_level >= 70 → closing`
4. **Prompt système de `qualify-conversation`** entièrement
5. **Prompt système de `suggest-replies`** + ses 3 angles fixes
6. **Modèles IA** de `qualify-conversation` et `suggest-replies` (forcés gemini-2.5-flash)
7. **Logique d'escalade** dans `detect-inactive-conversations` : seuil "2 relances", "24h", critère "score=hot"
8. **Anti-doublon** `propose_meeting` (10 min) et `slot_confirmation` (5 min)
9. **Label des tâches** (`TASK_LABEL` : intro/followup_1/...) injectés dans le prompt

---

## 5. Page de personnalisation proposée — `/settings/ai-behavior`

Objectif : transformer tout le hardcodé en **variables éditables**, par workspace ET optionnellement par offre.

### Structure de la page (3 onglets)

```text
┌─ Onglet 1 : Personnalité & ton ─────────────────────┐
│ • Brief global (ai_instructions)        [textarea]  │
│ • Exemples de style (ai_examples)       [textarea]  │
│ • Modèle IA              [select gemini/gpt]        │
│ • Sliders : longueur max (1-5 phrases)              │
│             nb questions max (1-2)                  │
│             emojis max (0-3)                        │
│ • Toggle : autoriser "Bonjour" répété               │
│ • Toggle : signer les messages                      │
└─────────────────────────────────────────────────────┘

┌─ Onglet 2 : Modes contextuels ──────────────────────┐
│ Pour chaque mode (qualification/objection/closing/  │
│ reactivation/slot_confirmation) :                   │
│   • Textarea du prompt                              │
│   • Bouton "Restaurer le défaut"                    │
│   • Aperçu : "Voici ce qui serait envoyé pour..."   │
│ Bloc "Mapping intent → mode" (avancé):              │
│   • Seuil interest_level pour passer en closing     │
│   • Toggle : objection détectée → mode objection    │
└─────────────────────────────────────────────────────┘

┌─ Onglet 3 : Garde-fous & règles ────────────────────┐
│ • Niche stricte : ON/OFF + mots interdits libre     │
│ • Anti-répétition : ON/OFF + nb messages à scanner  │
│ • Ne jamais redemander : email / téléphone / niche  │
│ • Auto-stop si not_interested                       │
│ • Seuils silence : réactivation (12h), template 24h │
│ • Escalade appel : ON/OFF + critères (score, nb)    │
│ • Anti-doublon : fenêtre propose_meeting (min)      │
└─────────────────────────────────────────────────────┘

┌─ Sticky en haut : sélecteur de scope ───────────────┐
│ Régler pour : [Par défaut ▼ / Offre A / Offre B]    │
│ (les offres héritent du défaut si rien défini)      │
└─────────────────────────────────────────────────────┘
```

### Détails techniques (pour quand on implémentera)

- **Étendre `followup_automation_settings`** avec colonnes :
  - `max_sentences`, `max_questions`, `max_emojis` (int)
  - `allow_repeated_greeting`, `allow_signature` (bool)
  - `niche_strict`, `forbidden_words` (text[])
  - `anti_repetition`, `history_scan_count` (bool + int)
  - `never_reask_fields` (text[] : email, phone…)
  - `interest_threshold_closing` (int, défaut 70)
  - `prompt_slot_confirmation` (text)
  - `qualify_system_prompt`, `qualify_model` (text)
  - `suggest_replies_system_prompt`, `suggest_replies_model` (text)
  - `propose_meeting_dedup_minutes`, `slot_confirmation_dedup_minutes` (int)
  - `call_escalation_min_followups`, `call_escalation_required_score` (int + text)
- **Optionnel par offre** : nouvelle table `followup_offer_overrides (offer_id, …mêmes colonnes…)` OU colonne `offer_id` nullable sur `followup_automation_settings` avec lookup hiérarchique (offre → workspace défaut). La 2e est plus simple.
- **Refactor des 5 fonctions edge** pour lire ces variables au lieu des constantes.
- **Composant `<PromptEditor>`** réutilisable : textarea + bouton restaurer défaut + bouton "tester sur un lead".
- **Mode test** : bouton "Prévisualiser le message qui serait envoyé maintenant pour le lead X" → appelle `generate-followup-message` en `dry_run`.

### Hors-périmètre de cette V1

- Édition visuelle du mapping intent → mode (drag&drop) → V2.
- Versioning / historique des prompts → V2.
- A/B testing avancé (au-delà du toggle existant) → V2.

---

## Prochaine étape

Confirme l'orientation :
1. Est-ce que la **portée par offre** (override par offre, héritage du défaut) est indispensable en V1, ou on garde tout au niveau workspace pour l'instant ?
2. Veux-tu que la page expose aussi les **prompts internes** (`qualify-conversation`, `suggest-replies`) ou on les laisse cachés en V1 pour ne pas surcharger ?
3. Une seule page `/settings/ai-behavior` séparée, ou on l'intègre dans l'accordéon "Réglages avancés" existant sur `/settings/automation` ?

Une fois ces 3 réponses, je passe en mode build.
