

L'user veut continuer à recevoir TOUS les emails de nouveaux leads sur `contact@digitallaunch-llc.com` (admin global), MAIS aussi que chaque workspace puisse recevoir les siens. Donc on envoie à 2 destinataires : admin global + email du workspace.

## Plan révisé

### Email destinataires "nouveau lead" / "nouveau RDV"
- **Toujours** envoyer à `contact@digitallaunch-llc.com` (admin global, pour superviser)
- **Aussi** envoyer à l'email du workspace (`workspaces.notification_email` ou fallback `workspaces.email`) si différent de l'admin
- Sujet déjà préfixé avec `[NomWorkspace]` → tu sais d'où ça vient

Implémentation : `to: [adminEmail, workspaceEmail].filter(unique)` dans `notify-new-lead` et `handle-booking`.

### Reste du plan inchangé (isolation données)
- Migration : `workspaces.notification_email`, refonte unique `followup_automation_settings(workspace_id)`
- `notify-new-lead` + `handle-booking` : envoi multi-destinataires
- `execute-followup-task`, `generate-followup-message`, `detect-inactive-conversations` : settings par `workspace_id`
- `facebook-webhook` : propage `workspace_id` depuis `meta_pages`
- Hooks `useFollowupTasks`, `useSequenceSteps`, `useWhatsAppTemplates` : filtre par `workspace_id`
- `SettingsWorkspacesPage` : champ "Email de notification" par workspace
- `SettingsAutomationPage` : settings devient workspace-scoped

### Comportement final
- Tu reçois TOUS les leads de TOUS les workspaces sur `contact@digitallaunch-llc.com`
- Chaque owner de workspace reçoit AUSSI ses propres leads sur son email
- Le sujet `[HKSN] Nouveau lead — ...` te dit immédiatement de quel workspace ça vient
- Automations / WhatsApp / templates strictement isolés par workspace

