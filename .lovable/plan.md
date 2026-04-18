
L'utilisateur demande si on peut basculer les notifs vers une solution externe (ex: OneSignal) au lieu de gérer les Web Push nous-mêmes via VAPID/`send-push`.

## Réponse courte : oui, et c'est une bonne idée

Le système Web Push actuel (VAPID + `send-push` + `push_subscriptions`) est fragile sur iOS (PWA obligatoire, Safari capricieux, headers Apple stricts → on a déjà eu `BadJwtToken`, `BadWebPushTopic`). OneSignal abstrait tout ça.

## Options possibles

**OneSignal (recommandé)**
- Gratuit jusqu'à 10k abonnés mobile web
- SDK web qui gère la subscription, les permissions, le service worker, et le push iOS PWA
- API REST simple côté serveur : `POST /notifications` avec `external_user_id` → ils s'occupent du routing multi-device
- Dashboard avec logs de delivery natifs

**Alternatives**
- **Pushover** : ultra simple, mais payant ($5 one-time par plateforme user) et orienté notifs perso
- **Firebase Cloud Messaging (FCM)** : gratuit et robuste, mais setup plus lourd (Firebase project, config iOS PWA quand même nécessaire)
- **Novu** : open-source, multi-canal (push/email/SMS), plus complexe

## Plan proposé : OneSignal

### 1. Setup OneSignal
- Créer compte OneSignal + app "Web Push"
- Récupérer **App ID** (public) et **REST API Key** (secret)
- Configurer le site (URL preview + URL prod)

### 2. Frontend
- Installer `react-onesignal`
- Init dans `App.tsx` avec l'App ID
- Au login : `OneSignal.login(user.id)` → lie le device à l'`external_user_id`
- Remplacer `usePushNotifications` (bouton "Activer notifs") par `OneSignal.Notifications.requestPermission()`
- Service worker OneSignal remplace `/service-worker.js` (ou cohabite)

### 3. Backend (edge functions)
- Nouvelle fonction `send-onesignal-notification` qui appelle :
  ```
  POST https://api.onesignal.com/notifications
  Headers: Authorization: Key {REST_API_KEY}
  Body: { app_id, include_aliases: { external_id: [user_id] }, headings, contents, url }
  ```
- Modifier `whatsapp-webhook` et `check-due-reminders` pour appeler `send-onesignal-notification` au lieu de `send-push`
- Garder `send-push` désactivé/supprimé

### 4. Cleanup (optionnel après validation)
- Supprimer table `push_subscriptions`, `push_delivery_logs`
- Supprimer secrets VAPID
- Supprimer `usePushNotifications`, `EnablePushButton` (remplacés par OneSignal UI)

## Secrets nécessaires
- `ONESIGNAL_APP_ID` (public, peut être dans `.env`)
- `ONESIGNAL_REST_API_KEY` (secret edge function)

## Ce que tu dois faire de ton côté
1. Créer compte OneSignal et app Web Push
2. Me donner l'App ID + REST API Key

## Avantages vs actuel
- ✅ iOS PWA fonctionne sans bricoler les headers VAPID
- ✅ Dashboard OneSignal pour debug (pas besoin de `SettingsTestsPage` pour les push)
- ✅ Pas de gestion de subscription/expiration côté serveur
- ✅ Multi-device automatique via `external_user_id`

## Inconvénients
- Dépendance externe (mais gratuit < 10k users)
- Service worker OneSignal peut entrer en conflit avec ton SW PWA actuel (à valider)

## Question avant de partir
Tu confirmes **OneSignal**, ou tu veux comparer avec **FCM (Firebase)** d'abord ?
