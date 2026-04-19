---
name: WhatsApp followup automation
description: Système complet de relances WhatsApp + IA + détection inactivité + escalade appel manuel + bascule template 24h + séquence dynamique éditable + test accéléré
type: feature
---
Couche additive (n'altère pas pipeline/leads). Tables: `lead_followup_tasks`, `whatsapp_messages`, `lead_conversation_state`, `followup_automation_settings`, **`followup_sequence_steps`** (NEW : séquence dynamique éditable par owner).

**Table `followup_sequence_steps`** : `step_order`, `task_type`, `delay_value` + `delay_unit` (minutes|hours|days), `template_id`, `label`, `is_enabled`. Migration auto des 4 étapes historiques.

**Task types** : `initial_message`, `followup_1`, `followup_2`, `last_followup`, `qualification`, `propose_meeting`, `reactivation`, `template_24h`, `manual_call`. Tous sélectionnables comme étape custom.

**Triggers SQL** :
- `create_followup_sequence_for_lead` (AFTER INSERT leads) **itère désormais `followup_sequence_steps`** (au lieu des 4 délais figés). Respecte filtres source/status/is_enabled.
- `handle_inbound_whatsapp` annule relances futures dès qu'inbound arrive et bascule QUALIFIED.

**Edge functions** :
- `generate-followup-message` (Gemini Flash via Lovable AI)
- `execute-followup-task` (1 tâche, supporte template Meta + texte libre fenêtre 24h, skip `manual_call`)
- `process-followup-tasks` (batch via pg_cron chaque minute)
- `detect-inactive-conversations` (pg_cron toutes les 15 min) : crée `reactivation`, `template_24h`, `manual_call` selon contexte. Push notif owner via OneSignal.
- `preview-template-message`
- **`test-followup-sequence`** (NEW) : déclenche TOUTE la séquence d'un owner sur un lead choisi avec délais ÷60 (minutes→secondes, heures→minutes, jours→heures, min 5s entre étapes). Annule les tâches existantes du lead avant.

**UI `/settings/automation`** : 4 onglets. Onglet **Séquence** = `SequenceEditor` dynamique : ajout/suppression/réordonnancement (↑↓), label éditable inline, switch enable, sélecteur valeur+unité, sélecteur template (ou IA texte libre). Hooks dans `src/hooks/useSequenceSteps.ts` (`useSequenceSteps`, `useUpsertSequenceStep`, `useDeleteSequenceStep`, `useReorderSequenceSteps`).

**UI `/settings/tests`** : carte "Test séquence accélérée" avec sélecteur de lead (20 derniers) + bouton qui invoke `test-followup-sequence`.

**WhatsApp Meta branché** : envoi templates + texte libre fenêtre 24h opérationnel (`whatsapp_config`).
