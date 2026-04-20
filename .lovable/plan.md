# Plan : Améliorer l'automatisation et la qualification WhatsApp

## Contexte actuel

Ton système fait déjà beaucoup : séquence dynamique, détection d'inactivité, escalade appel, basculement template 24h, IA closer. Mais la **qualification** repose 100% sur l'IA en texte libre — sans suivi structuré de ce qui a été qualifié, sans détection d'intention forte, et sans automatisation de la prise de RDV quand le lead est prêt.

## Problèmes identifiés

1. **Aucune mémoire structurée de qualification** — l'IA repose juste sur l'historique brut. Pas de champs "budget identifié", "urgence détectée", "objection rencontrée".
2. **Pas de détection d'intention** — quand le lead écrit "ok je veux réserver" ou "envoie-moi le lien", aucune action automatique.
3. **Score statique** — le `lead.score` ne bouge pas en fonction des réponses WhatsApp (engagement, tonalité, mots-clés).
4. **Pas de scoring de la conversation** — impossible de savoir si une convo "avance" ou "stagne".
5. **L'IA ne sait pas quand s'arrêter de relancer** — elle continue même si le lead a explicitement dit non.

---

## Améliorations proposées

### 1. Qualification structurée par IA (BANT-light)

Ajouter une table `lead_qualification` qui stocke automatiquement après chaque réponse du lead :

- `pain_point` (problème principal détecté)
- `urgency` (immediate / weeks / months / unclear)
- `budget_signal` (yes / no / unknown)
- `decision_maker` (yes / no / unknown)
- `objections` (jsonb : liste d'objections rencontrées)
- `interest_level` (0–100)
- `last_qualified_at`

Une edge function `qualify-conversation` est appelée à chaque message inbound, lit les 10 derniers messages et met à jour ces champs via Gemini Flash. **Le prompt suivant `generate-followup-message` utilise ces champs** au lieu de relire tout l'historique → réponses plus pertinentes et focalisées.

### 2. Détection d'intention temps réel

Sur chaque message inbound, l'IA classe l'intention parmi :

- `ready_to_book` → crée auto une tâche "envoyer lien réservation" ou répond avec 2 créneaux
- `objection` → déclenche une réponse type "traitement objection" (prompt dédié)
- `not_interested` / `unsubscribe` → **annule TOUTES les tâches scheduled** + passe `status=lost` + `lost_reason="désintéressé via WhatsApp"`
- `info_request` → réponse standard
- `wrong_person` → marque le lead `lost`

→ Évite de relancer un lead qui a dit non, et accélère ceux qui sont prêts.

### 3. Score WhatsApp dynamique

Ajout d'une vue/champ `whatsapp_engagement_score` calculé en SQL (trigger sur `whatsapp_messages`) :

- +20 par inbound dans les 10 dernières min après un outbound (réactivité)
- +10 si message > 50 chars (engagement)
- +30 si intention `ready_to_book` détectée
- −20 si silence > 48h après outbound
- → Mappé en `hot/warm/cold` automatiquement (override le score statique).

### 4. Stop intelligent des relances

Dans `process-followup-tasks` et `detect-inactive-conversations`, ajouter une vérification :

- Si `lead.status` ∈ `('lost', 'won')` → skip
- Si `qualification.objections` contient "pas le bon moment" + dernière relance < 7j → reporter à +14j au lieu de continuer
- Si 3 relances consécutives sans aucun inbound → escalade humaine + pause auto

### 5. Templates de réponse contextuels

Au lieu d'un seul prompt IA générique, créer 4 prompts spécialisés sélectionnés selon l'intention :

- `prompt_qualification` (lead pas encore qualifié)
- `prompt_objection_handling` (objection détectée)
- `prompt_closing` (lead qualifié, pousser RDV)
- `prompt_reactivation` (silence > seuil)

→ Stockés et éditables dans `/settings/automation` onglet IA (4 textareas au lieu d'1).

### 6. Tableau de bord qualification

Nouvel onglet sur `/conversations` ou dans la fiche lead :

- Badge "Qualifié 60%" basé sur les champs BANT remplis
- Liste des objections rencontrées
- Bouton "Forcer prise de RDV" (envoie immédiatement le lien + 2 créneaux)
- Toggle "Pause relances 7j" (utile quand on attend volontairement)

### 7. A/B testing des messages

Ajouter `message_variant` dans `lead_followup_tasks` (A ou B). Si activé dans settings, l'IA génère 2 versions et alterne. Tracking du taux de réponse par variant dans `/settings/automation` → onglet Stats.

---

## Détails techniques

### Nouvelles tables / colonnes

- **Table `lead_qualification**` : 1 ligne par lead, mise à jour par trigger ou edge function après chaque inbound.
- **Colonne `whatsapp_engagement_score INT**` sur `leads` (recalculée par trigger).
- **Colonne `intent` TEXT** sur `whatsapp_messages` (classifiée à l'arrivée).
- **Colonnes `prompt_qualification`, `prompt_objection`, `prompt_closing`, `prompt_reactivation` TEXT** sur `followup_automation_settings`.
- **Colonne `message_variant` TEXT** sur `lead_followup_tasks`.

### Nouvelles edge functions

- `qualify-conversation` : appelée par `whatsapp-webhook` après chaque inbound. Lit historique → JSON structuré → upsert `lead_qualification` + classifie intention + déclenche action si `ready_to_book` ou `not_interested`.
- Refacto `generate-followup-message` : sélectionne le bon prompt selon `qualification.interest_level` + objections, et utilise le résumé structuré au lieu de réinjecter tout l'historique.

### Modifs existantes

- `whatsapp-webhook` → après insert inbound, invoke `qualify-conversation` en fire-and-forget.
- `process-followup-tasks` → check `lead.status` + qualification avant exécution.
- `SettingsAutomationPage.tsx` → 4 textareas au lieu d'1, toggle A/B test, toggle "auto-stop si désintéressé".
- `LeadDetailContent.tsx` → nouveau bloc "Qualification" affichant les champs BANT.

### Approche progressive

Phase 1 (essentielle) : qualification structurée + détection intention + stop intelligent.
Phase 2 (optimisation) : score WhatsApp dynamique + 4 prompts contextuels.
Phase 3 (avancé) : A/B testing + dashboard qualification.

---

## Question pour toi

Veux-tu que je démarre par **Phase 1 uniquement** (le plus gros impact qualité immédiate, ~30 min de build) ou tout d'un coup ?

non fait tout