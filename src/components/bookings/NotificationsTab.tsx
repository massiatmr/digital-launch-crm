import { useWorkspaceAdminReminders } from "@/hooks/useBookingEmailTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OfferEmailTemplatesEditor } from "./OfferEmailTemplatesEditor";
import { useState, useEffect } from "react";
import { Mail, BellRing } from "lucide-react";

export function NotificationsTab({ workspaceId }: { workspaceId: string | null }) {
  const { data, update } = useWorkspaceAdminReminders(workspaceId);
  const [email, setEmail] = useState("");

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
            <Mail className="h-4 w-4 text-primary" /> Emails au client (par offre)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Personnalisez les emails de confirmation et les rappels (24h, 12h, 1h) envoyés au prospect pour chaque offre.
          </p>
        </CardHeader>
        <CardContent>
          <OfferEmailTemplatesEditor workspaceId={workspaceId} />
        </CardContent>
      </Card>
    </div>
  );
}
