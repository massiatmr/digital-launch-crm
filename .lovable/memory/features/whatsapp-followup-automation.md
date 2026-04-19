---
name: WhatsApp followup automation
description: Système complet de relances WhatsApp + IA + détection inactivité + escalade appel manuel + bascule template 24h
type: feature
---
Couche additive (n'altère pas pipeline/leads). Tables: `lead_followup_tasks`, `whatsapp_messages`, `lead_conversation_state`, `followup_automation_settings` (+ colonnes `trigger_sources`, `trigger_only_new_status`, `inactivity_threshold_hours` défaut 12, `enable_call_escalation` défaut true, `enable_24h_template_switch` défaut true, `template_reactivation_id`).

**Task types** : `initial_message`, `followup_1`, `followup_2`, `last_followup`, `qualification`, `propose_meeting`, `reactivation` (silence après réponse), `template_24h` (bascule auto fenêtre fermée), `manual_call` (action humaine, pas d'envoi auto).

**Triggers SQL** :
- `create_followup_sequence_for_lead` (AFTER INSERT leads) génère 6 tâches selon filtres (auto+source+status).
- `handle_inbound_whatsapp` annule relances futures dès qu'inbound arrive et bascule QUALIFIED.

**Edge functions** :
- `generate-followup-message` (Gemini Flash via Lovable AI)
- `execute-followup-task` (1 tâche, supporte template Meta + texte libre dans fenêtre 24h, skip `manual_call`)
- `process-followup-tasks` (batch via pg_cron chaque minute)
- `detect-inactive-conversations` (pg_cron toutes les 15 min) : crée `reactivation` si silence > seuil, `template_24h` si fenêtre fermée + template configuré, `manual_call` si lead chaud + 2 relances OU lead engagé silencieux 24h+. Push notif owner via OneSignal + insert dans `reminders`.
- `preview-template-message`

**UI** `/settings/automation` : 4 onglets (Séquence / Templates / Brief IA / Réglages). Onglet Réglages contient 4 cartes : Mode test, Activation auto, Conditions de déclenchement (status+sources), **Relances humaines & fenêtre 24h** (délai inactivité, escalade appel toggle, bascule template 24h + sélecteur template). Composant `FollowupTimeline` sur fiche lead affiche tous types y compris reactivation/template_24h/manual_call.

**WhatsApp Meta branché** : envoi templates + texte libre fenêtre 24h opérationnel (config dans `whatsapp_config`).
