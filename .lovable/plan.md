
# Compléter l'inbox WhatsApp — filet de sécurité avant d'allumer l'automation

Objectif : tu dois pouvoir allumer l'automation WhatsApp sans risquer qu'un message auto interrompe une conversation manuelle, ne jamais rater un vocal, et trier rapidement ce qui demande ta réponse.

## 1. Filet de sécurité automation (priorité haute)

### a. Bandeau "Prochaine relance auto" dans le header du chat
Au-dessus du chat, afficher la prochaine `lead_followup_tasks` `scheduled` :
- Texte : "Relance auto prévue dans 2j 14h — *Followup #2*"
- Boutons : **Annuler cette relance** · **Reporter à…** (24h / 3j / 7j) · **Voir le message**
- Si plusieurs prévues : "+3 autres" → ouvre un panneau latéral

### b. Bouton "Je prends la main" dans le header
Toggle persistant qui pause TOUTE la séquence pour ce lead :
- Nouvelle colonne `automation_paused_at` sur `lead_conversation_state`
- Trigger côté worker `process-followup-tasks` : skip si `automation_paused_at IS NOT NULL`
- Visuel : badge "🔒 Automation en pause" dans le header + dans la liste de gauche
- Bouton "Réactiver" pour remettre la séquence

### c. Auto-pause quand TU envoies un message manuel
Étendre `handle_inbound_whatsapp` (qui annule déjà sur inbound) → nouveau trigger `handle_manual_outbound` :
- Si message outbound a `metadata->>'sent_by_user' = true` (vs auto) → set `automation_paused_at = now()` sur `lead_conversation_state`
- Marquer dans `send-whatsapp-message` les envois manuels avec ce flag dans metadata
- Toast info : "Automation mise en pause — tu as pris la main"

### d. Vue globale "Relances programmées" (nouvelle page `/conversations/scheduled`)
Onglet/lien depuis l'inbox :
- Liste toutes les `lead_followup_tasks` `scheduled` à venir (7j) avec lead, type, date, aperçu message
- Filtres : aujourd'hui / 24h / 7j / type
- Actions en lot : annuler sélection · reporter sélection · pause auto sur leads sélectionnés
- Compteur dans le header de l'inbox : "⚠️ 12 relances dans 24h"

## 2. Gestion vocaux

### a. Résumé IA 1-ligne au-dessus du transcript
Nouveau bouton edge `summarize-voice` (Gemini Flash) appelé après transcription :
- Stocke `summary_oneline` dans `whatsapp_messages` (nouvelle colonne)
- Affiché en gras au-dessus du transcript : "💡 Demande prix pour 3 sites + délai"

### b. Lecteur vocal : vitesse + scrub
Étendre `VoiceMessagePlayer` :
- Boutons 1x / 1.5x / 2x (mémorisé localStorage)
- Barre de progression cliquable/draggable (scrub)
- Affichage durée écoulée / totale

### c. Notification push différenciée pour vocaux
Dans `whatsapp-webhook` quand type = audio :
- Push avec titre "🎙️ Vocal de {nom}" + corps = transcript (ou "Transcription en cours…")
- Action button push : "Écouter" → ouvre directement la conv

## 3. Triage inbox

### a. Onglets en haut de la liste
Au-dessus du search :
`Tous` · `Non lus` · `À répondre` · `En attente client` · `Snoozées` · `Résolues`
- "À répondre" = dernier message inbound non répondu
- "En attente client" = dernier message outbound (balle dans son camp)
- Logique purement client (pas de DB) sauf snooze/résolue

### b. Snooze conversation
Nouvelle table `conversation_snooze` (lead_id PK, snoozed_until, reason)
- Bouton "⏰ Snooze" dans header chat → 1h / 4h / demain matin / lundi / custom
- Conv masquée de "Tous"/"Non lus"/"À répondre" jusqu'à `snoozed_until`
- Apparaît dans onglet "Snoozées" + push notif quand reviens

### c. Marquer résolu / archiver
Même table : `resolved_at`
- Bouton "✓ Résolu" dans header chat
- Conv masquée de "Tous"/"Non lus" → onglet "Résolues"
- Auto-réouverture si nouveau message inbound

### d. Étiquettes colorées
Nouvelle table `conversation_labels` (workspace_id, name, color) + table de jointure `conversation_label_assignments`
- 5 labels par défaut seedés : Chaud (rouge), Tiède (orange), Froid (bleu), Objection (jaune), VIP (violet)
- CRUD labels dans `/settings/labels`
- Picker de label dans header chat (multi-select)
- Pastilles de couleur visibles dans la liste à gauche + filtre par label

## 4. Aide IA — 3 suggestions de réponse

Au-dessus du clavier (collapsable, expandé par défaut quand dernier msg = inbound) :
- 3 "puces" cliquables avec début de réponse (ex : "OK super, on peut caler…", "Compris, dis-m'en plus sur…", "Voici le lien de réservation…")
- Edge function `suggest-replies` : prend les 10 derniers messages + qualification + offer → Gemini Flash → renvoie 3 réponses courtes (≤ 200 car) avec angles différents (booker / qualifier / objection)
- Clic sur une puce = remplit le textarea (éditable avant envoi)
- Bouton "↻" pour régénérer

## Détails techniques

### Migrations DB
- `lead_conversation_state` : add `automation_paused_at TIMESTAMPTZ`
- `whatsapp_messages` : add `summary_oneline TEXT`, `metadata JSONB DEFAULT '{}'`
- nouvelle table `conversation_snooze (lead_id PK, owner_id, workspace_id, snoozed_until, resolved_at, reason TEXT)`
- nouvelles tables `conversation_labels` + `conversation_label_assignments`
- Trigger `handle_manual_outbound` qui set `automation_paused_at` si `metadata->>'sent_by_user' = true`
- Worker `process-followup-tasks` : skip si `automation_paused_at IS NOT NULL` ET pas de re-pause si lead a snooze actif

### Edge functions
- `summarize-voice` (nouvelle) — appelée post-transcription
- `suggest-replies` (nouvelle) — Gemini Flash, contexte 10 msg + qualif
- `send-whatsapp-message` (modif) — accepte `sent_by_user: true`, le passe en metadata
- `whatsapp-webhook` (modif) — push titre "🎙️ Vocal" si audio + déclenche `summarize-voice`

### Fichiers UI principaux
- `ConversationsPage.tsx` : ajouter onglets de filtres + compteur relances
- `WhatsAppChat.tsx` : header enrichi (next followup banner, pause toggle, snooze, résolu, labels) + suggestions IA au-dessus du clavier
- `VoiceMessagePlayer.tsx` : vitesse + scrub + résumé IA
- nouveau `components/conversations/NextFollowupBanner.tsx`
- nouveau `components/conversations/SuggestedReplies.tsx`
- nouveau `components/conversations/InboxTabs.tsx`
- nouveau `components/conversations/LabelPicker.tsx` + `LabelsManageDialog.tsx`
- nouvelle page `pages/ScheduledFollowupsPage.tsx`

## Ordre d'implémentation suggéré
1. **Filet automation** (1a, 1b, 1c) — c'est la peur principale, à débloquer en premier
2. **Vocaux** (2a, 2b, 2c) — protection quotidienne
3. **Onglets + snooze + résolu** (3a, 3b, 3c)
4. **Suggestions IA** (4) + **Labels** (3d)
5. **Vue globale relances** (1d)

Dis-moi si tu veux qu'on découpe en plusieurs livraisons ou tout d'un coup.
