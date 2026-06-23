import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";

export type CampaignStatus = "draft" | "scheduled" | "running" | "completed" | "cancelled" | "failed";
export type RecipientStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "skipped";

export interface Campaign {
  id: string;
  workspace_id: string | null;
  owner_id: string;
  name: string;
  template_id: string | null;
  template_name: string | null;
  template_language: string | null;
  template_variables_mapping: Record<string, string>;
  audience_mode: "manual" | "filter";
  audience_filter: any;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: CampaignStatus;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  skipped_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  client_id: string | null;
  phone: string;
  contact_name: string | null;
  resolved_variables: Record<string, string>;
  status: RecipientStatus;
  wa_message_id: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
}

export function useCampaigns() {
  const workspaceId = useCurrentWorkspaceId();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["campaigns", workspaceId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("campaigns")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Campaign[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`campaigns-${workspaceId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => {
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, workspaceId, qc]);

  return query;
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: ["campaign", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as Campaign | null;
    },
    refetchInterval: (q) => {
      const c = q.state.data as Campaign | null | undefined;
      return c && (c.status === "running" || c.status === "scheduled") ? 5000 : false;
    },
  });
}

export function useCampaignRecipients(campaign_id: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["campaign-recipients", campaign_id],
    enabled: !!campaign_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_recipients")
        .select("*")
        .eq("campaign_id", campaign_id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CampaignRecipient[];
    },
  });

  useEffect(() => {
    if (!campaign_id) return;
    const ch = supabase
      .channel(`campaign-recipients-${campaign_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_recipients", filter: `campaign_id=eq.${campaign_id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["campaign-recipients", campaign_id] });
          qc.invalidateQueries({ queryKey: ["campaign", campaign_id] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaign_id, qc]);

  return query;
}

export function useCreateCampaign() {
  const workspaceId = useCurrentWorkspaceId();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Campaign>) => {
      const { data, error } = await supabase
        .from("campaigns")
        .insert({
          workspace_id: workspaceId,
          owner_id: user!.id,
          name: payload.name || "Nouvelle campagne",
          template_id: payload.template_id ?? null,
          template_name: payload.template_name ?? null,
          template_language: payload.template_language ?? "fr",
          template_variables_mapping: (payload.template_variables_mapping ?? {}) as any,
          audience_mode: payload.audience_mode ?? "manual",
          audience_filter: (payload.audience_filter ?? {}) as any,
          scheduled_at: payload.scheduled_at ?? null,
          status: "draft",
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as Campaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useLaunchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { campaign_id: string; manual_recipients?: Array<{ kind: "lead" | "client"; id: string }> }) => {
      const { data, error } = await supabase.functions.invoke("campaigns-launch", { body: args });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Campagne lancée", description: "L'envoi commence maintenant" });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: any) => toast({ title: "Erreur de lancement", description: e.message, variant: "destructive" }),
  });
}

export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ status: "cancelled", finished_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
      // Annule les pending restants
      await supabase
        .from("campaign_recipients")
        .update({ status: "skipped", error_message: "Campagne annulée" } as any)
        .eq("campaign_id", id)
        .eq("status", "pending");
    },
    onSuccess: () => {
      toast({ title: "Campagne annulée" });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Campagne supprimée" });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export async function previewAudience(filter: any) {
  const { data, error } = await supabase.functions.invoke("campaigns-preview-audience", { body: filter });
  if (error) throw new Error(error.message);
  return data as { total: number; sample: any[] };
}
