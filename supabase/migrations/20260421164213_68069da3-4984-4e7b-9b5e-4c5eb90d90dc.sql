-- Anti-doublon sur l'envoi de messages WhatsApp liés à une tâche followup
-- 1. Empêche deux lignes whatsapp_messages avec le même task_id (quand task_id non null)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_task_id_unique
  ON public.whatsapp_messages(task_id)
  WHERE task_id IS NOT NULL;

-- 2. Index partiel empêchant 2 exécutions simultanées pour la même tâche
--    (en complément du lock logique dans execute-followup-task)
CREATE INDEX IF NOT EXISTS lead_followup_tasks_status_idx
  ON public.lead_followup_tasks(status, scheduled_at)
  WHERE status IN ('scheduled', 'pending');

-- 3. Colonne pour éviter de re-détecter un booking déjà créé depuis la conversation
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS created_from text DEFAULT 'public_page';

COMMENT ON COLUMN public.bookings.created_from IS
  'Origine de la création : public_page (landing), conversation_ai (détection IA depuis WhatsApp), manual (CRM).';
