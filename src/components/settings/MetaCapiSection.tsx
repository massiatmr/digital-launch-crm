import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Activity, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";

type Cfg = {
  id?: string;
  workspace_id: string;
  dataset_id: string;
  access_token: string;
  test_event_code: string | null;
  enabled: boolean;
  send_lead: boolean;
  send_qualified: boolean;
  send_won: boolean;
  send_booking: boolean;
};

const empty = (ws: string): Cfg => ({
  workspace_id: ws,
  dataset_id: "",
  access_token: "",
  test_event_code: "",
  enabled: true,
  send_lead: true,
  send_qualified: true,
  send_won: true,
  send_booking: true,
});

export function MetaCapiSection() {
  const workspaceId = useCurrentWorkspaceId();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const runBackfill = async () => {
    if (!workspaceId) return;
    setBackfilling(true);
    const { data, error } = await supabase.functions.invoke("meta-capi-send", {
      body: { backfill: true, workspace_id: workspaceId, days: 7 },
    });
    setBackfilling(false);
    if (error) {
      toast.error("Rattrapage échoué : " + error.message);
    } else {
      const d = (data ?? {}) as { sent?: number; skipped?: number; failed?: number };
      toast.success(`Rattrapage terminé — envoyés: ${d.sent ?? 0}, déjà envoyés: ${d.skipped ?? 0}, erreurs: ${d.failed ?? 0}`);
    }
  };

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    (supabase.from("meta_capi_configs" as any) as any)
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
      .then(({ data }: any) => {
        setCfg(data ?? empty(workspaceId));
        setLoading(false);
      });
  }, [workspaceId]);

  if (!workspaceId) return null;

  const save = async () => {
    if (!cfg) return;
    if (!cfg.dataset_id.trim() || !cfg.access_token.trim()) {
      toast.error("Dataset ID et Access Token requis");
      return;
    }
    setSaving(true);
    const payload = { ...cfg, test_event_code: cfg.test_event_code?.trim() || null };
    const { error } = await (supabase.from("meta_capi_configs" as any) as any).upsert(payload, {
      onConflict: "workspace_id",
    });
    setSaving(false);
    if (error) {
      toast.error("Erreur : " + error.message);
    } else {
      toast.success("Configuration Meta CAPI enregistrée");
    }
  };

  if (loading || !cfg) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Meta Conversions API (CRM)
            </CardTitle>
            <CardDescription>
              Envoie automatiquement les événements de conversion (qualifié, RDV, gagné) vers ton ensemble de données Meta. Configuration isolée par workspace.
            </CardDescription>
          </div>
          {cfg.id && <Badge variant={cfg.enabled ? "default" : "secondary"}>{cfg.enabled ? "Actif" : "Désactivé"}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Dataset ID (Pixel ID)</Label>
            <Input
              placeholder="848748417656301"
              value={cfg.dataset_id}
              onChange={(e) => setCfg({ ...cfg, dataset_id: e.target.value })}
            />
          </div>
          <div>
            <Label>Test Event Code (optionnel)</Label>
            <Input
              placeholder="TEST12345"
              value={cfg.test_event_code ?? ""}
              onChange={(e) => setCfg({ ...cfg, test_event_code: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label>Access Token (CAPI)</Label>
          <Input
            type="password"
            placeholder="EAA..."
            value={cfg.access_token}
            onChange={(e) => setCfg({ ...cfg, access_token: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Génère-le dans Gestionnaire d'événements → Paramètres → API Conversions → Générer un token d'accès.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label>Activer l'envoi à Meta</Label>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Nouveau lead (site + landing) → <span className="font-mono text-xs">Lead</span></Label>
            <Switch checked={cfg.send_lead} onCheckedChange={(v) => setCfg({ ...cfg, send_lead: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Lead qualifié → <span className="font-mono text-xs">QualifiedLead</span></Label>
            <Switch checked={cfg.send_qualified} onCheckedChange={(v) => setCfg({ ...cfg, send_qualified: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">RDV pris → <span className="font-mono text-xs">Schedule</span></Label>
            <Switch checked={cfg.send_booking} onCheckedChange={(v) => setCfg({ ...cfg, send_booking: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-normal">Won / Client signé → <span className="font-mono text-xs">Purchase</span></Label>
            <Switch checked={cfg.send_won} onCheckedChange={(v) => setCfg({ ...cfg, send_won: v })} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
          <a
            href="https://business.facebook.com/events_manager2/list/dataset"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ouvrir Gestionnaire d'événements <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={runBackfill} disabled={backfilling || !cfg.id}>
              {backfilling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rattraper 7 derniers jours
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Données envoyées (hashées SHA-256) : email, téléphone, prénom/nom, ville, et le <code>lead_id</code> Meta s'il est disponible (capté via le webhook Lead Ads).
          Pour les leads du site web/landing, on envoie aussi <code>fbc</code>, <code>fbp</code>, IP et User-Agent pour ré-attribuer précisément à ta campagne Meta.
        </p>
      </CardContent>
    </Card>
  );
}
