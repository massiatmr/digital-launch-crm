import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, RotateCcw, Save, Send } from "lucide-react";
import { WysiwygEditor } from "./WysiwygEditor";
import type { Editor } from "@tiptap/react";
import {
  BOOKING_EMAIL_TYPES,
  DEFAULT_TEMPLATES,
  type BookingEmailType,
  useOfferBookingEmailTemplates,
  useUpsertOfferBookingEmailTemplate,
  useResetOfferBookingEmailTemplate,
  useWorkspaceBookingEmailTemplates,
  useUpsertWorkspaceBookingEmailTemplate,
  useResetWorkspaceBookingEmailTemplate,
  useSendTestBookingEmail,
} from "@/hooks/useBookingEmailTemplates";

const VARIABLES = [
  { token: "{{name}}", label: "Nom" },
  { token: "{{date}}", label: "Date" },
  { token: "{{time}}", label: "Heure" },
  { token: "{{offer_name}}", label: "Offre" },
  { token: "{{offer_suffix}}", label: "Suffixe offre" },
  { token: "{{meet_link}}", label: "Lien Meet" },
  { token: "{{meet_block}}", label: "Bloc Meet" },
];

type Scope =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "offer"; offerId: string; workspaceId: string | null };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: Scope;
  type: BookingEmailType;
  /** Inherited content used when no override exists yet (workspace default for offer scope, code default for workspace scope) */
  inheritedSubject?: string;
  inheritedBody?: string;
  inheritedSource?: string;
}

export function EmailTemplateEditor({
  open, onOpenChange, scope, type,
  inheritedSubject, inheritedBody, inheritedSource,
}: Props) {
  const typeMeta = BOOKING_EMAIL_TYPES.find(t => t.type === type)!;

  // Fetch existing override
  const wsTemplates = useWorkspaceBookingEmailTemplates(scope.kind === "workspace" ? scope.workspaceId : null);
  const offerTemplates = useOfferBookingEmailTemplates(scope.kind === "offer" ? scope.offerId : null);
  const existing =
    scope.kind === "workspace"
      ? (wsTemplates.data || []).find(t => t.type === type)
      : (offerTemplates.data || []).find(t => t.type === type);

  const baseSubject = existing?.subject ?? inheritedSubject ?? DEFAULT_TEMPLATES[type].subject;
  const baseBody = existing?.body_html ?? inheritedBody ?? DEFAULT_TEMPLATES[type].body_html;
  const baseEnabled = existing?.enabled ?? true;

  const [subject, setSubject] = useState(baseSubject);
  const [bodyHtml, setBodyHtml] = useState(baseBody);
  const [enabled, setEnabled] = useState(baseEnabled);
  const [testEmail, setTestEmail] = useState("");
  const [tab, setTab] = useState<"visual" | "code">("visual");
  const editorRef = useRef<Editor | null>(null);

  // Reset state when dialog opens / scope/type change
  useEffect(() => {
    if (open) {
      setSubject(baseSubject);
      setBodyHtml(baseBody);
      setEnabled(baseEnabled);
      setTestEmail("");
      setTab("visual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, scope.kind, scope.kind === "workspace" ? scope.workspaceId : scope.offerId, existing?.id]);

  const upsertOffer = useUpsertOfferBookingEmailTemplate();
  const resetOffer = useResetOfferBookingEmailTemplate();
  const upsertWs = useUpsertWorkspaceBookingEmailTemplate();
  const resetWs = useResetWorkspaceBookingEmailTemplate();
  const sendTest = useSendTestBookingEmail();

  const isSaving = upsertOffer.isPending || upsertWs.isPending;

  const insertVariable = (token: string) => {
    if (tab === "visual" && editorRef.current) {
      editorRef.current.chain().focus().insertContent(token).run();
    } else {
      setBodyHtml(prev => prev + token);
    }
  };

  const onSave = () => {
    if (scope.kind === "workspace") {
      upsertWs.mutate(
        { workspace_id: scope.workspaceId, type, enabled, subject, body_html: bodyHtml },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      upsertOffer.mutate(
        { offer_id: scope.offerId, type, enabled, subject, body_html: bodyHtml, workspace_id: scope.workspaceId },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const onReset = () => {
    if (!existing) return;
    if (scope.kind === "workspace") {
      resetWs.mutate(
        { workspace_id: scope.workspaceId, type },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      resetOffer.mutate(
        { offer_id: scope.offerId, type },
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const onSendTest = () => {
    if (!/.+@.+\..+/.test(testEmail)) return;
    sendTest.mutate({ to: testEmail, subject, body_html: bodyHtml });
  };

  const scopeLabel = scope.kind === "workspace" ? "Défaut du workspace" : "Personnalisation de l'offre";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-lg">{typeMeta.label}</DialogTitle>
            <Badge variant="outline" className="text-[10px]">{scopeLabel}</Badge>
            {existing ? (
              <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Personnalisé</Badge>
            ) : inheritedSource ? (
              <Badge variant="outline" className="text-[10px]">Hérité — {inheritedSource}</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{typeMeta.description}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <span className="text-xs text-muted-foreground">{enabled ? "Activé" : "Désactivé — l'email ne sera pas envoyé"}</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Sujet</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!enabled} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-xs text-muted-foreground">Contenu</label>
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                <TabsList className="h-7">
                  <TabsTrigger value="visual" className="text-xs h-6 px-2">Visuel</TabsTrigger>
                  <TabsTrigger value="code" className="text-xs h-6 px-2">Code HTML</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {tab === "visual" ? (
              <WysiwygEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                onReady={(ed) => (editorRef.current = ed)}
                disabled={!enabled}
              />
            ) : (
              <Textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                disabled={!enabled}
                className="min-h-[200px] font-mono text-xs"
              />
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground mr-1 self-center">Insérer :</span>
            {VARIABLES.map(v => (
              <Button
                key={v.token}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] font-mono"
                onClick={() => insertVariable(v.token)}
                disabled={!enabled}
              >
                {v.token}
              </Button>
            ))}
          </div>

          <div className="rounded-md border border-white/10 bg-card/40 p-3 space-y-2">
            <p className="text-xs font-medium">Test d'envoi</p>
            <p className="text-[11px] text-muted-foreground">
              Envoie cet email (avec des valeurs d'exemple) à l'adresse de votre choix. Aucune sauvegarde requise.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="email"
                placeholder="moi@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 min-w-[180px]"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onSendTest}
                disabled={sendTest.isPending || !/.+@.+\..+/.test(testEmail)}
              >
                {sendTest.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <Send className="h-3.5 w-3.5 mr-1" />}
                Envoyer un test
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:gap-2">
          {existing && (
            <Button type="button" variant="ghost" size="sm" onClick={onReset} className="mr-auto">
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Réinitialiser
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
