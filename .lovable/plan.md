## Objectif

Transformer l'écran `/conversations` en expérience type WhatsApp natif (style hybride bulles WA + accents néon), 100% mobile-first, avec :
- Médias riches (image, vidéo, document, sticker)
- Citation/réponse à un message + réactions emoji
- Statuts de livraison ✓ envoyé · ✓✓ livré · ✓✓ bleu lu
- Recherche dans la conversation
- Vocaux améliorés (waveform, vitesse, transcription)
- **Appels voix entrants + sortants** via la WhatsApp Calling API (Meta, beta)

---

## 1. Base de données (1 migration)

Enrichir `whatsapp_messages` :
- `message_type` text (`text` | `image` | `video` | `document` | `sticker` | `audio` | `call_event`)
- `reply_to_wa_id` text (id du message cité)
- `reply_to_snapshot` jsonb (preview figé : auteur + extrait)
- `reactions` jsonb (`[{emoji, by, at}]`)
- `delivered_at`, `read_at` timestamptz
- `is_pinned` bool
- `media_filename`, `media_size_bytes`, `media_thumbnail_path`
- Index FTS : `tsvector` sur `content + transcript` pour recherche

Nouvelle table `whatsapp_calls` :
- `id`, `lead_id`, `owner_id`, `workspace_id`
- `direction` (`inbound`/`outbound`), `status` (`ringing`/`answered`/`missed`/`declined`/`ended`/`failed`)
- `wa_call_id`, `started_at`, `answered_at`, `ended_at`, `duration_seconds`
- `recording_path` (optionnel), `notes`
- RLS workspace, realtime activé

Trigger : à l'INSERT d'un appel `missed` → notif push owner + entrée timeline lead.

---

## 2. Edge functions

**Modifier**
- `whatsapp-webhook` : parser `messages.context` (reply), `messages.reactions`, `statuses` (sent/delivered/read → MAJ `delivered_at`/`read_at`), `messages.image|video|document|sticker` (download → storage), événements `calls` (inbound ringing/ended).
- `send-whatsapp-message` : accepter `reply_to_wa_id` + envoyer `context.message_id` à l'API Meta.

**Nouvelles**
- `send-whatsapp-media` : upload fichier client → storage `wa-media` → upload Meta → envoi message `image/video/document`.
- `send-whatsapp-reaction` : POST réaction emoji sur un wa_message_id.
- `whatsapp-call-initiate` : déclenche un appel sortant via Calling API (`POST /{phone_number_id}/call`).
- `whatsapp-call-action` : accept/reject/end un appel entrant (depuis la UI ou push notif).
- `whatsapp-call-webrtc-signal` : relais SDP/ICE pour la session WebRTC (Meta Calling API utilise WebRTC standard).
- `mark-conversation-read` : marque tous les inbounds d'un lead comme lus (envoie `read` receipts à Meta).

---

## 3. Storage

Nouveau bucket privé `wa-media` pour images/vidéos/docs entrants & sortants. Policies RLS workspace-scopées (lecture via signed URL 1h, comme `wa-audio`).

---

## 4. UI/UX — refonte `WhatsAppChat` + `ConversationsPage`

### Layout responsive

```text
DESKTOP (≥768px)            MOBILE (<768px)
┌──────────┬──────────┐     ┌──────────────┐
│  Inbox   │  Chat    │     │ Inbox  OU    │
│  320px   │  1fr     │     │ Chat (full)  │
└──────────┴──────────┘     └──────────────┘
```

Mobile : navigation à la WhatsApp (liste → tap → chat plein écran avec back button, header sticky).

### Header de conversation (sticky)
- Avatar (initiales colorées), nom, statut (`en ligne` / `vu il y a X` si dispo)
- Boutons : 📞 Appel · 🔍 Recherche · ⋮ Menu (épingler, vider, ouvrir fiche)

### Zone messages
- Bulles : inbound = `bg-card`, outbound = `bg-primary/15` avec accent néon `border-primary/30`
- Groupement par auteur + date (séparateurs `Aujourd'hui` / `Hier` / `JJ MMM`)
- **Tap long / hover** sur un message → barre d'actions flottante : Répondre · Réagir (😀❤️👍😂😮😢) · Copier · Épingler · Supprimer
- **Reply** : preview citée au-dessus du composer + dans la bulle (border-l-2 + nom + extrait, tap = scroll vers original)
- **Réactions** : pastille `❤️ 1` sous la bulle, tap pour voir détails
- **Statuts** : ⏱ envoi · ✓ envoyé · ✓✓ livré · ✓✓ (bleu/cyan) lu · ⚠ échec → tap pour réessayer
- **Auto-scroll bottom** sauf si l'utilisateur a scrollé vers le haut → bouton flottant `↓ N nouveaux`
- Lazy-load infinite scroll vers le haut (50 messages par page)

### Médias
- Images : grid carré preview, plein écran tap (Lightbox)
- Vidéos : player inline avec poster
- Documents : carte type WA (icône fichier + nom + taille + télécharger)
- Vocaux : waveform + scrubber + vitesse 1×/1.5×/2× + transcription dépliable

### Composer (bottom)
```text
[😊][📎][📜scripts]  [textarea auto-grow]  [🎤 / ➤]
```
- 😊 picker emoji (lib `emoji-mart` léger ou custom)
- 📎 menu : Photo · Vidéo · Document · Caméra (mobile)
- Drag & drop fichier sur la zone chat
- Indicateur "en train d'écrire" envoyé seulement si Meta le supporte (sinon omis pour ne pas mentir)

### Recherche
- Icône 🔍 → barre full-width au-dessus du chat → highlight des matches + navigation `↑ ↓ N/M`
- Recherche backend FTS pour gros volumes

### Mobile-first sans faille
- 100dvh + `safe-area-inset-bottom` pour iPhone (composer ne passe pas sous la barre home)
- `touch-action: pan-y` sur la liste, swipe-right sur un message = action "Répondre" (interaction WA native)
- Hauteur clavier gérée via `visualViewport` API (composer reste visible)
- Tap targets ≥ 44px, `select-text` désactivé sur les contrôles, activé sur les messages
- Bottom tab bar masquée quand un chat est ouvert sur mobile

---

## 5. Appels (WhatsApp Calling API — beta Meta)

⚠️ **Important utilisateur** : la Calling API est en beta restreinte. Elle nécessite :
1. Activation manuelle dans le Business Manager Meta (demande d'accès)
2. Le numéro WA doit être enrôlé pour les appels
3. WebRTC navigateur compatible (Chrome/Safari récents)

Si non disponible au runtime → **fallback automatique** : bouton appel ouvre `tel:+33...` (app native) et on log un `call_event` manuel.

### Flux sortant
1. Tap 📞 dans le header → modal `CallDialog` plein écran (avatar pulsant, nom, "Appel en cours…")
2. Front appelle `whatsapp-call-initiate` → Meta retourne offer SDP
3. Connexion WebRTC peer-to-peer (RTCPeerConnection) avec `whatsapp-call-webrtc-signal` comme serveur de signalisation
4. Affichage : durée live, mute, haut-parleur, raccrocher
5. Fin → INSERT dans `whatsapp_calls` + entrée timeline du lead

### Flux entrant
1. Webhook `calls` reçoit `ringing` → push notif OneSignal "📞 Appel de {lead}" avec actions Accepter/Refuser
2. Si app ouverte → composant global `IncomingCallOverlay` (sonnerie + accept/decline)
3. Accept → mêmes échanges WebRTC, modal d'appel actif

### Composants nouveaux
- `src/components/calls/CallDialog.tsx` — UI modale d'appel actif (sortant + entrant accepté)
- `src/components/calls/IncomingCallOverlay.tsx` — overlay global monté dans `AppLayout`
- `src/hooks/useWhatsAppCall.ts` — gestion WebRTC (peer connection, ICE, mute, end)
- `src/components/CallHistorySection.tsx` — historique d'appels dans la fiche lead

---

## 6. Realtime & notifications

- Subscriptions Postgres realtime sur `whatsapp_messages` (déjà en place) + nouvelle sur `whatsapp_calls`
- Push OneSignal :
  - Nouveau message inbound (déjà fait) — enrichi avec preview média ("📷 Photo")
  - Appel manqué → push haute priorité avec deeplink `/leads/:id?tab=calls`
  - Appel entrant en cours → push critique (action buttons accept/decline)

---

## 7. Détails techniques

- **Lib emoji** : `emoji-mart` (~30kB) ou implémentation custom légère (top 30 emojis fréquents)
- **Lib lightbox image** : `yet-another-react-lightbox` ou simple Dialog plein écran custom
- **WebRTC** : API navigateur native, pas de lib, ICE servers STUN publics Google
- **Recherche FTS** : générée côté SQL (`tsvector` français + GIN index), exposée via RPC `search_wa_messages(lead_id, q)`
- **Optimistic UI** : déjà en place pour texte, à étendre aux médias (preview local + barre upload)
- **Accessibilité** : ARIA labels, focus trap dans CallDialog, `prefers-reduced-motion` respecté pour les animations bulles

---

## 8. Fichiers impactés

### Migration
- `supabase/migrations/<timestamp>_chat_whatsapp_native.sql`

### Edge functions (nouvelles)
- `supabase/functions/send-whatsapp-media/index.ts`
- `supabase/functions/send-whatsapp-reaction/index.ts`
- `supabase/functions/whatsapp-call-initiate/index.ts`
- `supabase/functions/whatsapp-call-action/index.ts`
- `supabase/functions/whatsapp-call-webrtc-signal/index.ts`
- `supabase/functions/mark-conversation-read/index.ts`

### Edge functions (modifiées)
- `supabase/functions/whatsapp-webhook/index.ts` (médias, reactions, statuses, calls)
- `supabase/functions/send-whatsapp-message/index.ts` (reply_to)

### Frontend
- `src/components/WhatsAppChat.tsx` (refonte majeure, splitté en sous-composants)
- `src/components/chat/MessageBubble.tsx` *(nouveau)*
- `src/components/chat/MessageActions.tsx` *(nouveau)*
- `src/components/chat/ReplyPreview.tsx` *(nouveau)*
- `src/components/chat/MediaPicker.tsx` *(nouveau)*
- `src/components/chat/EmojiPicker.tsx` *(nouveau)*
- `src/components/chat/SearchBar.tsx` *(nouveau)*
- `src/components/chat/ConversationHeader.tsx` *(nouveau)*
- `src/components/calls/CallDialog.tsx` *(nouveau)*
- `src/components/calls/IncomingCallOverlay.tsx` *(nouveau)*
- `src/hooks/useWhatsAppCall.ts` *(nouveau)*
- `src/hooks/useWhatsAppInbox.ts` (preview médias + dernier appel)
- `src/hooks/useFollowupTasks.ts` (nouveaux mutateurs : reply, react, sendMedia, markRead)
- `src/pages/ConversationsPage.tsx` (gestion mobile fullscreen, safe-area)
- `src/components/AppLayout.tsx` (monter `IncomingCallOverlay`)

### Mémoires à mettre à jour
- `mem://features/whatsapp-conversations` → étendue
- Nouveau : `mem://features/whatsapp-calls` (Calling API + fallback tel:)

---

## 9. Découpage en livraisons

1. **Phase 1 — Chat moderne** : migration, médias, reply, réactions, statuts ✓✓, recherche, refonte UI bulles + composer
2. **Phase 2 — Appels** : table calls, edge functions Calling API, CallDialog, IncomingCallOverlay, fallback tel:
3. **Phase 3 — Polish mobile** : safe-area, swipe-to-reply, gestion clavier visualViewport, optimisations FTS

Phase 1 implémentable immédiatement après approbation. Phase 2 dépend de l'activation de la Calling API côté Meta — à lancer en parallèle.
