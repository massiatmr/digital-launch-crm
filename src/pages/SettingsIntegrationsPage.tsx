import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Facebook,
  Loader2,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  MessageCircle,
  CheckCircle2,
  Send,
  Power,
  Phone,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetaCapiSection } from "@/components/settings/MetaCapiSection";
import { LandingApiKeysSection } from "@/components/settings/LandingApiKeysSection";
import { IntegrationStatusOverview } from "@/components/settings/IntegrationStatusOverview";
import { MetaOAuthPicker } from "@/components/settings/MetaOAuthPicker";
import { useCurrentWorkspaceId, useWorkspaces } from "@/hooks/useWorkspaces";
import { useQueryClient } from "@tanstack/react-query";

interface WhatsappNumber {
  id: string;
  phone_number_id: string;
  business_account_id: string;
  display_phone_number: string;
  verified_name: string;
  verify_token: string;
  webhook_subscribed: boolean;
  is_active: boolean;
}

interface MetaPage {
  id: string;
  page_id: string;
  page_name: string;
  is_active: boolean;
  subscribed: boolean;
  forms: Array<{ id: string; name: string; status?: string }>;
  created_at: string;
  token_valid?: boolean;
}

interface FormOfferMapping {
  form_id: string;
  offer_id: string;
  page_id: string;
}

interface IgnoredForm {
  form_id: string;
  page_id: string;
}


interface OfferLite {
  id: string;
  name: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/facebook-webhook`;
const WA_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

export default function SettingsIntegrationsPage() {
  const [params, setParams] = useSearchParams();
  const workspaceId = useCurrentWorkspaceId();
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspaces();
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [formOfferMappings, setFormOfferMappings] = useState<FormOfferMapping[]>([]);
  const [ignoredForms, setIgnoredForms] = useState<IgnoredForm[]>([]);
  const [offers, setOffers] = useState<OfferLite[]>([]);

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // WhatsApp state (multi-number)
  const [waNumbers, setWaNumbers] = useState<WhatsappNumber[]>([]);
  const [waLoading, setWaLoading] = useState(true);
  const [waBusy, setWaBusy] = useState<string | null>(null);
  const [waTestTo, setWaTestTo] = useState("");
  const [waTestText, setWaTestText] = useState("");
  const [waTestTemplate, setWaTestTemplate] = useState("hello_world");
  const [waTestLang, setWaTestLang] = useState("en_US");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [pickerSession, setPickerSession] = useState<string | null>(null);

  const activeWa = waNumbers.find((n) => n.is_active) || null;

  const loadPages = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("facebook-pages-manage", {
      body: { action: "list", workspace_id: workspaceId },
    });
    if (error) {
      toast.error("Erreur de chargement", { description: error.message });
    } else {
      setPages(data?.pages || []);
      setFormOfferMappings(data?.form_offer_mappings || []);
      setIgnoredForms(data?.ignored_forms || []);
    }
    setLoading(false);
  };

  const toggleIgnoreForm = async (form_id: string, form_name: string, page_id: string, ignored: boolean) => {
    setBusy(`ignore:${form_id}`);
    const { error } = await supabase.functions.invoke("facebook-pages-manage", {
      body: {
        action: "toggle_ignore_form",
        workspace_id: workspaceId,
        form_id,
        form_name,
        page_id,
        ignored,
      },
    });
    setBusy(null);
    if (error) {
      toast.error("Échec", { description: error.message });
      return;
    }
    toast.success(ignored ? "Formulaire ignoré — aucun lead ne sera collecté" : "Collecte réactivée pour ce formulaire");
    setIgnoredForms((prev) => {
      const filtered = prev.filter((m) => m.form_id !== form_id);
      return ignored ? [...filtered, { form_id, page_id }] : filtered;
    });

    setLoading(false);
  };

  const loadOffers = async () => {
    let q = supabase.from("offers").select("id, name").is("deleted_at", null).order("name");
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data } = await q;
    setOffers((data as OfferLite[]) || []);
  };

  const setFormOffer = async (form_id: string, form_name: string, page_id: string, offer_id: string | null) => {
    setBusy(`map:${form_id}`);
    const { error } = await supabase.functions.invoke("facebook-pages-manage", {
      body: {
        action: "set_form_offer",
        workspace_id: workspaceId,
        form_id,
        form_name,
        page_id,
        offer_id,
      },
    });
    setBusy(null);
    if (error) {
      toast.error("Échec mappage", { description: error.message });
      return;
    }
    toast.success(offer_id ? "Formulaire associé à l'offre" : "Association supprimée");
    setFormOfferMappings((prev) => {
      const filtered = prev.filter((m) => m.form_id !== form_id);
      return offer_id ? [...filtered, { form_id, offer_id, page_id }] : filtered;
    });
  };

  const loadWaNumbers = async () => {
    setWaLoading(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-config-manage", {
      body: { action: "list_numbers", workspace_id: workspaceId },
    });
    if (!error) setWaNumbers(data?.numbers || []);
    setWaLoading(false);
  };

  const callWa = async (action: string, body: Record<string, unknown> = {}, successMsg?: string) => {
    setWaBusy(`${action}:${body.phone_number_id ?? ""}`);
    const { data, error } = await supabase.functions.invoke("whatsapp-config-manage", {
      body: { action, workspace_id: workspaceId, ...body },
    });
    setWaBusy(null);
    if (error || data?.error) {
      // Tente d'extraire le vrai message d'erreur (Meta Graph API ou autre)
      let description = data?.error || error?.message || "Erreur inconnue";
      let metaDetail: string | undefined;
      try {
        // supabase-js v2: en cas de non-2xx, le body est dans error.context (Response)
        const ctx: any = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          const parsed = await ctx.json();
          if (parsed?.error) description = parsed.error;
          metaDetail = parsed?.details?.error?.message;
        } else if (data?.details?.error?.message) {
          metaDetail = data.details.error.message;
        }
      } catch (_e) {
        // ignore
      }
      toast.error("Échec WhatsApp", {
        description: metaDetail ? `${description} — ${metaDetail}` : description,
        duration: 10000,
      });
      return null;
    }
    if (successMsg) toast.success(successMsg);
    await loadWaNumbers();
    return data;
  };

  useEffect(() => {
    loadPages();
    loadOffers();
    loadWaNumbers();
    const fb = params.get("fb");
    if (fb === "pick") {
      const session = params.get("session");
      if (session) {
        setPickerSession(session);
        toast.info("Choisis quoi connecter", {
          description: `${params.get("pages") || 0} page(s) · ${params.get("wa") || 0} numéro(s) WhatsApp détectés.`,
        });
      }
      setParams({}, { replace: true });
    } else if (fb === "connected") {
      // Legacy callback fallback
      toast.success("Meta connecté");
      setParams({}, { replace: true });
    } else if (fb === "error") {
      toast.error("Connexion Meta échouée", { description: params.get("reason") || "Erreur inconnue" });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const connectMeta = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("facebook-auth-init", {
      body: { workspace_id: workspaceId },
    });
    setConnecting(false);
    if (error || !data?.url) {
      toast.error("Impossible de démarrer la connexion", { description: error?.message });
      return;
    }
    // Ouvrir dans une popup centrée plutôt que rediriger toute la page
    const w = 600;
    const h = 750;
    const y = window.top!.outerHeight / 2 + window.top!.screenY - h / 2;
    const x = window.top!.outerWidth / 2 + window.top!.screenX - w / 2;
    const popup = window.open(
      data.url,
      "meta-oauth",
      `width=${w},height=${h},left=${x},top=${y}`,
    );
    if (!popup) {
      toast.error("Popup bloquée", { description: "Autorisez les popups pour ce site puis réessayez." });
      return;
    }
    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          loadPages();
          loadWaNumbers();
          return;
        }
        // Une fois le callback redirige sur notre origine, on peut lire l'URL
        const href = popup.location.href;
        if (href.includes(window.location.origin) && href.includes("fb=")) {
          const url = new URL(href);
          const search = url.search;
          clearInterval(timer);
          popup.close();
          // Re-route locale pour déclencher le useEffect (toast + reload)
          window.location.href = `/settings/integrations${search}`;
        }
      } catch {
        // cross-origin pendant l'auth Meta : on ignore
      }
    }, 500);
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
    if (action === "subscribe") {
      if (data?.subscribed) {
        toast.success(successMsg || "Abonnement effectué");
      } else {
        toast.error("Abonnement Meta non confirmé", {
          description: "La page est visible mais l’app Meta n’est pas encore abonnée aux lead forms.",
        });
      }
    } else if (action === "unsubscribe") {
      if (data?.subscribed === false) {
        toast.success(successMsg || "Désabonné");
      } else {
        toast.error("Désabonnement non confirmé");
      }
    } else if (successMsg) {
      toast.success(successMsg);
    }
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
          Connectez votre compte Meta en 1 clic — pages Facebook + WhatsApp détectés automatiquement.
        </p>
        {currentWorkspace && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Espace configuré :</span>
            <span className="font-semibold">{currentWorkspace.company_name}</span>
          </div>
        )}
      </div>

      <IntegrationStatusOverview
        workspaceId={workspaceId}
        pages={pages}
        formMappings={formOfferMappings}
        waNumbers={waNumbers}
        loading={loading || waLoading}
      />

      {/* ============== META / FACEBOOK (one-click) ============== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </div>
            <div className="flex-1">
              <CardTitle>Connexion Meta (Facebook + WhatsApp)</CardTitle>
              <CardDescription>
                1 seul clic : pages Facebook Lead Ads + numéros WhatsApp Business détectés automatiquement.
                Aucune App Meta à créer.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={connectMeta} disabled={connecting} size="lg">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            Connecter mon compte Meta
          </Button>

          <p className="text-xs text-muted-foreground">
            Tu seras redirigé vers Facebook pour autoriser l'accès à tes pages et tes numéros WhatsApp.
            Tout est stocké uniquement pour cet espace de travail.
          </p>

          {/* Pages list */}
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Pages Facebook connectées ({pages.length})
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
                        {p.token_valid === false && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Token expiré · Reconnecter Meta
                          </Badge>
                        )}
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

                  {p.forms && p.forms.length > 0 && (
                    <div>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      >
                        {expanded[p.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {p.forms.length} formulaire(s) — associer une offre
                      </button>
                      {expanded[p.id] && (
                        <div className="mt-3 space-y-2">
                          {p.forms.map((f) => {
                            const mapping = formOfferMappings.find((m) => m.form_id === f.id);
                            const currentOfferId = mapping?.offer_id || "";
                            return (
                              <div
                                key={f.id}
                                className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/30 border"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{f.name}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-2">
                                    {f.id}
                                    {f.status && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        {f.status}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Select
                                    value={currentOfferId || "__none__"}
                                    onValueChange={(v) =>
                                      setFormOffer(f.id, f.name, p.page_id, v === "__none__" ? null : v)
                                    }
                                    disabled={busy === `map:${f.id}`}
                                  >
                                    <SelectTrigger className="w-[220px] h-8 text-xs">
                                      <SelectValue placeholder="Aucune offre" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">— Aucune —</SelectItem>
                                      {offers.map((o) => (
                                        <SelectItem key={o.id} value={o.id}>
                                          {o.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {busy === `map:${f.id}` && (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {offers.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Aucune offre dans cet espace. Créez d'abord des offres dans la section Offres.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ============== WHATSAPP NUMBERS ============== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-[#25D366]" />
            </div>
            <div className="flex-1">
              <CardTitle>Numéros WhatsApp Business</CardTitle>
              <CardDescription>
                Détectés via ta connexion Meta. Choisis le numéro à utiliser pour les envois.
              </CardDescription>
            </div>
            {activeWa && <Badge variant="default">Actif : {activeWa.display_phone_number}</Badge>}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const res = await callWa("resync", {}, undefined);
                if (res?.ok) {
                  toast.success("Numéros resynchronisés", {
                    description: `${res.added} ajouté(s) · ${res.updated} mis à jour · ${res.removed} supprimé(s)`,
                  });
                }
              }}
              disabled={waBusy?.startsWith("resync") ?? false}
            >
              {waBusy?.startsWith("resync") ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Resynchroniser
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {waLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : waNumbers.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg space-y-2">
              <p>Aucun numéro WhatsApp détecté.</p>
              <p className="text-xs">
                Connecte d'abord ton compte Meta ci-dessus.
                <br />
                Si ton compte a un WhatsApp Business Account, les numéros apparaîtront ici automatiquement.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {waNumbers.map((n) => (
                <div
                  key={n.id}
                  className={`border rounded-lg p-4 space-y-2 ${n.is_active ? "border-primary bg-primary/5" : "bg-card/50"}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Phone className="h-4 w-4 text-[#25D366]" />
                        <span className="font-semibold">{n.verified_name || "Numéro WhatsApp"}</span>
                        <Badge variant="outline" className="font-mono">{n.display_phone_number}</Badge>
                        {n.is_active && <Badge variant="default">Actif</Badge>}
                        {n.webhook_subscribed && (
                          <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Webhook
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Phone ID: {n.phone_number_id}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.is_active && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            const res = await callWa(
                              "activate_number",
                              { phone_number_id: n.phone_number_id },
                            );
                            if (res) {
                              const synced = res.templates_synced ?? 0;
                              toast.success("Numéro activé", {
                                description: `Webhook abonné · ${synced} template(s) synchronisés${res.templates_error ? ` · Templates : ${res.templates_error}` : ""}`,
                                duration: 8000,
                              });
                              queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
                              queryClient.invalidateQueries({ queryKey: ["wa-inbox"] });
                            }
                          }}
                          disabled={waBusy?.startsWith("activate_number")}
                        >
                          {waBusy === `activate_number:${n.phone_number_id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Power className="h-3 w-3" />
                          )}
                          Activer
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={waBusy === `delete:${n.phone_number_id}`}
                        onClick={() => {
                          if (confirm(`Supprimer le numéro ${n.display_phone_number} ?`)) {
                            callWa(
                              "delete",
                              { phone_number_id: n.phone_number_id },
                              "Numéro supprimé",
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual add (fallback if auto-detect fails) */}
          <div className="border rounded-lg p-4 space-y-3">
            <button
              type="button"
              className="flex items-center justify-between w-full text-sm font-semibold"
              onClick={() => setShowManualAdd((s) => !s)}
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Ajouter un numéro WhatsApp manuellement
              </span>
              {showManualAdd ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showManualAdd && (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  À utiliser si l'auto-détection ne trouve pas tes numéros (compte test, WABA externe…).
                  Récupère ces 3 valeurs sur <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">business.facebook.com</a> → WhatsApp Accounts → API Setup.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="ex: 123456789012345" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">WhatsApp Business Account ID (WABA)</Label>
                  <Input value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="ex: 987654321098765" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Access Token (permanent system-user)</Label>
                  <Input value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="EAAG..." type="password" className="font-mono text-sm" />
                </div>
                <Button
                  onClick={async () => {
                    const r = await callWa(
                      "save",
                      {
                        phone_number_id: manualPhoneId.trim(),
                        business_account_id: manualWabaId.trim(),
                        access_token: manualToken.trim(),
                      },
                      "Numéro ajouté",
                    );
                    if (r) {
                      setManualPhoneId("");
                      setManualWabaId("");
                      setManualToken("");
                      setShowManualAdd(false);
                    }
                  }}
                  disabled={!manualPhoneId || !manualWabaId || !manualToken || waBusy?.startsWith("save")}
                >
                  {waBusy?.startsWith("save") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter le numéro
                </Button>
              </div>
            )}
          </div>

          {/* Test send (only if active number exists) */}
          {activeWa && (
            <div className="border rounded-lg p-4 space-y-3">
              <Label className="text-sm font-semibold">Envoyer un message test depuis {activeWa.display_phone_number}</Label>
              <p className="text-xs text-muted-foreground">
                <strong>Template</strong> = obligatoire pour 1er contact (doit être approuvé sur ton WABA).
                <strong> Texte libre</strong> = uniquement si le destinataire t'a écrit dans les 24 dernières heures.
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
                      { to: waTestTo, template_name: waTestTemplate, language_code: waTestLang },
                      "Template envoyé",
                    )
                  }
                  disabled={waBusy?.startsWith("test_send") || !waTestTo || !waTestTemplate}
                  variant="outline"
                >
                  {waBusy?.startsWith("test_send") ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Envoyer template
                </Button>
                <Button
                  onClick={() =>
                    callWa("test_send", { to: waTestTo, text: waTestText }, "Message envoyé")
                  }
                  disabled={waBusy?.startsWith("test_send") || !waTestTo || !waTestText}
                >
                  <Send className="h-4 w-4" />
                  Envoyer texte
                </Button>
              </div>
            </div>
          )}

          {/* Webhook info (admin reference) */}
          {activeWa && (
            <details className="border rounded-lg p-4 space-y-3">
              <summary className="text-sm font-semibold cursor-pointer">
                Référence webhook (avancé)
              </summary>
              <div className="space-y-3 mt-3">
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
                    <Input value={activeWa.verify_token} readOnly className="font-mono text-xs" />
                    <Button size="icon" variant="outline" onClick={() => copyText(activeWa.verify_token, "Token")}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ============== ADMIN WEBHOOK REFERENCE ============== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Référence webhook Facebook (avancé)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Callback URL</Label>
            <div className="flex gap-2">
              <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => copyText(WEBHOOK_URL, "URL")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ouvrir Meta for Developers <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      <MetaCapiSection />

      <LandingApiKeysSection />

      <MetaOAuthPicker
        sessionId={pickerSession}
        workspaceName={currentWorkspace?.company_name}
        onClose={() => setPickerSession(null)}
        onAttached={() => {
          setPickerSession(null);
          loadPages();
          loadWaNumbers();
        }}
      />
    </div>
  );
}
