

## Scope: filtrer toutes les vues "transverses" par workspace

Aujourd'hui, plusieurs listes globales (Scripts, Messages générés, Rappels en partie, Séquences, Notifications/Cron tasks) ne sont pas filtrées par `workspace_id`. Quand l'utilisateur change de workspace, les données d'autres espaces apparaissent mélangées. À corriger d'un coup.

## Tables concernées (toutes possèdent `workspace_id`)

`reminders`, `sales_scripts`, `generated_messages`, `lead_followup_tasks`, `lead_activities`, `lead_qualification`, `client_resources`, `client_activities`, `meta_pages`, `whatsapp_messages`.

## Corrections côté front (hooks)

### `src/hooks/useLeadData.ts`
- **`useReminders`** : retirer le fallback OR `workspace_id IS NULL` — ne renvoyer QUE les rappels du `wsId` courant. Filtre strict `.eq('workspace_id', wsId)`.
- **`useAllScripts`** : ajouter `useCurrentWorkspaceId()` + `.eq('workspace_id', wsId)`, queryKey `['scripts', wsId]`, `enabled: !!wsId`.
- **`useAllMessages`** : idem (`['messages', wsId]`, filtré par workspace).
- **`useLeadActivities`** (si présent) : filtrer par workspace courant (déjà bordé par lead, mais sécuriser le cache key).
- **Inserts auto** (`reminders`, `sales_scripts`, `generated_messages`) lors de la création d'un lead via IA : ajouter `workspace_id: wsId` dans les payloads (actuellement absent → données orphelines).

### `src/hooks/useFollowupTasks.ts`
- **`useFollowupTasks(leadId)`** : queryKey inclut `wsId` ; vérifier le cache n'est pas partagé entre workspaces.
- **`useWhatsAppMessages(leadId)`** : idem queryKey `['wa-messages', wsId, leadId]`.
- Réinvalidations existantes (`['followup-tasks']`, `['wa-messages']`) restent OK car invalident toutes variantes.

### `src/hooks/useSequenceSteps.ts`
- Déjà workspace-scoped ✅ (vérifié).

### `src/hooks/useFollowupCron.ts` (`useDueTasksCount`)
- Ajouter filtre `.eq('workspace_id', wsId)` sur le count des tâches dues, pour ne pas afficher des compteurs cross-workspace dans Settings → Automation.

### `src/hooks/useNotifications.ts`
- Reste user-scoped (logs push attachés à `user_id`) ✅ — pas de changement (les notifs sont par utilisateur, pas par workspace).

### `src/hooks/useWhatsAppInbox.ts`
- Déjà workspace-scoped ✅.

## Cache / changement de workspace

`WorkspaceProvider.switchWorkspace` appelle déjà `qc.invalidateQueries()` (global). Pour garantir une remise à zéro propre lors du switch, on ajoutera également `qc.removeQueries()` sur les clés transverses ci-dessus afin d'éviter un "flash" de l'ancien workspace.

## Backfill données orphelines

Migration ponctuelle pour rattacher au bon workspace les enregistrements créés sans `workspace_id` :
- `reminders`, `sales_scripts`, `generated_messages`, `lead_activities`, `lead_followup_tasks`, `lead_qualification` → set `workspace_id = leads.workspace_id WHERE m.workspace_id IS NULL`.
- `client_activities`, `client_resources` → idem via `clients.workspace_id`.

Comme ce sont des UPDATE, ces opérations passent par une migration SQL.

## Fichiers modifiés

- `src/hooks/useLeadData.ts` (reminders strict, scripts/messages filtrés, inserts avec wsId)
- `src/hooks/useFollowupTasks.ts` (queryKeys avec wsId)
- `src/hooks/useFollowupCron.ts` (compteur dues filtré)
- `src/hooks/useWorkspaces.ts` (removeQueries des caches transverses au switch)
- `supabase/migrations/<new>.sql` (backfill workspace_id sur 8 tables)

## Hors-scope (déjà OK)

Leads, Clients, Offers, Bookings, WhatsApp Inbox, Sequence steps, Followup settings, Templates, Notifications push : déjà filtrés correctement.

