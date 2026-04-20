import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LeadQualification = {
  lead_id: string;
  pain_point: string;
  urgency: "immediate" | "weeks" | "months" | "unclear";
  budget_signal: "yes" | "no" | "unknown";
  decision_maker: "yes" | "no" | "unknown";
  objections: string[];
  interest_level: number;
  intent: string;
  summary: string;
  last_qualified_at: string | null;
};

export function useLeadQualification(leadId: string | undefined) {
  return useQuery({
    queryKey: ["lead-qualification", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_qualification" as any)
        .select("*")
        .eq("lead_id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as LeadQualification | null;
    },
  });
}

export function useForceBookingPush(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: lead } = await supabase.from("leads").select("owner_id, workspace_id").eq("id", leadId).maybeSingle();
      if (!lead) throw new Error("Lead introuvable");
      const { error } = await supabase.from("lead_followup_tasks").insert({
        lead_id: leadId,
        owner_id: (lead as any).owner_id,
        workspace_id: (lead as any).workspace_id,
        task_type: "propose_meeting",
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
        step_order: 80,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followup-tasks", leadId] });
    },
  });
}

export function useRequalify(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("qualify-conversation", {
        body: { lead_id: leadId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-qualification", leadId] });
    },
  });
}
