# Enregistrement des appels dans la fiche lead

## Ce que le setter verra
- Dans la fiche lead, onglet interactions : un bouton **« Enregistrer l'appel »** (gros bouton rouge, simple sur mobile).
- Pendant l'appel : chrono, indicateur de son, boutons **Pause** et **Terminer**.
- À la fin : l'appel apparaît dans l'historique du lead avec :
  - un lecteur audio (seulement les voix, sans les silences ni la sonnerie),
  - la durée réelle parlée,
  - la transcription complète,
  - un résumé court (besoin, objections, prochaine étape) et un score suggéré.
- Le setter peut supprimer un enregistrement ; toi (propriétaire) tu vois les appels de tous les setters du workspace, un setter ne voit que ceux de ses leads.

## Important : ce qui est enregistré
Le CRM enregistre le son que capte le micro du téléphone/ordinateur où il est ouvert. Donc :
- Appel passé **en haut-parleur** depuis un autre téléphone, ou sur ordinateur : les deux voix sont captées.
- Sur ordinateur, option « capturer le son de l'ordinateur » pour un appel WhatsApp Desktop / Meet : voix du client nette.
- Un appel GSM classique passé sur le même téléphone que le CRM : le téléphone bloque souvent le micro, seul le haut-parleur d'un autre appareil marche.
- Message légal affiché au démarrage : « Prévenez le prospect que l'appel est enregistré ».

## Garder les fichiers légers
1. **Format compressé pour la voix** (Opus, 16 kbit/s mono) : environ **7 Mo par heure** (contre 600 Mo en WAV).
2. **Suppression des silences et de la sonnerie** directement sur l'appareil avant l'envoi : seuls les passages de parole sont gardés (souvent 30 à 50 % plus court).
3. **Durée de conservation de l'audio** réglable par workspace (par défaut 90 jours) : ensuite l'audio est supprimé automatiquement, la transcription et le résumé restent pour toujours (quelques Ko).
4. Limite de durée par enregistrement (ex. 60 min) et indicateur d'espace utilisé dans les réglages.

Exemple : 20 appels de 10 min par jour ≈ 25 Mo/jour, environ 2 Go sur 90 jours, puis stable.

## Détails techniques
- Table `call_recordings` (lead_id, workspace_id, user_id, storage_path, duration_speech_s, size_bytes, transcript, summary, status, audio_expires_at) + GRANT/RLS (membres du workspace ; setter = ses leads assignés ou créés). Lien vers une `lead_activities` de type `call`.
- Bucket privé `call-recordings` (limite 30 Mo/fichier), chemins `{workspace_id}/{lead_id}/{id}.webm`, politiques storage par membre du workspace.
- Front : `MediaRecorder` (`audio/webm;codecs=opus`, 16 kbps, mono) ; détection de voix par énergie via Web Audio (AnalyserNode) : on met en pause l'enregistreur après ~1,5 s de silence et on reprend à la parole → fichier ne contient que la voix. Option `getDisplayMedia({audio})` sur ordinateur, mixée avec le micro.
- Edge function `transcribe-call` : télécharge l'audio, transcription via `/v1/audio/transcriptions` (modèle de transcription par défaut, langue auto FR/arabe/darija), puis résumé structuré via le modèle chat par défaut ; écrit transcript + summary, met à jour la note d'activité.
- Cron quotidien : supprime les fichiers dont `audio_expires_at` est passé (garde transcript/résumé). Réglage `call_audio_retention_days` sur `workspaces`.
- Composants : `CallRecorderButton`, `CallRecordingCard` (lecteur + transcription repliable) dans la timeline du lead.
