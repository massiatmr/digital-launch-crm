## Plan : Corriger les relances + recadrer l'IA vers la prise de RDV

### Diagnostic

**Bug n°1 — Les relances après le 1er message ne partent jamais**
La fonction `execute-followup-task` cherche le template à utiliser dans `followup_automation_settings.template_followup_1_id` (champ historique, **NULL** chez toi). Or ton template est en réalité configuré sur l'**étape de la séquence** (`followup_sequence_steps.template_id` = `lead_followup_intro`). Comme aucun template n'est trouvé, l'exécuteur tombe sur la branche "texte libre IA" → la fenêtre 24h Meta est fermée → la tâche est marquée `skipped`. C'est exactement ce qu'on voit dans la base :

> `followup_1` → status `skipped` → "Aucun template mappé et fenêtre 24h fermée"

**Bug n°2 — L'IA pose trop de questions**
Les `ai_instructions` par défaut disent *"qualifier progressivement (besoin, budget, urgence)"* → l'IA enchaîne 3 questions au lieu de proposer un RDV.

---

### Changements

**1. `execute-followup-task/index.ts` — lire le template depuis la séquence**
Avant de lire `template_xxx_id` dans `followup_automation_settings`, charger d'abord `followup_sequence_steps` pour la tâche en cours et utiliser son `template_id` en priorité. Lookup par : `(workspace_id || owner_id) + task_type + step_order`. Fallback sur les champs legacy si aucune ligne séquence trouvée.

→ Conséquence : ta `followup_1` (6h après) enverra bien le template `lead_followup_intro` même si le lead n'a pas répondu (Meta accepte les templates approuvés hors fenêtre 24h).

**2. `generate-followup-message/index.ts` — recadrer l'IA "closer"**
Réécrire le `systemPrompt` :

- Maximum **1 question** par message (pas 3)
- Après **1 réponse** du lead → proposer immédiatement un créneau de RDV (2 créneaux concrets cette semaine, format "Mardi 14h ou Jeudi 10h ?")
- Ajouter le **lien de booking** dans le contexte : si une `offers.slug` est liée au lead → `https://digital-launch-crm.lovable.app/offers/{slug}/page`, sinon mention "(propose 2 créneaux à confirmer)"
- Ton direct, conversationnel, max 2 phrases

**3. `followup_automation_settings.ai_instructions` — nouveau défaut**
Mise à jour du défaut SQL (et migration des lignes existantes qui ont encore le texte historique) :

> *"Tu es un closer humain. Pose max 3-5  questions essentielle pour qualifier (problème principal, urgence, ). Dès que le lead a donné un signal d'intérêt, propose un créneau précis (ex: 'Mardi 14h ou Jeudi 10h ?') ou partage le lien de réservation. Max 2 phrases. Pas de blabla."*

**4. UI `/settings/automation` (onglet IA)** — pré-remplir le textarea avec ce nouveau prompt si vide pour aider l'utilisateur à itérer.

---

### Fichiers touchés

- `supabase/functions/execute-followup-task/index.ts`
- `supabase/functions/generate-followup-message/index.ts`
- 1 migration SQL : update `followup_automation_settings.ai_instructions` (nouveau default + UPDATE des lignes existantes contenant l'ancien prompt)
- `src/pages/SettingsAutomationPage.tsx` (placeholder du textarea AI uniquement)

### Test après déploiement

1. Lancer le test séquence accélérée sur un nouveau lead → la 2ème étape (followup_1) doit passer en `sent` au lieu de `skipped`.
2. Faire répondre le lead → vérifier que la réponse IA propose directement 2 créneaux au lieu d'enchaîner les questions.