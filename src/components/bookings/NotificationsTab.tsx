import { useWorkspaceAdminReminders } from "@/hooks/useBookingEmailTemplates";
import { useWorkspaceBookingWaTemplates, useWorkspaceWhatsAppTemplates, BOOKING_WA_TYPES } from "@/hooks/useBookingWaTemplates";
import { WaReminderRow } from "./WaReminderRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OfferEmailTemplatesEditor } from "./OfferEmailTemplatesEditor";
import { WorkspaceEmailTemplatesList } from "./WorkspaceEmailTemplatesList";
import { SendBookingEmailToLeadDialog } from "./SendBookingEmailToLeadDialog";
import { useState, useEffect } from "react";
import { Mail, BellRing, Layers, Send, MessageCircle } from "lucide-react";

export function NotificationsTab({ workspaceId }: { workspaceId: string | null }) {
  const { data, update } = useWorkspaceAdminReminders(workspaceId);
  const { data: waCfgs, upsert: waUpsert } = useWorkspaceBookingWaTemplates(workspaceId);
  const { data: waTemplates = [] } = useWorkspaceWhatsAppTemplates(workspaceId);
  const [email, setEmail] = useState("");
  const [manualSendOpen, setManualSendOpen] = useState(false);

  useEffect(() => {
    if (data?.notification_email !== undefined) setEmail(data.notification_email || "");
  }, [data?.notification_email]);

  return (
    <div className="space-y-5">
      <Card className="border-white/5 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" /> Notifications admin
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Emails envoyés aux membres du workspace à chaque nouveau RDV et 1h avant l'échéance.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">Rappels admin avant RDV</p>
              <p className="text-xs text-muted-foreground">Envoie un email aux membres 1h avant chaque RDV.</p>
            </div>
            <Switch
              checked={!!data?.booking_admin_reminders_enabled}
              onCheckedChange={(v) => update.mutate({ booking_admin_reminders_enabled: v })}
              disabled={!workspaceId}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Email de notification du workspace (optionnel)</label>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="ex: equipe@maboite.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!workspaceId}
              />
              <Button
                size="sm"
                onClick={() => update.mutate({ notification_email: email || null })}
                disabled={!workspaceId}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/5 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" /> Rappels WhatsApp (templates)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Templates HSM envoyés automatiquement au lead à la confirmation, 24h, 12h et 1h avant le RDV.
            Les templates doivent être approuvés par Meta (catégorie UTILITY recommandée) et synchronisés depuis Settings → Intégrations.
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {!workspaceId && (
            <p className="text-xs text-muted-foreground">Sélectionne un workspace pour configurer.</p>
          )}
          {workspaceId && waTemplates.length === 0 && (
            <p className="text-xs text-amber-400/80">
              Aucun template WhatsApp approuvé pour ce workspace. Configure un numéro WhatsApp et synchronise tes templates dans Settings → Intégrations.
            </p>
          )}
          {workspaceId && BOOKING_WA_TYPES.map((row) => {
            const cfg = waCfgs?.find((c) => c.type === row.type);
            return (
              <WaReminderRow
                key={row.type}
                type={row.type}
                label={row.label}
                description={row.description}
                config={cfg}
                templates={waTemplates as any}
                onChange={(patch) => waUpsert.mutate(patch)}
                disabled={waTemplates.length === 0}
              />
            );
          })}
        </CardContent>
      </Card>



      <Card className="border-white/5 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Emails par défaut du workspace
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Ces modèles s'appliquent à toutes les offres. Toute personnalisation par offre les remplace.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setManualSendOpen(true)}
              disabled={!workspaceId}
              className="shrink-0"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> Envoyer à un lead
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <WorkspaceEmailTemplatesList workspaceId={workspaceId} />
        </CardContent>
      </Card>

      <Card className="border-white/5 bg-card/50 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Personnalisation par offre
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Surchargez les emails (confirmation, 24h, 12h, 1h, 5 min) pour une offre spécifique.
            Ces modèles remplacent ceux par défaut du workspace pour les leads de cette offre.
          </p>
        </CardHeader>
        <CardContent>
          <OfferEmailTemplatesEditor workspaceId={workspaceId} />
        </CardContent>
      </Card>


      <SendBookingEmailToLeadDialog
        open={manualSendOpen}
        onOpenChange={setManualSendOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}
