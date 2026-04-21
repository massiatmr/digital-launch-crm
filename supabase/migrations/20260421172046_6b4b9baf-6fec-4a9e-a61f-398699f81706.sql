-- Anti-doublon: un seul message outbound par tâche de followup.
-- Permet à execute-followup-task de planter proprement (conflit DB) si une seconde exécution
-- tentait d'insérer un message pour la même task_id.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_unique_outbound_task
  ON public.whatsapp_messages (task_id)
  WHERE task_id IS NOT NULL AND direction = 'outbound';