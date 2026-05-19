import { useMemo, useState } from "react";
import { useOffers } from "@/hooks/useOfferData";
import {
  useOfferBookingEmailTemplates,
  useUpsertOfferBookingEmailTemplate,
  useWorkspaceBookingEmailTemplates,
  BOOKING_EMAIL_TYPES,
  DEFAULT_TEMPLATES,
  type BookingEmailType,
} from "@/hooks/useBookingEmailTemplates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, Pencil } from "lucide-react";
import { EmailTemplateEditor } from "./EmailTemplateEditor";

export function OfferEmailTemplatesEditor({ workspaceId }: { workspaceId: string | null }) {
  const { data: offers } = useOffers();
  const [offerId, setOfferId] = useState<string | null>(null);
  const effectiveOfferId = offerId || offers?.[0]?.id || null;
  const { data: offerTemplates } = useOfferBookingEmailTemplates(effectiveOfferId);
  const { data: wsTemplates } = useWorkspaceBookingEmailTemplates(workspaceId);
  const upsert = useUpsertOfferBookingEmailTemplate();
  const [editing, setEditing] = useState<BookingEmailType | null>(null);

  const offerByType = useMemo(() => {
    const m = new Map<BookingEmailType, { enabled: boolean; subject: string; body_html: string }>();
    (offerTemplates || []).forEach(t => m.set(t.type, { enabled: t.enabled, subject: t.subject, body_html: t.body_html }));
    return m;
  }, [offerTemplates]);

  const wsByType = useMemo(() => {
    const m = new Map<BookingEmailType, { enabled: boolean; subject: string; body_html: string }>();
    (wsTemplates || []).forEach(t => m.set(t.type, { enabled: t.enabled, subject: t.subject, body_html: t.body_html }));
    return m;
  }, [wsTemplates]);

  if (!offers || offers.length === 0) {
    return <p className="text-sm text-muted-foreground">Créez d'abord une offre pour configurer ses emails.</p>;
  }

  const resolveInherited = (type: BookingEmailType) => {
    const ws = wsByType.get(type);
    if (ws) return { subject: ws.subject, body_html: ws.body_html, source: "Défaut workspace", enabled: ws.enabled };
    const d = DEFAULT_TEMPLATES[type];
    return { subject: d.subject, body_html: d.body_html, source: "Modèle par défaut", enabled: true };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Offre :</span>
        <Select value={effectiveOfferId || ""} onValueChange={setOfferId}>
          <SelectTrigger className="w-64 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {offers.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {BOOKING_EMAIL_TYPES.map(({ type, label, description }) => {
          const offerOverride = offerByType.get(type);
          const inherited = resolveInherited(type);
          const subject = offerOverride?.subject || inherited.subject;
          const enabled = offerOverride?.enabled ?? inherited.enabled;
          const personalized = !!offerOverride;
          return (
            <div
              key={type}
              role="button"
              tabIndex={0}
              onClick={() => setEditing(type)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(type); } }}
              className="w-full text-left rounded-lg border border-white/5 bg-card/40 hover:bg-card/70 transition-colors p-3 flex items-center gap-3 group cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{label}</span>
                  {personalized ? (
                    <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Personnalisé</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Hérité — {inherited.source}</Badge>
                  )}
                  {!enabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">Off</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{subject}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{description}</p>
              </div>
              <div className="flex items-center gap-2">
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                      effectiveOfferId &&
                      upsert.mutate({
                        offer_id: effectiveOfferId,
                        type,
                        enabled: v,
                        subject: offerOverride?.subject || inherited.subject,
                        body_html: offerOverride?.body_html || inherited.body_html,
                        workspace_id: workspaceId,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(type); }}
                  className="p-1.5 rounded-md hover:bg-white/5 transition-colors"
                  aria-label="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>

      {editing && effectiveOfferId && (
        <EmailTemplateEditor
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          scope={{ kind: "offer", offerId: effectiveOfferId, workspaceId }}
          type={editing}
          inheritedSubject={resolveInherited(editing).subject}
          inheritedBody={resolveInherited(editing).body_html}
          inheritedSource={resolveInherited(editing).source}
        />
      )}
    </div>
  );
}
