import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BookingEmailType = "confirmation" | "24h_before" | "12h_before" | "1h_before";

export interface OfferBookingEmailTemplate {
  id: string;
  offer_id: string;
  type: BookingEmailType;
  enabled: boolean;
  subject: string;
  body_html: string;
  workspace_id: string | null;
  owner_id: string;
}

export interface WorkspaceBookingEmailTemplate {
  id: string;
  workspace_id: string;
  type: BookingEmailType;
  enabled: boolean;
  subject: string;
  body_html: string;
  owner_id: string;
}

export const BOOKING_EMAIL_TYPES: { type: BookingEmailType; label: string; description: string }[] = [
  { type: "confirmation", label: "Confirmation", description: "Envoyé immédiatement après la réservation" },
  { type: "24h_before", label: "Rappel 24h avant", description: "Envoyé 24 heures avant le RDV" },
  { type: "12h_before", label: "Rappel 12h avant", description: "Envoyé 12 heures avant le RDV" },
  { type: "1h_before", label: "Rappel 1h avant", description: "Envoyé 1 heure avant le RDV" },
];

export const DEFAULT_TEMPLATES: Record<BookingEmailType, { subject: string; body_html: string }> = {
  confirmation: {
    subject: "✅ Rendez-vous confirmé — {{date}} à {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>C'est confirmé : on se voit le <strong>{{date}} à {{time}}</strong>{{offer_suffix}}.</p>
<p>Préparez vos questions, l'objectif de cet échange est simple : comprendre votre situation et voir concrètement comment on peut vous aider à avancer.</p>
<p>{{meet_block}}</p>
<p>À très vite,</p>`,
  },
  "24h_before": {
    subject: "📅 On se voit demain à {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>Petit rappel : notre rendez-vous est prévu <strong>demain à {{time}}</strong>{{offer_suffix}}.</p>
<p>Vous avez pris ce créneau pour une bonne raison — c'est le moment d'avoir les réponses claires que vous cherchez et de repartir avec un plan concret.</p>
<p>Pensez à noter les 2-3 questions les plus importantes pour vous, on en parlera ensemble.</p>
<p>{{meet_block}}</p>
<p>À demain,</p>`,
  },
  "12h_before": {
    subject: "⏰ Rendez-vous demain — {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>Notre rendez-vous approche : <strong>{{date}} à {{time}}</strong>.</p>
<p>Pas besoin de préparation lourde — juste être disponible et au calme pour qu'on puisse échanger sereinement et avancer concrètement sur votre projet.</p>
<p>{{meet_block}}</p>
<p>À très vite,</p>`,
  },
  "1h_before": {
    subject: "🚀 RDV dans 1h — {{time}}",
    body_html: `<p>Bonjour {{name}},</p>
<p>On se retrouve dans <strong>1h, à {{time}}</strong>.</p>
<p>Installez-vous au calme, prenez de quoi noter, et on fait le point ensemble sur ce qui compte vraiment pour vous.</p>
<p>{{meet_block}}</p>
<p>À tout de suite,</p>`,
  },
};

// ---------- Offer-level overrides ----------

export function useOfferBookingEmailTemplates(offerId: string | null) {
  return useQuery({
    queryKey: ["offer_booking_email_templates", offerId],
    enabled: !!offerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_booking_email_templates")
        .select("*")
        .eq("offer_id", offerId!);
      if (error) throw error;
      return (data || []) as OfferBookingEmailTemplate[];
    },
  });
}

export function useUpsertOfferBookingEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      offer_id: string;
      type: BookingEmailType;
      enabled: boolean;
      subject: string;
      body_html: string;
      workspace_id: string | null;
    }) => {
      const { error } = await supabase
        .from("offer_booking_email_templates")
        .upsert(input as any, { onConflict: "offer_id,type" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["offer_booking_email_templates", vars.offer_id] });
      toast.success("Template enregistré");
    },
    onError: (e: any) => toast.error(e.message || "Erreur"),
  });
}

export function useResetOfferBookingEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ offer_id, type }: { offer_id: string; type: BookingEmailType }) => {
      const { error } = await supabase
        .from("offer_booking_email_templates")
        .delete()
        .eq("offer_id", offer_id)
        .eq("type", type);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["offer_booking_email_templates", vars.offer_id] });
      toast.success("Réinitialisé au défaut");
    },
  });
}

// ---------- Workspace-level defaults ----------

export function useWorkspaceBookingEmailTemplates(workspaceId: string | null) {
  return useQuery({
    queryKey: ["workspace_booking_email_templates", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_booking_email_templates" as any)
        .select("*")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return ((data as any) || []) as WorkspaceBookingEmailTemplate[];
    },
  });
}

export function useUpsertWorkspaceBookingEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      type: BookingEmailType;
      enabled: boolean;
      subject: string;
      body_html: string;
    }) => {
      const { error } = await supabase
        .from("workspace_booking_email_templates" as any)
        .upsert(input as any, { onConflict: "workspace_id,type" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["workspace_booking_email_templates", vars.workspace_id] });
      toast.success("Template par défaut enregistré");
    },
    onError: (e: any) => toast.error(e.message || "Erreur"),
  });
}

export function useResetWorkspaceBookingEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspace_id, type }: { workspace_id: string; type: BookingEmailType }) => {
      const { error } = await supabase
        .from("workspace_booking_email_templates" as any)
        .delete()
        .eq("workspace_id", workspace_id)
        .eq("type", type);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["workspace_booking_email_templates", vars.workspace_id] });
      toast.success("Réinitialisé au défaut global");
    },
  });
}

// ---------- Test send ----------

export function useSendTestBookingEmail() {
  return useMutation({
    mutationFn: async (input: { subject: string; body_html: string; to: string }) => {
      const { error } = await supabase.functions.invoke("send-test-booking-email", {
        body: input,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Email de test envoyé"),
    onError: (e: any) => toast.error(e.message || "Erreur d'envoi"),
  });
}

// ---------- Workspace admin reminders (existing) ----------

export function useWorkspaceAdminReminders(workspaceId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["workspace_admin_reminders", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("booking_admin_reminders_enabled, notification_email")
        .eq("id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as { booking_admin_reminders_enabled: boolean; notification_email: string | null };
    },
  });

  const update = useMutation({
    mutationFn: async (patch: { booking_admin_reminders_enabled?: boolean; notification_email?: string | null }) => {
      const { error } = await supabase.from("workspaces").update(patch as any).eq("id", workspaceId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace_admin_reminders", workspaceId] });
      toast.success("Préférences enregistrées");
    },
    onError: (e: any) => toast.error(e.message || "Erreur"),
  });

  return { ...query, update };
}
