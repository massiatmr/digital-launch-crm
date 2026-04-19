import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  body_text: string;
  variables_count: number;
  status: string;
  is_synced: boolean;
  meta_template_id: string | null;
  created_at: string;
  updated_at: string;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-templates-manage", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";

export function useWhatsAppTemplates() {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ["wa-templates", workspaceId],
    queryFn: async () => {
      const data = await call("list", { workspace_id: workspaceId });
      return (data?.templates || []) as WhatsAppTemplate[];
    },
  });
}

export function useSyncTemplates() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async () => call("sync", { workspace_id: workspaceId }),
    onSuccess: (data) => {
      toast({ title: "Synchronisation OK", description: `${data?.count ?? 0} templates importés` });
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast({ title: "Erreur sync", description: e.message, variant: "destructive" }),
  });
}

export function useCreateLocalTemplate() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (payload: { name: string; language: string; body_text: string; category?: string }) =>
      call("create_local", { ...payload, workspace_id: workspaceId }),
    onSuccess: () => {
      toast({ title: "Template créé" });
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (payload: { id: string; body_text?: string; name?: string; language?: string; category?: string }) =>
      call("update", { ...payload, workspace_id: workspaceId }),
    onSuccess: () => {
      toast({ title: "Template mis à jour" });
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  const workspaceId = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (id: string) => call("delete", { id, workspace_id: workspaceId }),
    onSuccess: () => {
      toast({ title: "Template supprimé" });
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
}
