import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";

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
  business_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useActiveWhatsAppBusinessAccountId() {
  const workspaceId = useCurrentWorkspaceId();
  const { data } = useQuery({
    queryKey: ["wa-active-config", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_config" as any)
        .select("business_account_id")
        .eq("is_active", true);
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, error } = await q.maybeSingle();
      if (error) return null;
      return (data as any)?.business_account_id as string | null;
    },
  });
  return data ?? null;
}

export interface WhatsAppConfigInfo {
  business_account_id: string;
  display_phone_number: string | null;
  is_active: boolean;
}

export function useWhatsAppConfigs() {
  const workspaceId = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ["wa-configs-all", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_config" as any)
        .select("business_account_id, display_phone_number, is_active");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, error } = await q;
      if (error) return [] as WhatsAppConfigInfo[];
      return ((data as any[]) || []) as WhatsAppConfigInfo[];
    },
  });
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("whatsapp-templates-manage", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

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

/**
 * Templates limités aux WABA des numéros ACTIFS du workspace courant.
 * Utilisé dans l'éditeur d'automatisations pour éviter de proposer des templates
 * d'un autre numéro.
 */
export function useActiveWorkspaceTemplates() {
  const { data: templates = [], ...rest } = useWhatsAppTemplates();
  const { data: configs = [] } = useWhatsAppConfigs();
  const activeWabaIds = new Set(
    configs.filter((c) => c.is_active && c.business_account_id).map((c) => c.business_account_id),
  );
  const filtered = activeWabaIds.size === 0
    ? templates
    : templates.filter((t) => !t.business_account_id || activeWabaIds.has(t.business_account_id));
  return { ...rest, data: filtered };
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
