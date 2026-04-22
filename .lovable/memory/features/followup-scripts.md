---
name: Scripts de relance WhatsApp manuels
description: Scripts pré-écrits par phase (RDV manqué, sans réponse 3j/10j, dernière tentative, après proposition, custom) insérables en 1 clic depuis la conversation WhatsApp + page paramètres CRUD
type: feature
---
Table `followup_scripts` (phase enum, title, content, sort_order, is_enabled). Workspace-scoped RLS. Variable `{{name}}` interpolée avec le prénom du lead.

**Seed automatique** : RPC `seed_default_followup_scripts(p_owner, p_workspace)` crée 6 scripts par défaut (basés sur les templates de l'utilisateur) au premier chargement si aucun script n'existe.

**UI** :
- `/settings/scripts` (`SettingsScriptsPage`) : CRUD groupé par phase, switch enable, éditeur inline.
- `FollowupScriptsPicker` (Sheet droite) intégré dans `WhatsAppChat` à gauche de l'input texte (icône MessageSquareText). Bouton "Insérer" ajoute le texte rendu (avec `{{name}}` remplacé) dans la zone de saisie ; "Copier" pour usage vocal.
- Pass `leadName` via WhatsAppChat (depuis ConversationsPage et FollowupTimeline/LeadDetailContent).

Hook : `src/hooks/useFollowupScripts.ts` (useFollowupScripts, useUpsertFollowupScript, useDeleteFollowupScript).
