
## Plan : fiabiliser le suivi WhatsApp

### 1. Push notif sur message entrant (CRITIQUE — fix #1 risque de perte)
Modifier `whatsapp-webhook/index.ts` : après l'insert d'un message inbound dans `whatsapp_messages`, invoquer `send-push` vers `cfg.owner_id` :
- Titre : `💬 [Nom du lead] a répondu`
- Corps : 100 premiers caractères du message
- URL : `/conversations?lead={lead_id}`

→ Notif push reçue même app fermée (sur iOS, requiert PWA installée écran d'accueil — voir point 5).

### 2. Nouvelle page `/conversations` (inbox WhatsApp temps réel)

**Layout 2 colonnes desktop / stack mobile :**
- **Gauche** : liste des leads avec ≥1 message WhatsApp
  - Nom + dernier message tronqué + heure
  - Point violet "non lu" si dernier message inbound non vu
  - Tri : dernier inbound en haut
  - Recherche par nom/téléphone
  - Realtime : nouveau message → remonte en haut
- **Droite** : conversation active
  - Header (nom, score, lien vers fiche)
  - Bulles inbound/outbound avec auto-scroll
  - Composer en bas (Entrée = envoyer, optimistic UI)

**Composant extrait** : `WhatsAppChat.tsx` (réutilisable depuis `FollowupTimeline` et la page Conversations).

**Hook nouveau** : `useWhatsAppInbox.ts` — agrège les leads par dernier message + realtime + comptage non-lus (via `localStorage` `lastSeen[leadId]`).

**Navigation** :
- `AppSidebar` : entrée "Conversations" (icône MessageCircle) après Pipeline, avec badge non-lus
- `MobileBottomNav` : entrée "Conversations" remplace ou complète une entrée
- Route `/conversations` dans `App.tsx`

### 3. Optimistic UI dans le chat
Dans `WhatsAppChat`, la bulle envoyée apparaît immédiatement avec état "envoi…" avant la confirmation serveur → masque la latence perçue.

### 4. Bandeau dry_run visible
Si `followup_automation_settings.dry_run = true`, afficher un bandeau orange en haut de `/conversations` et `/settings/automation` :
> ⚠️ Mode test — aucun message WhatsApp réel n'est envoyé. [Passer en production]

### 5. Guide installation PWA iOS
Petite carte dans `/settings` expliquant :
> Pour recevoir les notifications même app fermée : Partager → Sur l'écran d'accueil

(Sur iOS, le Web Push ne fonctionne en background QUE si la PWA est installée — c'est une contrainte Apple, pas un bug.)

### Fichiers impactés

| Fichier | Action |
|---|---|
| `supabase/functions/whatsapp-webhook/index.ts` | Trigger `send-push` sur message inbound |
| `src/pages/ConversationsPage.tsx` | **Nouveau** : inbox 2 colonnes |
| `src/components/WhatsAppChat.tsx` | **Nouveau** : chat extrait, optimistic UI |
| `src/components/FollowupTimeline.tsx` | Utilise `<WhatsAppChat />` |
| `src/hooks/useWhatsAppInbox.ts` | **Nouveau** : liste convs + realtime + non-lus |
| `src/App.tsx` | Route `/conversations` |
| `src/components/AppSidebar.tsx` | Entrée Conversations + badge |
| `src/components/MobileBottomNav.tsx` | Entrée Conversations |
| `src/pages/SettingsAutomationPage.tsx` | Bandeau dry_run |
| `src/pages/SettingsPage.tsx` | Carte guide PWA iOS |

Aucun changement de schéma DB (non-lus = `localStorage`).

<lov-actions>
<lov-suggestion message="Vérifie end-to-end : crée un lead test, envoie un message WhatsApp entrant, vérifie la notif push mobile + l'apparition dans /conversations + le badge non-lu">Tester end-to-end</lov-suggestion>
<lov-suggestion message="Go, lance les 5 chantiers dans l'ordre : push inbound, page Conversations + nav, optimistic UI, bandeau dry_run, guide PWA iOS">Lancer tout</lov-suggestion>
<lov-suggestion message="Fais d'abord uniquement le critique : push notif sur message entrant + page /conversations avec inbox temps réel">Critique seulement (1+2)</lov-suggestion>
<lov-suggestion message="Ajoute aussi un son de notification dans /conversations quand un nouveau message arrive">Ajouter son notification</lov-suggestion>
</lov-actions>
