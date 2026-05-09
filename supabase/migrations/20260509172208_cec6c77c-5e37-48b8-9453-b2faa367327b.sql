-- 1) Switch RESTRICT FKs to CASCADE so deleting a workspace removes all its data
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_workspace_id_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_workspace_id_fkey;
ALTER TABLE public.offers ADD CONSTRAINT offers_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_workspace_id_fkey;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_workspace_id_fkey;
ALTER TABLE public.clients ADD CONSTRAINT clients_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.contract_signatures DROP CONSTRAINT IF EXISTS contract_signatures_workspace_id_fkey;
ALTER TABLE public.contract_signatures ADD CONSTRAINT contract_signatures_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_workspace_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 2) Hard-delete the soft-deleted SmarTeam Agency workspace
DELETE FROM public.workspaces WHERE id = 'cc94b858-b30a-484a-a31a-317d6fd65c87';