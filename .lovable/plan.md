
L'utilisateur veut des notifs WhatsApp qui marchent comme les notifs de tâches (qui fonctionnent bien).

Les tâches marchent via un cron qui appelle `check-due-reminders` → `send-push`. Le webhook WhatsApp avait été retiré. Je dois reproduire la même logique que les tâches mais déclenchée par les messages entrants.

Plan simple :

## Approche

Reproduire exactement la logique des notifs tâches (qui marchent) pour les messages WhatsApp entrants.

## Étapes

1. **Modifier `whatsapp-webhook/index.ts`**
   - Quand un message inbound est inséré dans `whatsapp_messages`, appeler `send-push` exactement comme `check-due-reminders` le fait pour les tâches.
   - Payload identique au format tâches :
     - `title`: `🔔 Nouveau message : {nom_lead}`
     - `body`: contenu du message (tronqué à 100 car)
     - `url`: `/conversations`
     - `tag`: court (`wa-msg`) — éviter le bug Apple `BadWebPushTopic` (>32 car)
   - Pas de logique custom, pas de filtrage par device, juste `user_id` → tous les devices actifs (comme les tâches).

2. **Tester end-to-end**
   - Envoyer un WhatsApp réel sur le numéro Meta connecté.
   - Vérifier réception sur Mac + iPhone.

## Ce qui ne change pas
- `send-push` (déjà fonctionnel pour les tâches).
- Notifs tâches (`check-due-reminders` + cron) — intactes.
- UI Conversations, realtime, inbox.

## Résultat attendu
Notif système identique à celle des tâches à chaque message WhatsApp entrant.
