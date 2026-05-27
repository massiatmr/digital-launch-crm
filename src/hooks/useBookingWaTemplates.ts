import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BookingEmailType } from "./useBookingEmailTemplates";

export interface WorkspaceBookingWaTemplate {
  id: string;
  workspace_id: string;
  owner_id: string;
  type: BookingEmailType;
  enabled: boolean;
  template_id: string | null;
  language: string;
  variables_map: Record<string, string>;
}

export const BOOKING_WA_TYPES: { type: BookingEmailType; label: string; description: string }[] = [
  { type: "confirmation", label: "Confirmation", description: "Juste après la réservation" },
  { type: "24h_before", label: "24h avant", description: "1 jour avant le RDV" },
  { type: "12h_before", label: "12h avant", description: "12 heures avant" },
  { type: "1h_before", label: "1h avant", description: "1 heure avant" },
];

export function useWorkspaceBookingWaTemplates(workspaceId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["workspace_booking_wa_templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_booking_wa_templates" as any)
        .select("*")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return (data || []) as unknown as WorkspaceBookingWaTemplate[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<WorkspaceBookingWaTemplate> & { type: BookingEmailType }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { data: user } = await supabase.auth.getUser();
      const row = {
        workspace_id: workspaceId,
        owner_id: user.user!.id,
        type: payload.type,
        enabled: payload.enabled ?? false,
        template_id: payload.template_id ?? null,
        language: payload.language ?? "fr",
        variables_map: payload.variables_map ?? {},
      };
      const { error } = await supabase
        .from("workspace_booking_wa_templates" as any)
        .upsert(row as any, { onConflict: "workspace_id,type" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace_booking_wa_templates", workspaceId] });
      toast.success("Rappel WhatsApp mis à jour");
    },
    onError: (e: any) => toast.error(e?.message || "Erreur"),
  });

  return { ...query, upsert };
}

export function useWorkspaceWhatsAppTemplates(workspaceId: string | null) {
  return useQuery({
    queryKey: ["whatsapp_templates_for_workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, name, language, status, variables_count, category")
        .eq("workspace_id", workspaceId!)
        .eq("status", "APPROVED")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
}
