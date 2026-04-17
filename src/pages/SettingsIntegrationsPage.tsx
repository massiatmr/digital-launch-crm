import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Loader2, Trash2, RefreshCw, ChevronDown, ChevronUp, Copy, ExternalLink, MessageCircle, CheckCircle2, Send, Power } from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsappConfig {
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  display_phone_number: string;
  verified_name: string;
  verify_token: string;
  webhook_subscribed: boolean;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_status: string;
}

interface MetaPage {
  id: string;
  page_id: string;
  page_name: string;
  is_active: boolean;
  subscribed: boolean;
  forms: Array<{ id: string; name: string; status?: string }>;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/facebook-webhook`;

export default function SettingsIntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadPages = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("facebook-pages-manage", {
      body: { action: "list" },
    });
    if (error) {
      toast.error("Erreur de chargement", { description: error.message });
    } else {
      setPages(data?.pages || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPages();
    const fb = params.get("fb");
    if (fb === "connected") {
      const count = params.get("count") || "0";
      toast.success(`Facebook connecté`, { description: `${count} page(s) importée(s)` });
      setParams({}, { replace: true });
    } else if (fb === "error") {
      toast.error("Connexion Facebook échouée", { description: params.get("reason") || "Erreur inconnue" });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectFacebook = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("facebook-auth-init", { body: {} });
    setConnecting(false);
    if (error || !data?.url) {
      toast.error("Impossible de démarrer la connexion", { description: error?.message });
      return;
    }
    window.location.href = data.url;
  };

  const callAction = async (action: string, page_id: string, successMsg?: string) => {
    setBusy(`${action}:${page_id}`);
    const { data, error } = await supabase.functions.invoke("facebook-pages-manage", {
      body: { action, page_id },
    });
    setBusy(null);
    if (error) {
      toast.error("Échec", { description: error.message });
      return null;
    }
    if (successMsg) toast.success(successMsg);
    await loadPages();
    return data;
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié`);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Intégrations</h1>
        <p className="text-muted-foreground mt-1">
          Connectez vos comptes externes pour automatiser la collecte de leads.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </div>
            <div>
              <CardTitle>Meta / Facebook Lead Ads</CardTitle>
              <CardDescription>
                Connectez vos pages Facebook pour recevoir automatiquement les leads des campagnes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={connectFacebook} disabled={connecting}>
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            Connecter mon compte Facebook
          </Button>

          {/* Pages list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Pages connectées ({pages.length})
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : pages.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
                Aucune page connectée pour le moment.
              </div>
            ) : (
              pages.map((p) => (
                <div key={p.id} className="border rounded-lg p-4 space-y-3 bg-card/50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{p.page_name || p.page_id}</span>
                        <Badge variant={p.subscribed ? "default" : "secondary"}>
                          {p.subscribed ? "Abonnée aux leads" : "Non abonnée"}
                        </Badge>
                        {!p.is_active && <Badge variant="outline">Désactivée</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">ID: {p.page_id}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!p.subscribed ? (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={busy === `subscribe:${p.page_id}`}
                          onClick={() => callAction("subscribe", p.page_id, "Abonnement effectué")}
                        >
                          {busy === `subscribe:${p.page_id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                          S'abonner
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `unsubscribe:${p.page_id}`}
                          onClick={() => callAction("unsubscribe", p.page_id, "Désabonné")}
                        >
                          Se désabonner
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `toggle_active:${p.page_id}`}
                        onClick={() => callAction("toggle_active", p.page_id)}
                      >
                        {p.is_active ? "Désactiver" : "Activer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `fetch_forms:${p.page_id}`}
                        onClick={() => {
                          callAction("fetch_forms", p.page_id, "Formulaires actualisés");
                          setExpanded((s) => ({ ...s, [p.id]: true }));
                        }}
                      >
                        {busy === `fetch_forms:${p.page_id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Formulaires
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === `delete:${p.page_id}`}
                        onClick={() => {
                          if (confirm(`Supprimer la page "${p.page_name}" ?`)) {
                            callAction("delete", p.page_id, "Page supprimée");
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Forms list */}
                  {p.forms && p.forms.length > 0 && (
                    <div>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      >
                        {expanded[p.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {p.forms.length} formulaire(s) en cache
                      </button>
                      {expanded[p.id] && (
                        <ul className="mt-2 space-y-1 pl-4">
                          {p.forms.map((f) => (
                            <li key={f.id} className="text-xs flex items-center gap-2">
                              <span className="font-mono text-muted-foreground">{f.id}</span>
                              <span>—</span>
                              <span>{f.name}</span>
                              {f.status && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {f.status}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Webhook config (manual) */}
          <div className="border-t pt-4 mt-6 space-y-3">
            <h3 className="text-sm font-semibold">Configuration manuelle du Webhook</h3>
            <p className="text-xs text-muted-foreground">
              À renseigner une seule fois dans votre App Meta (Webhooks → Page → leadgen).
            </p>
            <div className="space-y-2">
              <Label className="text-xs">Callback URL</Label>
              <div className="flex gap-2">
                <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copyText(WEBHOOK_URL, "URL")}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Verify Token</Label>
              <p className="text-xs text-muted-foreground">
                Géré côté serveur (secret <code className="text-foreground">FB_VERIFY_TOKEN</code>). Utilisez la même valeur dans Meta App Dashboard.
              </p>
            </div>
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ouvrir Meta for Developers <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
