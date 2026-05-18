import { useState, useMemo } from "react";
import { useOffers } from "@/hooks/useOfferData";
import {
  useOfferBookingEmailTemplates,
  useUpsertOfferBookingEmailTemplate,
  useResetOfferBookingEmailTemplate,
  BOOKING_EMAIL_TYPES,
  DEFAULT_TEMPLATES,
  type BookingEmailType,
  type OfferBookingEmailTemplate,
} from "@/hooks/useBookingEmailTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Save } from "lucide-react";

const VARIABLES = ["{{name}}", "{{date}}", "{{time}}", "{{offer_name}}", "{{offer_suffix}}", "{{meet_link}}", "{{meet_block}}"];

interface RowState {
  enabled: boolean;
  subject: string;
  body_html: string;
}

export function OfferEmailTemplatesEditor({ workspaceId }: { workspaceId: string | null }) {
  const { data: offers } = useOffers();
  const [offerId, setOfferId] = useState<string | null>(null);
  const effectiveOfferId = offerId || offers?.[0]?.id || null;
  const { data: templates } = useOfferBookingEmailTemplates(effectiveOfferId);
  const upsert = useUpsertOfferBookingEmailTemplate();
  const reset = useResetOfferBookingEmailTemplate();

  const byType = useMemo(() => {
    const map = new Map<BookingEmailType, OfferBookingEmailTemplate>();
    (templates || []).forEach(t => map.set(t.type, t));
    return map;
  }, [templates]);

  const [drafts, setDrafts] = useState<Record<string, RowState>>({});

  const getRow = (type: BookingEmailType): RowState => {
    const key = `${effectiveOfferId}:${type}`;
    if (drafts[key]) return drafts[key];
    const existing = byType.get(type);
    if (existing) return { enabled: existing.enabled, subject: existing.subject, body_html: existing.body_html };
    return { enabled: true, subject: DEFAULT_TEMPLATES[type].subject, body_html: DEFAULT_TEMPLATES[type].body_html };
  };

  const setRow = (type: BookingEmailType, patch: Partial<RowState>) => {
    const key = `${effectiveOfferId}:${type}`;
    setDrafts(d => ({ ...d, [key]: { ...getRow(type), ...patch } }));
  };

  const save = (type: BookingEmailType) => {
    if (!effectiveOfferId) return;
    const row = getRow(type);
    upsert.mutate({
      offer_id: effectiveOfferId,
      type,
      enabled: row.enabled,
      subject: row.subject,
      body_html: row.body_html,
      workspace_id: workspaceId,
    });
    const key = `${effectiveOfferId}:${type}`;
    setDrafts(d => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  const resetTpl = (type: BookingEmailType) => {
    if (!effectiveOfferId) return;
    reset.mutate({ offer_id: effectiveOfferId, type });
    const key = `${effectiveOfferId}:${type}`;
    setDrafts(d => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  if (!offers || offers.length === 0) {
    return <p className="text-sm text-muted-foreground">Créez d'abord une offre pour configurer ses emails.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Offre :</span>
        <Select value={effectiveOfferId || ""} onValueChange={setOfferId}>
          <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {offers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1">
          {VARIABLES.map(v => (
            <Badge key={v} variant="outline" className="font-mono text-[10px]">{v}</Badge>
          ))}
        </div>
      </div>

      {BOOKING_EMAIL_TYPES.map(({ type, label, description }) => {
        const row = getRow(type);
        const existing = byType.get(type);
        const key = `${effectiveOfferId}:${type}`;
        const dirty = !!drafts[key];
        return (
          <Card key={type} className="border-white/5 bg-card/50 backdrop-blur">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={row.enabled} onCheckedChange={(v) => setRow(type, { enabled: v })} />
                    <span className="text-xs text-muted-foreground">{row.enabled ? "Activé" : "Désactivé"}</span>
                  </div>
                  {existing && (
                    <Button variant="ghost" size="sm" onClick={() => resetTpl(type)} title="Réinitialiser au défaut">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" onClick={() => save(type)} disabled={!dirty && !!existing && existing.enabled === row.enabled}>
                    <Save className="h-3.5 w-3.5 mr-1" /> Enregistrer
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Sujet</label>
                <Input value={row.subject} onChange={(e) => setRow(type, { subject: e.target.value })} disabled={!row.enabled} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Corps HTML</label>
                <Textarea
                  value={row.body_html}
                  onChange={(e) => setRow(type, { body_html: e.target.value })}
                  disabled={!row.enabled}
                  className="min-h-[160px] font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
