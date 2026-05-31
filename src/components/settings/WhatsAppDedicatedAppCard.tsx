import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Copy, ExternalLink, RefreshCw, Trash2, ShieldCheck, AlertTriangle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  workspaceId: string | null;
}

interface DedicatedConfig {
  id: string;
  app_id: string | null;
  app_secret: string | null;
  access_token: string;
  business_account_id: string;
  phone_number_id: string;
  verify_token: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
  connection_mode: string;
  webhook_subscribed: boolean;
  last_tested_at: string | null;
  is_active: boolean;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  not_configured: { label: "Non configuré", variant: "outline" },
  incomplete: { label: "Configuration incomplète", variant: "secondary" },
  connected: { label: "Connecté", variant: "default" },
  error: { label: "Erreur de connexion", variant: "destructive" },
  webhook_unverified: { label: "Webhook non vérifié", variant: "secondary" },
};

export function WhatsAppDedicatedAppCard({ workspaceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [config, setConfig] = useState<DedicatedConfig | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enabled, setEnabled] = useState(false);

  const [form, setForm] = useState({
    app_id: "",
    app_secret: "",
    access_token: "",
    business_account_id: "",
    phone_number_id: "",
  });

  const call = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-config-manage", {
        body: { action, workspace_id: workspaceId, ...body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const data = await call("get_dedicated");
    if (data) {
      setWebhookUrl(data.webhook_url || "");
      if (data.config) {
        setConfig(data.config);
        setEnabled(true);
        setForm({
          app_id: data.config.app_id || "",
          app_secret: data.config.app_secret || "",
          access_token: data.config.access_token || "",
          business_account_id: data.config.business_account_id || "",
          phone_number_id: data.config.phone_number_id || "",
        });
      } else {
        setConfig(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (workspaceId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const handleSave = async () => {
    if (!form.app_id || !form.app_secret || !form.access_token || !form.business_account_id || !form.phone_number_id) {
      toast.error("Tous les champs sont requis");
      return;
    }
    const data = await call("save_dedicated", form);
    if (data?.ok) {
      toast.success("Configuration enregistrée", {
        description: data.subscription_error
          ? `Token validé. Abonnement webhook : ${data.subscription_error}`
          : "Token validé, webhook abonné.",
      });
      await load();
    }
  };

  const handleTest = async () => {
    const data = await call("test_dedicated");
    if (data?.ok) {
      toast.success("Connexion OK", {
        description: `${data.details?.verified_name || "Numéro"} · ${data.details?.display_phone_number || ""}`,
      });
      await load();
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("Régénérer le verify token ? Tu devras le re-coller dans Meta Developers.")) return;
    const data = await call("regenerate_verify_token");
    if (data?.ok) {
      toast.success("Nouveau verify token généré");
      await load();
    }
  };

  const handleSwitchToGlobal = async () => {
    if (!confirm("Supprimer la configuration de l'app Meta dédiée et revenir au mode global ?")) return;
    const data = await call("switch_to_global");
    if (data?.ok) {
      toast.success("App dédiée supprimée");
      setEnabled(false);
      setConfig(null);
      setForm({ app_id: "", app_secret: "", access_token: "", business_account_id: "", phone_number_id: "" });
    }
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copié`);
  };

  if (!workspaceId) return null;

  const statusKey = config?.status || "not_configured";
  const statusBadge = STATUS_LABEL[statusKey] || STATUS_LABEL.not_configured;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-[#25D366]" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              WhatsApp Cloud API — App Meta dédiée
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
              {config?.webhook_subscribed && (
                <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
                  Webhook OK
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Connecte ta propre application Meta WhatsApp à cet espace. Indépendant de la connexion Facebook globale (Pages, Lead Forms).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="wa-dedicated-toggle" className="text-xs text-muted-foreground">App dédiée</Label>
            <Switch
              id="wa-dedicated-toggle"
              checked={enabled}
              onCheckedChange={(v) => {
                if (!v && config) {
                  handleSwitchToGlobal();
                } else {
                  setEnabled(v);
                }
              }}
            />
          </div>
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              {/* Webhook + Verify token (read-only, always shown when enabled) */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3">
                <div>
                  <Label className="text-xs">Webhook URL (à coller dans Meta Developers → WhatsApp → Configuration)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copy(webhookUrl, "URL")}><Copy className="h-3 w-3" /></Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Verify Token (à coller dans Meta — identique côté Meta et CRM)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={config?.verify_token || "(généré à l'enregistrement)"} className="font-mono text-xs" />
                    {config && (
                      <>
                        <Button size="icon" variant="outline" onClick={() => copy(config.verify_token, "Verify Token")}><Copy className="h-3 w-3" /></Button>
                        <Button size="icon" variant="outline" onClick={handleRegenerate} disabled={busy === "regenerate_verify_token"}>
                          {busy === "regenerate_verify_token" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Meta App ID</Label>
                  <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} placeholder="123456789012345" />
                </div>
                <div>
                  <Label className="text-xs">Meta App Secret</Label>
                  <Input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} placeholder="abc123…" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Permanent Access Token (System User)</Label>
                  <Input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} placeholder="EAAG…" />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp Business Account ID (WABA)</Label>
                  <Input value={form.business_account_id} onChange={(e) => setForm({ ...form, business_account_id: e.target.value })} placeholder="123456789012345" />
                </div>
                <div>
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} placeholder="123456789012345" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleSave} disabled={busy === "save_dedicated"}>
                  {busy === "save_dedicated" && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                  Enregistrer & valider
                </Button>
                {config && (
                  <Button variant="outline" onClick={handleTest} disabled={busy === "test_dedicated"}>
                    {busy === "test_dedicated" ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <MessageCircle className="h-3 w-3 mr-2" />}
                    Tester la connexion
                  </Button>
                )}
                {config && (
                  <Button variant="destructive" size="sm" onClick={handleSwitchToGlobal}>
                    <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                  </Button>
                )}
                {config?.display_phone_number && (
                  <Badge variant="outline" className="font-mono ml-auto">
                    {config.verified_name || "Numéro"} · {config.display_phone_number}
                  </Badge>
                )}
              </div>

              {config?.status === "webhook_unverified" && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    L'abonnement automatique au webhook a échoué. Va dans <strong>Meta Developers → ton app → WhatsApp → Configuration</strong>, colle l'URL et le verify token ci-dessus, puis dans <strong>WhatsApp Manager → ton WABA</strong> abonne ton application.
                  </div>
                </div>
              )}

              {/* Help guide */}
              <Accordion type="single" collapsible className="border rounded-lg">
                <AccordionItem value="guide" className="border-0">
                  <AccordionTrigger className="px-4 text-sm font-semibold">Guide — connecter ta propre app Meta en 9 étapes</AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 text-sm space-y-3 text-muted-foreground">
                    <ol className="list-decimal space-y-2 ml-4">
                      <li>Crée une application Meta dans le Business Manager du client : <a className="text-primary underline inline-flex items-center gap-1" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps <ExternalLink className="h-3 w-3" /></a> (type "Business").</li>
                      <li>Dans l'app, ajoute le produit <strong>WhatsApp</strong>.</li>
                      <li>Connecte ton compte WhatsApp Business (WABA) et ajoute / sélectionne le numéro de production.</li>
                      <li>Récupère : <strong>App ID</strong> & <strong>App Secret</strong> (Paramètres → Base), <strong>WABA ID</strong> & <strong>Phone Number ID</strong> (WhatsApp → API Setup), puis crée un <strong>Permanent Access Token</strong> via un System User dans Business Manager (Paramètres business → Utilisateurs système → permissions <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code>).</li>
                      <li>Copie l'URL webhook ci-dessus.</li>
                      <li>Dans Meta Developers → WhatsApp → Configuration → Webhooks, colle l'URL.</li>
                      <li>Colle le verify token ci-dessus (le même des deux côtés).</li>
                      <li>Clique "Vérifier" côté Meta puis abonne aux champs <code>messages</code> et <code>message_template_status_update</code>. Dans WhatsApp Manager → ton WABA → Subscribe ton app.</li>
                      <li>Reviens ici, clique <strong>Tester la connexion</strong> puis envoie un message test depuis une conversation.</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
