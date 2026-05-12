# Inbox Meta unifié — Messenger + Instagram DM + WhatsApp

Objectif : transformer `/conversations` (aujourd'hui WhatsApp only) en inbox multi-canal Meta. Mode dev Meta suffit pour démarrer (pas besoin d'App Review immédiate).

## 1. Scopes & autorisations Meta

Mettre à jour `facebook-auth-init` pour ajouter ces scopes à la liste actuelle :
- `pages_messaging` → recevoir/envoyer DM Messenger
- `instagram_basic` → lire le compte IG lié à la Page
- `instagram_manage_messages` → recevoir/envoyer DM Instagram

Pré-requis côté utilisateur : le compte IG doit être **Business ou Creator** et **lié à une Page Facebook** (réglage à faire dans l'app Instagram). Sinon IG n'apparaîtra pas dans le picker.

Bouton « Reconnecter Meta » dans `Settings > Intégrations` qui relance le flow OAuth pour accepter les nouveaux scopes (les tokens existants n'ont pas ces droits).

## 2. Configuration Meta App (côté dashboard developers.facebook.com)

À faire manuellement par toi (je te guiderai) :
- Ajouter le produit **Messenger** + **Instagram** à l'app Meta
- Ajouter les abonnements webhook sur la Page : `messages`, `messaging_postbacks`, `message_reactions` (objet `page` pour Messenger, objet `instagram` pour IG DM)
- Réutiliser le même Callback URL et Verify Token que le webhook existant

## 3. Base de données

Migration sur la table existante `whatsapp_messages` (à renommer logiquement, on garde le nom physique pour pas casser) :
- Ajouter colonne `channel` (`whatsapp` | `messenger` | `instagram`), default `whatsapp` pour le legacy
- Ajouter colonne `external_thread_id` (PSID Messenger / IGSID Instagram)

Nouvelle table `meta_channel_identities` (par workspace) :
- `workspace_id`, `page_id`, `page_name`, `page_access_token`
- `instagram_business_account_id` (nullable)
- `is_subscribed_messages` (bool)

Étendre `leads.source` enum pour inclure `messenger` et `instagram`.

## 4. Webhook unifié

Étendre `facebook-webhook` :
- Si `entry[].messaging` présent + `object = page` → Messenger handler
- Si `object = instagram` → IG DM handler
- Mapper PSID/IGSID → lead existant (par `external_thread_id`) sinon créer le lead avec source `messenger` ou `instagram` (récupérer nom/photo via Graph API `/{psid}?fields=name,profile_pic`)
- Insérer le message dans `whatsapp_messages` avec le bon `channel`
- Trigger `notify-new-lead` comme pour les autres canaux

## 5. Envoi de messages

Deux nouvelles edge functions :
- `send-messenger-message` → `POST graph.facebook.com/v21.0/me/messages` avec page token, body `{recipient:{id:psid}, message:{text}}`
- `send-instagram-message` → idem mais sur le compte IG Business

Une fonction wrapper côté client `sendChannelMessage(channel, ...)` qui dispatch vers la bonne edge function (WhatsApp existante / Messenger / IG). Gestion fenêtre 24h identique à WA dans l'UI.

## 6. UI conversations multi-canal

- `useWhatsAppInbox` → `useConversationsInbox` (charge tous canaux, filtre `channel`)
- `ConversationsPage` : ajouter onglets/chips de filtre **Tous / WhatsApp / Messenger / Instagram** avec icônes
- Badge canal sur chaque thread (logo WA vert / Messenger bleu / IG dégradé)
- `WhatsAppChat` → `ChannelChat` : bandeau 24h, picker de scripts, et bouton envoi qui appelle la bonne fonction selon le canal du thread
- `HeaderMessages` : compteur unread tous canaux confondus

## 7. Détails techniques

- **PSID vs phone** : Messenger/IG n'ont pas de numéro, on identifie le lead par `external_thread_id` + `meta_channel_identities.page_id`
- **Fenêtre 24h** : Messenger autorise au-delà via tags (`HUMAN_AGENT`, `CONFIRMED_EVENT_UPDATE`...). Pour l'instant on bloque comme WA, on ajoutera les tags plus tard
- **Pas d'App Review en mode dev** : seuls les comptes admins/dev/testeurs de l'app Meta peuvent envoyer des messages. Pour ouvrir à des clients externes il faudra soumettre `pages_messaging` et `instagram_manage_messages` (1-2 semaines, screencast + cas d'usage)
- **Médias** : V1 texte uniquement. Images/audio Messenger+IG dans une itération suivante (fonctions dédiées avec `attachment.payload.url`)

## 8. Découpage en livraisons

```text
Étape 1  Scopes + bouton reconnexion + migration DB              (rapide)
Étape 2  Webhook Messenger + envoi Messenger                      (cœur)
Étape 3  Webhook Instagram + envoi Instagram                      (idem patron)
Étape 4  UI multi-canal (filtres, badges, ChannelChat)            (front)
Étape 5  Polish : médias, tags 24h, App Review prep               (plus tard)
```

Je propose d'enchaîner Étape 1 → 2 → 3 → 4 dans cette session si tu valides.
