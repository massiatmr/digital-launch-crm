import { useMemo, useState } from "react";
import {
  BOOKING_EMAIL_TYPES,
  DEFAULT_TEMPLATES,
  useWorkspaceBookingEmailTemplates,
  useUpsertWorkspaceBookingEmailTemplate,
  type BookingEmailType,
} from "@/hooks/useBookingEmailTemplates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, Pencil } from "lucide-react";
import { EmailTemplateEditor } from "./EmailTemplateEditor";

export function WorkspaceEmailTemplatesList({ workspaceId }: { workspaceId: string | null }) {
  const { data } = useWorkspaceBookingEmailTemplates(workspaceId);
  const upsert = useUpsertWorkspaceBookingEmailTemplate();
  const [editing, setEditing] = useState<BookingEmailType | null>(null);

  const byType = useMemo(() => {
    const m = new Map<BookingEmailType, { enabled: boolean; subject: string; body_html: string }>();
    (data || []).forEach(t => m.set(t.type, { enabled: t.enabled, subject: t.subject, body_html: t.body_html }));
    return m;
  }, [data]);

  if (!workspaceId) {
    return <p className="text-sm text-muted-foreground">Workspace introuvable.</p>;
  }

  return (
    <div className="space-y-2">
      {BOOKING_EMAIL_TYPES.map(({ type, label, description }) => {
        const existing = byType.get(type);
        const subject = existing?.subject || DEFAULT_TEMPLATES[type].subject;
        const enabled = existing?.enabled ?? true;
        const personalized = !!existing;
        return (
          <button
            key={type}
            type="button"
            onClick={() => setEditing(type)}
            className="w-full text-left rounded-lg border border-white/5 bg-card/40 hover:bg-card/70 transition-colors p-3 flex items-center gap-3 group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{label}</span>
                {personalized ? (
                  <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Personnalisé</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Défaut</Badge>
                )}
                {!enabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">Off</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{subject}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{description}</p>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={enabled}
                onCheckedChange={(v) =>
                  upsert.mutate({
                    workspace_id: workspaceId,
                    type,
                    enabled: v,
                    subject,
                    body_html: existing?.body_html || DEFAULT_TEMPLATES[type].body_html,
                  })
                }
              />
              <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        );
      })}

      {editing && (
        <EmailTemplateEditor
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          scope={{ kind: "workspace", workspaceId }}
          type={editing}
          inheritedSubject={DEFAULT_TEMPLATES[editing].subject}
          inheritedBody={DEFAULT_TEMPLATES[editing].body_html}
          inheritedSource="Modèle par défaut"
        />
      )}
    </div>
  );
}
