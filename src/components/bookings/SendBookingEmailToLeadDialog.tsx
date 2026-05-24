import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, ChevronsUpDown, Send, AlertTriangle } from "lucide-react";
import { useLeads } from "@/hooks/useLeadData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BOOKING_EMAIL_TYPES,
  DEFAULT_TEMPLATES,
  useWorkspaceBookingEmailTemplates,
  type BookingEmailType,
} from "@/hooks/useBookingEmailTemplates";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | null;
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function todayIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatFrDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function SendBookingEmailToLeadDialog({ open, onOpenChange, workspaceId }: Props) {
  const { data: leads } = useLeads();
  const { data: wsTemplates } = useWorkspaceBookingEmailTemplates(workspaceId);

  const [type, setType] = useState<BookingEmailType>("confirmation");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [time, setTime] = useState("14:00");
  const [meetLink, setMeetLink] = useState("");
  const [offerName, setOfferName] = useState("");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [autofillInfo, setAutofillInfo] = useState<string | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(false);

  useEffect(() => {
    if (open) {
      setType("confirmation");
      setLeadId(null);
      setEmailOverride("");
      setDate(todayIsoDate());
      setTime("14:00");
      setMeetLink("");
      setOfferName("");
      setConfirmed(false);
      setAutofillInfo(null);
    }
  }, [open]);

  const leadsWithEmail = useMemo(
    () => (leads || []).filter((l: any) => l.email && /.+@.+\..+/.test(l.email)),
    [leads]
  );

  const lead = useMemo(
    () => leadsWithEmail.find((l: any) => l.id === leadId),
    [leadsWithEmail, leadId]
  );

  // Auto-détection du RDV à la sélection du lead
  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    (async () => {
      setLoadingBooking(true);
      setAutofillInfo(null);
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        let { data } = await supabase
          .from("bookings")
          .select("booking_date, time_slot, meet_link, offer_id, offers(name)")
          .eq("lead_id", leadId)
          .is("deleted_at", null)
          .gte("booking_date", todayIso)
          .order("booking_date", { ascending: true })
          .order("time_slot", { ascending: true })
          .limit(1);
        if (!data || data.length === 0) {
          const r = await supabase
            .from("bookings")
            .select("booking_date, time_slot, meet_link, offer_id, offers(name)")
            .eq("lead_id", leadId)
            .is("deleted_at", null)
            .order("booking_date", { ascending: false })
            .order("time_slot", { ascending: false })
            .limit(1);
          data = r.data as any;
        }
        if (cancelled) return;
        const b: any = data?.[0];
        if (b) {
          setDate(b.booking_date);
          setTime((b.time_slot || "14:00").slice(0, 5));
          setMeetLink(b.meet_link || "");
          setOfferName(b.offers?.name || "");
          setAutofillInfo(
            `RDV détecté : ${formatFrDate(b.booking_date)} à ${(b.time_slot || "").slice(0, 5)}${b.offers?.name ? ` — ${b.offers.name}` : ""}`
          );
        } else {
          setAutofillInfo("Aucun RDV trouvé pour ce lead — remplis les champs manuellement.");
        }
      } finally {
        if (!cancelled) setLoadingBooking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const recipient = (emailOverride.trim() || lead?.email || "").trim();
  const recipientName = (lead?.name as string) || "Client";

  const tpl = useMemo(() => {
    const ws = (wsTemplates || []).find((t) => t.type === type);
    if (ws && ws.enabled) return { subject: ws.subject, body_html: ws.body_html, source: "Défaut workspace" };
    const d = DEFAULT_TEMPLATES[type];
    return { subject: d.subject, body_html: d.body_html, source: "Modèle par défaut" };
  }, [wsTemplates, type]);

  const sampleVars = useMemo(() => {
    const meet_block = meetLink
      ? `<a href="${meetLink}" style="color:#7c3aed;font-weight:600">🔗 Rejoindre Google Meet</a>`
      : "";
    return {
      name: recipientName,
      date: formatFrDate(date),
      time,
      offer_name: offerName,
      offer_suffix: offerName ? ` (${offerName})` : "",
      meet_link: meetLink,
      meet_block,
    };
  }, [recipientName, date, time, meetLink, offerName]);

  const renderedSubject = render(tpl.subject, sampleVars);
  const renderedHtml = render(tpl.body_html, sampleVars);
  const previewDoc = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="background:#fff;font-family:'Plus Jakarta Sans',Arial,sans-serif;margin:0;padding:0;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px;font-size:14px;line-height:1.6">${renderedHtml}</div>
</body></html>`;

  const canSend =
    !!recipient &&
    /.+@.+\..+/.test(recipient) &&
    !!renderedSubject &&
    !!renderedHtml &&
    confirmed &&
    !sending;

  const onSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-test-booking-email", {
        body: {
          to: recipient,
          subject: tpl.subject,
          body_html: tpl.body_html,
          sample_vars: sampleVars,
          as_real: true,
          template_name: `booking-manual-${type}`,
        },
      });
      if (error) throw error;
      toast.success(`Email envoyé à ${recipient}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Envoyer un email à un lead
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Utilise les modèles par défaut du workspace, sans préfixe <span className="font-mono">[TEST]</span>.
            Le lead reçoit le vrai email.
          </p>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: form */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Type d'email</Label>
              <Select value={type} onValueChange={(v) => setType(v as BookingEmailType)}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_EMAIL_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Source : {tpl.source}</p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Lead destinataire</Label>
              <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-9 mt-1 font-normal"
                  >
                    {lead ? (
                      <span className="truncate">
                        {lead.name} <span className="text-muted-foreground">— {lead.email}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Choisir un lead avec email…</span>
                    )}
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechercher par nom ou email…" />
                    <CommandList>
                      <CommandEmpty>Aucun lead avec email.</CommandEmpty>
                      <CommandGroup>
                        {leadsWithEmail.map((l: any) => (
                          <CommandItem
                            key={l.id}
                            value={`${l.name} ${l.email}`}
                            onSelect={() => {
                              setLeadId(l.id);
                              setLeadPickerOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-3.5 w-3.5 ${
                                leadId === l.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm">{l.name}</span>
                              <span className="text-[11px] text-muted-foreground">{l.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Email destinataire (modifiable)
              </Label>
              <Input
                type="email"
                placeholder={lead?.email || "destinataire@example.com"}
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                className="mt-1 h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Date du RDV</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Heure</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Lien Meet (optionnel)</Label>
              <Input
                type="url"
                placeholder="https://meet.google.com/…"
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                className="mt-1 h-9"
              />
            </div>

            {(loadingBooking || autofillInfo) && (
              <div className="text-[11px] rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-muted-foreground flex items-center gap-1.5">
                {loadingBooking ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Recherche du RDV…</>
                ) : (
                  <span>{autofillInfo}</span>
                )}
              </div>
            )}

            <label className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                Je confirme vouloir envoyer ce vrai email à <strong className="text-foreground">{recipient || "—"}</strong>.
              </span>
            </label>
          </div>

          {/* Right: preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Aperçu</Label>
              <Badge variant="outline" className="text-[10px]">{tpl.source}</Badge>
            </div>
            <div className="rounded-md border border-white/10 bg-card/40 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 bg-card/60 space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">À</div>
                <div className="text-xs font-medium truncate">{recipient || <span className="text-muted-foreground">—</span>}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Sujet</div>
                <div className="text-xs font-medium truncate">{renderedSubject}</div>
              </div>
              <iframe
                title="preview"
                srcDoc={previewDoc}
                className="w-full h-[360px] bg-white"
                sandbox=""
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button size="sm" onClick={onSend} disabled={!canSend}>
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1" />
            )}
            Envoyer maintenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
