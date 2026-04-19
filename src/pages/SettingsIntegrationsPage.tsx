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
import { useCurrentWorkspaceId, useWorkspaces } from "@/hooks/useWorkspaces";

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
const WA_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

export default function SettingsIntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const workspaceId = useCurrentWorkspaceId();
  const { currentWorkspace } = useWorkspaces();
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // WhatsApp state
  const [waConfig, setWaConfig] = useState<WhatsappConfig | null>(null);
  const [waLoading, setWaLoading] = useState(true);
  const [waBusy, setWaBusy] = useState<string | null>(null);
  const [waShowGuide, setWaShowGuide] = useState(false);
  const [waForm, setWaForm] = useState({ phone_number_id: "", business_account_id: "", access_token: "" });
  const [waTestTo, setWaTestTo] = useState("");
  const [waTestText, setWaTestText] = useState("");
  const [waTestTemplate, setWaTestTemplate] = useState("");
  const [waTestLang, setWaTestLang] = useState("en_US");

  const loadPages = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("facebook-pages-manage", {
      body: { action: "list", workspace_id: workspaceId },
    });
    if (error) {
      toast.error("Erreur de chargement", { description: error.message });
    } else {
      setPages(data?.pages || []);
    }
    setLoading(false);
  };

  const loadWaConfig = async () => {
    setWaLoading(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-config-manage", {
      body: { action: "get", workspace_id: workspaceId },
    });
    if (!error) setWaConfig(data?.config || null);
    setWaLoading(false);
  };

  const callWa = async (action: string, body: Record<string, unknown> = {}, successMsg?: string) => {
    setWaBusy(action);
    const { data, error } = await supabase.functions.invoke("whatsapp-config-manage", {
      body: { action, workspace_id: workspaceId, ...body },
    });
    setWaBusy(null);
    if (error || data?.error) {
      toast.error("Échec WhatsApp", { description: data?.error || error?.message });
      return null;
    }
    if (successMsg) toast.success(successMsg);
    await loadWaConfig();
    return data;
  };

  const saveWa = async () => {
    if (!waForm.phone_number_id || !waForm.business_account_id || !waForm.access_token) {
      toast.error("Remplis les 3 champs");
      return;
    }
    const r = await callWa("save", waForm, "Configuration WhatsApp sauvegardée");
    if (r) setWaForm({ phone_number_id: "", business_account_id: "", access_token: "" });
  };

  useEffect(() => {
    loadPages();
    loadWaConfig();
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
  }, [workspaceId]);

  const connectFacebook = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("facebook-auth-init", {
      body: { workspace_id: workspaceId },
    });
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
      body: { action, page_id, workspace_id: workspaceId },
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
        {currentWorkspace && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Espace configuré :</span>
            <span className="font-semibold">{currentWorkspace.company_name}</span>
          </div>
        )}
      </div>

      {/* ============== WHATSAPP CLOUD API ============== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-[#25D366]" />
            </div>
            <div className="flex-1">
              <CardTitle>WhatsApp Cloud API</CardTitle>
              <CardDescription>
                Envoi automatique des relances et réception des réponses des leads.
              </CardDescription>
            </div>
            {waConfig && (
              <Badge variant={waConfig.is_active ? "default" : "secondary"}>
                {waConfig.is_active ? "Actif" : "Inactif"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {waLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : waConfig ? (
            <>
              {/* Connected state */}
              <div className="border rounded-lg p-4 bg-card/50 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-semibold">{waConfig.verified_name || "Numéro WhatsApp"}</span>
                  <Badge variant="outline" className="font-mono">{waConfig.display_phone_number}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Phone ID: {waConfig.phone_number_id} · WABA: {waConfig.business_account_id}
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {!waConfig.webhook_subscribed ? (
                    <Button
                      size="sm"
                      onClick={() => callWa("subscribe_webhook", {}, "Webhook abonné")}
                      disabled={waBusy === "subscribe_webhook"}
                    >
                      {waBusy === "subscribe_webhook" && <Loader2 className="h-3 w-3 animate-spin" />}
                      S'abonner aux webhooks
                    </Button>
                  ) : (
                    <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Webhook abonné
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => callWa("toggle_active", {}, "État modifié")}
                    disabled={waBusy === "toggle_active"}
                  >
                    <Power className="h-3 w-3" /> {waConfig.is_active ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm("Supprimer la configuration WhatsApp ?")) callWa("delete", {}, "Supprimé");
                    }}
                    disabled={waBusy === "delete"}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Test send */}
              <div className="border rounded-lg p-4 space-y-3">
                <Label className="text-sm font-semibold">Envoyer un message test</Label>
                <p className="text-xs text-muted-foreground">
                  <strong>Template</strong> = obligatoire pour 1er contact (doit être approuvé par Meta sur ton WABA).
                  <br />
                  <strong>Texte libre</strong> = ne fonctionne que si le destinataire t'a écrit dans les dernières 24h.
                  <br />
                  ⚠️ <code>hello_world</code> ne marche que pour les numéros de test publics Meta — sur ton vrai numéro, utilise un template approuvé.
                </p>
                <Input
                  placeholder="Destinataire : 33612345678 (sans + ni espaces)"
                  value={waTestTo}
                  onChange={(e) => setWaTestTo(e.target.value)}
                  className="font-mono text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Nom du template"
                    value={waTestTemplate}
                    onChange={(e) => setWaTestTemplate(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Input
                    placeholder="Langue (en_US, fr, fr_FR…)"
                    value={waTestLang}
                    onChange={(e) => setWaTestLang(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <Input
                  placeholder="Ou texte libre (fenêtre 24h uniquement)"
                  value={waTestText}
                  onChange={(e) => setWaTestText(e.target.value)}
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      callWa(
                        "test_send",
                        {
                          to: waTestTo,
                          template_name: waTestTemplate,
                          language_code: waTestLang,
                        },
                        "Template envoyé",
                      )
                    }
                    disabled={waBusy === "test_send" || !waTestTo || !waTestTemplate}
                    variant="outline"
                  >
                    {waBusy === "test_send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Envoyer template
                  </Button>
                  <Button
                    onClick={() =>
                      callWa("test_send", { to: waTestTo, text: waTestText }, "Message envoyé")
                    }
                    disabled={waBusy === "test_send" || !waTestTo || !waTestText}
                  >
                    {waBusy === "test_send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Envoyer texte
                  </Button>
                </div>
              </div>

              {/* Webhook info */}
              <div className="border rounded-lg p-4 space-y-3">
                <Label className="text-sm font-semibold">Configuration Webhook (Meta App Dashboard)</Label>
                <p className="text-xs text-muted-foreground">
                  Dans Meta App → WhatsApp → Configuration → Webhook, colle ces deux valeurs et abonne-toi au champ <code>messages</code>.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Callback URL</Label>
                  <div className="flex gap-2">
                    <Input value={WA_WEBHOOK_URL} readOnly className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copyText(WA_WEBHOOK_URL, "URL")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Verify Token</Label>
                  <div className="flex gap-2">
                    <Input value={waConfig.verify_token} readOnly className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copyText(waConfig.verify_token, "Token")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Setup form */}
              <button
                onClick={() => setWaShowGuide((s) => !s)}
                className="text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors"
              >
                {waShowGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Procédure pas-à-pas pour récupérer les 3 valeurs
              </button>
              {waShowGuide && (
                <div className="border rounded-lg p-4 bg-muted/30 text-sm space-y-2">
                  <p><strong>1.</strong> Va sur <a href="https://business.facebook.com/wa/manage" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Meta Business Suite → WhatsApp Manager <ExternalLink className="h-3 w-3" /></a> et crée/sélectionne ton compte WhatsApp Business (WABA).</p>
                  <p><strong>2.</strong> Ajoute un numéro de téléphone et vérifie-le par SMS/appel.</p>
                  <p><strong>3.</strong> Note le <code>Phone number ID</code> (sous le numéro) et le <code>WhatsApp Business Account ID</code> (en haut).</p>
                  <p><strong>4.</strong> Va dans <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Business Settings → Utilisateurs Système <ExternalLink className="h-3 w-3" /></a>, crée un System User <em>Admin</em>, attribue-lui ton WABA avec le rôle <em>Manage</em>, puis génère un <strong>token permanent</strong> avec les permissions <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code>.</p>
                  <p><strong>5.</strong> Colle les 3 valeurs ci-dessous et clique <em>Tester & Sauvegarder</em>.</p>
                </div>
              )}

              <div className="space-y-3 border rounded-lg p-4">
                <div className="space-y-2">
                  <Label className="text-xs">Phone number ID</Label>
                  <Input
                    placeholder="ex: 123456789012345"
                    value={waForm.phone_number_id}
                    onChange={(e) => setWaForm({ ...waForm, phone_number_id: e.target.value.trim() })}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">WhatsApp Business Account ID (WABA)</Label>
                  <Input
                    placeholder="ex: 987654321098765"
                    value={waForm.business_account_id}
                    onChange={(e) => setWaForm({ ...waForm, business_account_id: e.target.value.trim() })}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Access Token (System User permanent)</Label>
                  <Input
                    type="password"
                    placeholder="EAAG..."
                    value={waForm.access_token}
                    onChange={(e) => setWaForm({ ...waForm, access_token: e.target.value.trim() })}
                    className="font-mono"
                  />
                </div>
                <Button onClick={saveWa} disabled={waBusy === "save"} className="w-full">
                  {waBusy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Tester & Sauvegarder
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============== META / FACEBOOK ============== */}
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
