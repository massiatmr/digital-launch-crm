import { useState, useMemo } from "react";
import DOMPurify from "dompurify";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Calendar, Clock, Mail, Phone, Video, User, Send, Loader2, CheckCircle2,
  XCircle, AlertCircle, ExternalLink, MessageSquare, RefreshCw, CalendarClock, Ban, CheckCheck,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { BOOKING_EMAIL_TYPES, DEFAULT_TEMPLATES, type BookingEmailType } from "@/hooks/useBookingEmailTemplates";
import { useUpdateBooking } from "@/hooks/useOfferData";

interface Props {
  bookingId: string | null;
  onOpenChange: (open: boolean) => void;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  confirmed: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-primary/10 text-primary border-primary/20",
};
const statusLabels: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé",
};

const reminderStatusBadge: Record<string, { cls: string; label: string; icon: any }> = {
  pending: { cls: "bg-muted text-muted-foreground border-white/10", label: "Programmé", icon: Clock },
  sent: { cls: "bg-green-500/10 text-green-400 border-green-500/20", label: "Envoyé", icon: CheckCircle2 },
  skipped: { cls: "bg-muted text-muted-foreground border-white/10", label: "Ignoré", icon: XCircle },
  failed: { cls: "bg-destructive/10 text-destructive border-destructive/20", label: "Échec", icon: AlertCircle },
};

export function BookingDetailSheet({ bookingId, onOpenChange }: Props) {
  const qc = useQueryClient();
  const updateBooking = useUpdateBooking();
  const [sending, setSending] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<BookingEmailType | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");
  const [previewTo, setPreviewTo] = useState("");
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);

  // Action dialogs
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Post-action notify dialog
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyKind, setNotifyKind] = useState<"rescheduled" | "cancelled" | "completed" | null>(null);
  const [notifyContext, setNotifyContext] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking-detail", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, offers(name, workspace_id), leads(show_status, name)")
        .eq("id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: reminders } = useQuery({
    queryKey: ["booking-emails", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_emails")
        .select("*")
        .eq("booking_id", bookingId!)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: sendLogs } = useQuery({
    queryKey: ["booking-send-logs", bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("*")
        .filter("metadata->>booking_id", "eq", bookingId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: conversation } = useQuery({
    queryKey: ["booking-conversation", booking?.lead_id],
    enabled: !!booking?.lead_id,
    queryFn: async () => {
      const [{ data: msgs }, { data: qual }] = await Promise.all([
        supabase
          .from("whatsapp_messages")
          .select("id, content, direction, sent_at")
          .eq("lead_id", booking.lead_id)
          .order("sent_at", { ascending: false })
          .limit(15),
        supabase
          .from("lead_qualification")
          .select("interest_level, pain_point, summary, objections, budget_signal, urgency")
          .eq("lead_id", booking.lead_id)
          .maybeSingle(),
      ]);
      return { messages: (msgs || []).reverse(), qualification: qual };
    },
  });

  const remindersByType = useMemo(() => {
    const map = new Map<string, any>();
    (reminders || []).forEach((r) => {
      const existing = map.get(r.type);
      if (!existing || (r.status === "sent" && existing.status !== "sent")) map.set(r.type, r);
    });
    return map;
  }, [reminders]);

  // All logs grouped by reminder type (sorted desc by created_at)
  const logsByType = useMemo(() => {
    const map = new Map<string, any[]>();
    (sendLogs || []).forEach((l) => {
      const type = l.metadata?.type;
      if (!type) return;
      const arr = map.get(type) || [];
      arr.push(l);
      map.set(type, arr);
    });
    return map;
  }, [sendLogs]);


  const sendReminder = useMutation({
    mutationFn: async (input: {
      type: BookingEmailType;
      bookingEmailId?: string | null;
      subjectOverride?: string;
      bodyOverride?: string;
      to?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-test-booking-email", {
        body: {
          bookingId,
          type: input.type,
          bookingEmailId: input.bookingEmailId,
          subjectOverride: input.subjectOverride,
          bodyOverride: input.bodyOverride,
          to: input.to,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Email envoyé");
      qc.invalidateQueries({ queryKey: ["booking-emails", bookingId] });
      qc.invalidateQueries({ queryKey: ["booking-send-logs", bookingId] });
      setPreviewType(null);
    },
    onError: (e: any) => toast.error(e.message || "Erreur d'envoi"),
    onSettled: () => setSending(null),
  });

  const openPreview = async (type: BookingEmailType, existingEmailId: string | null) => {
    if (!booking) return;
    // Resolve template: offer > workspace > default
    let subject = DEFAULT_TEMPLATES[type].subject;
    let body = DEFAULT_TEMPLATES[type].body_html;
    if (booking.offer_id) {
      const { data } = await supabase
        .from("offer_booking_email_templates")
        .select("subject, body_html")
        .eq("offer_id", booking.offer_id)
        .eq("type", type)
        .maybeSingle();
      if (data?.subject) { subject = data.subject; body = data.body_html; }
    }
    if (booking.workspace_id) {
      // workspace fallback only if no offer override
      const { data: offerData } = await supabase
        .from("offer_booking_email_templates")
        .select("id")
        .eq("offer_id", booking.offer_id || "")
        .eq("type", type)
        .maybeSingle();
      if (!offerData) {
        const { data } = await supabase
          .from("workspace_booking_email_templates" as any)
          .select("subject, body_html")
          .eq("workspace_id", booking.workspace_id)
          .eq("type", type)
          .maybeSingle();
        if ((data as any)?.subject) {
          subject = (data as any).subject;
          body = (data as any).body_html;
        }
      }
    }
    setPreviewType(type);
    setPreviewEmailId(existingEmailId);
    setPreviewSubject(subject);
    setPreviewBody(body);
    setPreviewTo(booking.email || "");
  };

  const renderVars = (s: string) => {
    if (!booking) return s;
    const dateStr = format(parseISO(booking.booking_date), "dd MMMM yyyy", { locale: fr });
    const offerName = booking.offers?.name || "";
    const vars: Record<string, string> = {
      name: booking.name || "",
      date: dateStr,
      time: booking.time_slot || "",
      offer_name: offerName,
      offer_suffix: offerName ? ` (${offerName})` : "",
      meet_link: booking.meet_link || "",
      meet_block: booking.meet_link
        ? `🔗 Rejoindre Google Meet : ${booking.meet_link}`
        : "",
    };
    return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
  };

  const sendNotificationEmail = async (
    templateName: "booking-rescheduled" | "booking-cancelled",
    templateData: Record<string, any>,
  ) => {
    if (!booking?.email) {
      toast.error("Aucun email destinataire");
      return;
    }
    const idempotencyKey = `${templateName}-${booking.id}-${Date.now()}`;
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        recipientEmail: booking.email,
        idempotencyKey,
        templateData: { name: booking.name, ...templateData },
      },
    });
    if (error) throw error;
  };

  const handleReschedule = async () => {
    if (!booking || !newDate || !newTime) {
      toast.error("Date et heure requises");
      return;
    }
    setActionLoading(true);
    try {
      const oldDate = booking.booking_date;
      const oldTime = booking.time_slot;
      await updateBooking.mutateAsync({
        id: booking.id,
        booking_date: newDate,
        time_slot: newTime,
        status: "confirmed",
      } as any);
      // Sync Google Calendar event (PATCH start/end)
      try {
        const { data: syncRes, error: syncErr } = await supabase.functions.invoke("sync-booking-calendar", {
          body: { booking_id: booking.id, action: "update" },
        });
        if (syncErr) console.warn("Calendar sync error:", syncErr);
        else if (syncRes?.ok === false) console.warn("Calendar sync failed:", syncRes?.error);
      } catch (e) {
        console.warn("Calendar sync invoke failed:", e);
      }
      toast.success("RDV reporté");
      setRescheduleOpen(false);
      qc.invalidateQueries({ queryKey: ["booking-detail", booking.id] });
      // Open notify dialog
      setNotifyKind("rescheduled");
      setNotifyContext({
        oldDate: format(parseISO(oldDate), "dd MMMM yyyy", { locale: fr }),
        oldTime,
        newDate: format(parseISO(newDate), "dd MMMM yyyy", { locale: fr }),
        newTime,
        offerName: booking.offers?.name,
        meetLink: booking.meet_link,
        reason: rescheduleReason || undefined,
      });
      setNotifyOpen(true);
      setRescheduleReason("");
      setNewDate("");
      setNewTime("");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await updateBooking.mutateAsync({ id: booking.id, status: "cancelled" } as any);
      // Remove Google Calendar event
      try {
        const { data: syncRes, error: syncErr } = await supabase.functions.invoke("sync-booking-calendar", {
          body: { booking_id: booking.id, action: "cancel" },
        });
        if (syncErr) console.warn("Calendar cancel error:", syncErr);
        else if (syncRes?.ok === false) console.warn("Calendar cancel failed:", syncRes?.error);
      } catch (e) {
        console.warn("Calendar cancel invoke failed:", e);
      }
      toast.success("RDV annulé");
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ["booking-detail", booking.id] });
      setNotifyKind("cancelled");
      setNotifyContext({
        bookingDate: format(parseISO(booking.booking_date), "dd MMMM yyyy", { locale: fr }),
        timeSlot: booking.time_slot,
        offerName: booking.offers?.name,
        reason: cancelReason || undefined,
      });
      setNotifyOpen(true);
      setCancelReason("");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!booking) return;
    setActionLoading(true);
    try {
      await updateBooking.mutateAsync({ id: booking.id, status: "completed" } as any);
      toast.success("RDV marqué comme terminé");
      qc.invalidateQueries({ queryKey: ["booking-detail", booking.id] });
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmNotify = async () => {
    if (!notifyKind || !notifyContext) return;
    setActionLoading(true);
    try {
      if (notifyKind === "rescheduled") {
        await sendNotificationEmail("booking-rescheduled", notifyContext);
      } else if (notifyKind === "cancelled") {
        await sendNotificationEmail("booking-cancelled", notifyContext);
      }
      toast.success("Email envoyé au lead");
      setNotifyOpen(false);
      setNotifyKind(null);
      setNotifyContext(null);
    } catch (e: any) {
      toast.error(e.message || "Erreur envoi email");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Sheet open={!!bookingId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto bg-card border-white/10">
        {isLoading || !booking ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <SheetTitle className="text-lg">{booking.name}</SheetTitle>
                <Badge className={statusColors[booking.status]}>{statusLabels[booking.status]}</Badge>
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                <Calendar className="h-3.5 w-3.5" />
                {format(parseISO(booking.booking_date), "EEEE dd MMMM yyyy", { locale: fr })}
                <span className="opacity-50">·</span>
                <Clock className="h-3.5 w-3.5" />
                <span className="font-mono">{booking.time_slot}</span>
              </div>
            </SheetHeader>

            <Tabs defaultValue="reminders" className="mt-5">
              <TabsList className="grid grid-cols-3 w-full bg-background/40">
                <TabsTrigger value="reminders">Rappels</TabsTrigger>
                <TabsTrigger value="details">Détails</TabsTrigger>
                <TabsTrigger value="conversation">Conversation</TabsTrigger>
              </TabsList>

              {/* ===== RAPPELS ===== */}
              <TabsContent value="reminders" className="space-y-2.5 mt-4">
                {BOOKING_EMAIL_TYPES.map(({ type, label, description }) => {
                  const row = remindersByType.get(type);
                  const logs = logsByType.get(type) || [];
                  const latestLog = logs[0];
                  // Effective status: prefer booking_emails row, fallback on latest log
                  const status =
                    row?.status ||
                    (latestLog?.status === "sent" ? "sent" : latestLog?.status === "failed" ? "failed" : "pending");
                  const meta = reminderStatusBadge[status] || reminderStatusBadge.pending;
                  const Icon = meta.icon;
                  return (
                    <div key={type} className="rounded-lg border border-white/10 bg-background/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{label}</span>
                            <Badge className={`${meta.cls} text-[10px] flex items-center gap-1`}>
                              <Icon className="h-3 w-3" />{meta.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                          {row?.scheduled_at && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Prévu : {format(parseISO(row.scheduled_at), "dd MMM HH:mm", { locale: fr })}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={status === "sent" ? "outline" : "default"}
                          onClick={() => openPreview(type, row?.id ?? null)}
                          disabled={sending === type}
                        >
                          {status === "sent" ? <><RefreshCw className="h-3.5 w-3.5" /> Renvoyer</> : <><Send className="h-3.5 w-3.5" /> Envoyer</>}
                        </Button>
                      </div>

                      {/* Historique des envois (log entries) */}
                      {logs.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                            Historique ({logs.length})
                          </div>
                          {logs.slice(0, 5).map((l) => {
                            const ok = l.status === "sent";
                            const isManual = l.metadata?.manual === true;
                            return (
                              <div key={l.id} className="flex items-start gap-2 text-xs">
                                {ok ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={ok ? "text-green-400" : "text-destructive"}>
                                      {ok ? "Envoyé" : "Échec"}
                                    </span>
                                    <span className="text-muted-foreground">
                                      · {format(parseISO(l.created_at), "dd MMM HH:mm", { locale: fr })}
                                    </span>
                                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4">
                                      {isManual ? "Manuel" : "Auto"}
                                    </Badge>
                                  </div>
                                  {l.error_message && (
                                    <div className="text-destructive/80 text-[11px] truncate mt-0.5" title={l.error_message}>
                                      {l.error_message}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  Aperçu avant envoi · Variables résolues automatiquement depuis le RDV
                </p>
              </TabsContent>


              {/* ===== DETAILS ===== */}
              <TabsContent value="details" className="space-y-3 mt-4">
                <div className="rounded-lg border border-white/10 bg-background/40 p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{booking.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${booking.email}`} className="text-primary hover:underline truncate">{booking.email}</a>
                  </div>
                  {booking.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`https://wa.me/${booking.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {booking.phone}
                      </a>
                    </div>
                  )}
                  {booking.offers?.name && (
                    <div><Badge variant="outline">{booking.offers.name}</Badge></div>
                  )}
                  {booking.meet_link && (
                    <a href={booking.meet_link} target="_blank" rel="noopener noreferrer">
                      <Badge className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1 w-fit cursor-pointer hover:bg-primary/20">
                        <Video className="h-3 w-3" /> Lien Google Meet
                      </Badge>
                    </a>
                  )}
                  {booking.notes && (
                    <div className="text-xs text-muted-foreground pt-2 border-t border-white/10 mt-2">
                      {booking.notes}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {booking.status === "pending" && (
                    <Button size="sm" onClick={() => updateBooking.mutate({ id: booking.id, status: "confirmed" })}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmer
                    </Button>
                  )}
                  {(booking.status === "pending" || booking.status === "confirmed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setNewDate(booking.booking_date);
                        setNewTime(booking.time_slot);
                        setRescheduleOpen(true);
                      }}
                    >
                      <CalendarClock className="h-3.5 w-3.5" /> Reporter
                    </Button>
                  )}
                  {booking.status === "confirmed" && (
                    <Button size="sm" variant="secondary" onClick={handleComplete} disabled={actionLoading}>
                      <CheckCheck className="h-3.5 w-3.5" /> Terminé
                    </Button>
                  )}
                  {(booking.status === "pending" || booking.status === "confirmed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setCancelOpen(true)}
                    >
                      <Ban className="h-3.5 w-3.5" /> Annuler
                    </Button>
                  )}
                  {booking.lead_id && (
                    <Link to={`/leads/${booking.lead_id}`}>
                      <Button size="sm" variant="ghost">
                        Voir le lead <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              </TabsContent>

              {/* ===== CONVERSATION ===== */}
              <TabsContent value="conversation" className="space-y-3 mt-4">
                {!booking.lead_id ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Aucun lead lié à ce RDV.
                  </p>
                ) : (
                  <>
                    {conversation?.qualification && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1.5 text-xs">
                        <div className="font-semibold text-sm text-primary flex items-center gap-2">
                          <MessageSquare className="h-3.5 w-3.5" /> Qualification IA
                        </div>
                        {conversation.qualification.summary && (
                          <p className="text-foreground/80">{conversation.qualification.summary}</p>
                        )}
                        <div className="flex flex-wrap gap-1 pt-1">
                          {typeof conversation.qualification.interest_level === "number" && (
                            <Badge variant="outline" className="text-[10px]">
                              Intérêt {conversation.qualification.interest_level}/100
                            </Badge>
                          )}
                          {conversation.qualification.budget_signal && conversation.qualification.budget_signal !== "unknown" && (
                            <Badge variant="outline" className="text-[10px]">Budget : {conversation.qualification.budget_signal}</Badge>
                          )}
                          {conversation.qualification.urgency && conversation.qualification.urgency !== "unclear" && (
                            <Badge variant="outline" className="text-[10px]">Urgence : {conversation.qualification.urgency}</Badge>
                          )}
                        </div>
                        {conversation.qualification.pain_point && (
                          <p className="text-muted-foreground italic">« {conversation.qualification.pain_point} »</p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {(conversation?.messages || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          Aucun message WhatsApp.
                        </p>
                      ) : (
                        (conversation?.messages || []).map((m: any) => (
                          <div
                            key={m.id}
                            className={`rounded-md p-2 text-xs ${
                              m.direction === "inbound"
                                ? "bg-background/60 border border-white/5"
                                : "bg-primary/10 border border-primary/20 ml-6"
                            }`}
                          >
                            <div className="text-[10px] text-muted-foreground mb-0.5">
                              {m.direction === "inbound" ? "← Lead" : "→ Toi"} ·{" "}
                              {format(parseISO(m.sent_at), "dd MMM HH:mm", { locale: fr })}
                            </div>
                            <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <Link to={`/conversations?lead=${booking.lead_id}`}>
                      <Button size="sm" variant="outline" className="w-full">
                        Ouvrir la conversation complète <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                  </>
                )}
              </TabsContent>
            </Tabs>

            {/* ===== PREVIEW DIALOG (inline) ===== */}
            {previewType && (
              <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={() => setPreviewType(null)}>
                <div
                  className="bg-card border border-white/10 rounded-lg p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      Aperçu — {BOOKING_EMAIL_TYPES.find((t) => t.type === previewType)?.label}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setPreviewType(null)}>✕</Button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Destinataire</Label>
                      <Input value={previewTo} onChange={(e) => setPreviewTo(e.target.value)} className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs">Sujet</Label>
                      <Input value={previewSubject} onChange={(e) => setPreviewSubject(e.target.value)} className="h-9" />
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">→ {renderVars(previewSubject)}</p>
                    </div>
                    <div>
                      <Label className="text-xs">Corps HTML</Label>
                      <Textarea
                        value={previewBody}
                        onChange={(e) => setPreviewBody(e.target.value)}
                        className="min-h-[150px] font-mono text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Aperçu</Label>
                      <div
                        className="rounded-md border border-white/10 bg-white text-black p-3 text-sm max-h-60 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderVars(previewBody)) }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setPreviewType(null)}>Annuler</Button>
                    <Button
                      onClick={() => {
                        setSending(previewType);
                        sendReminder.mutate({
                          type: previewType,
                          bookingEmailId: previewEmailId,
                          subjectOverride: previewSubject,
                          bodyOverride: previewBody,
                          to: previewTo,
                        });
                      }}
                      disabled={sendReminder.isPending}
                    >
                      {sendReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Envoyer
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>

      {/* ===== RESCHEDULE DIALOG ===== */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Reporter le rendez-vous</DialogTitle>
            <DialogDescription>Choisis un nouveau créneau. Tu pourras notifier le lead juste après.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nouvelle date</Label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nouvelle heure</Label>
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Motif (optionnel)</Label>
              <Textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Ex. Indisponibilité de dernière minute"
                className="min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)} disabled={actionLoading}>Annuler</Button>
            <Button onClick={handleReschedule} disabled={actionLoading || !newDate || !newTime}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Reporter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CANCEL DIALOG ===== */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Ban className="h-5 w-5" /> Annuler le rendez-vous</DialogTitle>
            <DialogDescription>Le RDV passera en statut annulé. Tu pourras notifier le lead juste après.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Motif (optionnel)</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex. Empêchement de dernière minute"
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={actionLoading}>Retour</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== NOTIFY LEAD DIALOG ===== */}
      <Dialog open={notifyOpen} onOpenChange={(o) => { if (!o) { setNotifyOpen(false); setNotifyKind(null); } }}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Prévenir le lead ?</DialogTitle>
            <DialogDescription>
              {notifyKind === "rescheduled"
                ? "Envoyer un email au lead avec les nouvelles informations du rendez-vous."
                : "Envoyer un email au lead pour l'informer de l'annulation."}
              {booking?.email && <span className="block mt-1 font-mono text-xs">{booking.email}</span>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNotifyOpen(false); setNotifyKind(null); }} disabled={actionLoading}>
              Non, pas maintenant
            </Button>
            <Button onClick={confirmNotify} disabled={actionLoading || !booking?.email}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer l'email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
