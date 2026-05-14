import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Facebook, Instagram, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type StepState = "ok" | "ko" | "warn" | "pending";

interface Step {
  label: string;
  state: StepState;
  hint?: string;
}

interface ChannelBlock {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  steps: Step[];
}

interface Props {
  workspaceId: string | null;
  pages: Array<{
    id: string;
    page_id: string;
    page_name: string;
    subscribed: boolean;
    is_active: boolean;
    forms: Array<{ id: string; name: string }>;
    token_valid?: boolean;
  }>;
  formMappings: Array<{ form_id: string }>;
  waNumbers: Array<{
    phone_number_id: string;
    display_phone_number: string;
    verified_name: string;
    is_active: boolean;
    webhook_subscribed: boolean;
  }>;
  loading: boolean;
}

interface IgIdentity {
  page_id: string;
  instagram_business_account_id: string | null;
  instagram_username: string | null;
  is_subscribed_instagram: boolean;
  is_subscribed_messages: boolean;
}

function StateIcon({ state }: { state: StepState }) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (state === "ko") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />;
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />;
}

function ChannelCard({ block, defaultOpen = false }: { block: ChannelBlock; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const okCount = block.steps.filter((s) => s.state === "ok").length;
  const total = block.steps.length;
  const allOk = okCount === total && total > 0;
  const hasKo = block.steps.some((s) => s.state === "ko");

  return (
    <div
      className={cn(
        "rounded-lg border bg-card/50",
        allOk && "border-green-500/30 bg-green-500/5",
        hasKo && "border-destructive/40 bg-destructive/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className="shrink-0">{block.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{block.title}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                allOk && "border-green-500/40 text-green-500",
                hasKo && "border-destructive/40 text-destructive",
              )}
            >
              {okCount}/{total} étapes
            </Badge>
          </div>
          {block.subtitle && (
            <p className="text-xs text-muted-foreground truncate">{block.subtitle}</p>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-border/40">
          {block.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs pt-2">
              <StateIcon state={s.state} />
              <div className="min-w-0 flex-1">
                <div className={cn("font-medium", s.state === "ko" && "text-destructive")}>{s.label}</div>
                {s.hint && <div className="text-muted-foreground text-[11px] mt-0.5">{s.hint}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IntegrationStatusOverview({ workspaceId, pages, formMappings, waNumbers, loading }: Props) {
  const [identities, setIdentities] = useState<IgIdentity[]>([]);
  const [igLoading, setIgLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIgLoading(true);
      let q = supabase
        .from("meta_channel_identities")
        .select("page_id, instagram_business_account_id, instagram_username, is_subscribed_instagram, is_subscribed_messages");
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data } = await q;
      if (!cancelled) {
        setIdentities((data as IgIdentity[]) || []);
        setIgLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, pages.length]);

  const blocks: ChannelBlock[] = [];

  // ---- Meta OAuth global ----
  const metaConnected = pages.length > 0 || waNumbers.length > 0;
  blocks.push({
    key: "meta",
    icon: <div className="h-9 w-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center"><Facebook className="h-4 w-4 text-[#1877F2]" /></div>,
    title: "Connexion Meta (OAuth)",
    subtitle: metaConnected ? "Compte Meta autorisé" : "Aucun compte Meta lié à cet espace",
    steps: [
      {
        label: "Compte Meta autorisé",
        state: loading ? "pending" : metaConnected ? "ok" : "ko",
        hint: metaConnected ? undefined : "Clique sur « Connecter mon compte Meta » ci-dessous.",
      },
      {
        label: `${pages.length} page(s) Facebook détectée(s)`,
        state: loading ? "pending" : pages.length > 0 ? "ok" : "warn",
        hint: pages.length === 0 ? "Aucune page accessible avec ce compte Meta." : undefined,
      },
      {
        label: `${waNumbers.length} numéro(s) WhatsApp détecté(s)`,
        state: loading ? "pending" : waNumbers.length > 0 ? "ok" : "warn",
        hint: waNumbers.length === 0 ? "Aucun WhatsApp Business Account trouvé sur ce compte." : undefined,
      },
    ],
  });

  // ---- Per Facebook page (Messenger + Lead Ads + Instagram) ----
  for (const p of pages) {
    const ig = identities.find((i) => i.page_id === p.page_id);
    const formsCount = p.forms?.length ?? 0;
    const mappedForms = (p.forms ?? []).filter((f) => formMappings.some((m) => m.form_id === f.id)).length;

    // Facebook page block (Messenger + Lead Ads)
    blocks.push({
      key: `fb-${p.page_id}`,
      icon: <div className="h-9 w-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center"><Facebook className="h-4 w-4 text-[#1877F2]" /></div>,
      title: p.page_name || p.page_id,
      subtitle: "Page Facebook · Messenger + Lead Ads",
      steps: [
        {
          label: "Page liée à l'espace",
          state: "ok",
        },
        {
          label: "Token d'accès valide",
          state: p.token_valid === false ? "ko" : "ok",
          hint: p.token_valid === false ? "Reconnecte ton compte Meta pour rafraîchir le token." : undefined,
        },
        {
          label: "Page activée",
          state: p.is_active ? "ok" : "warn",
          hint: p.is_active ? undefined : "Réactive la page pour recevoir leads et messages.",
        },
        {
          label: "Abonnée aux Lead Ads (formulaires)",
          state: p.subscribed ? "ok" : "ko",
          hint: p.subscribed ? undefined : "Clique sur « S'abonner » dans la liste des pages.",
        },
        {
          label: "Messenger : webhook configuré",
          state: ig?.is_subscribed_messages ? "ok" : igLoading ? "pending" : "warn",
          hint: ig?.is_subscribed_messages
            ? undefined
            : "Reconnecte Meta puis vérifie l'abonnement webhook (champ « messages »).",
        },
        formsCount > 0
          ? {
              label: `${formsCount} formulaire(s) Lead Ads détecté(s)`,
              state: "ok" as StepState,
            }
          : {
              label: "Aucun formulaire Lead Ads",
              state: p.subscribed ? ("warn" as StepState) : ("pending" as StepState),
              hint: "Crée des formulaires dans Meta Ads Manager ou clique sur « Formulaires » pour rafraîchir.",
            },
        formsCount > 0
          ? {
              label: `${mappedForms}/${formsCount} formulaire(s) associés à une offre`,
              state: mappedForms === formsCount ? ("ok" as StepState) : ("warn" as StepState),
              hint: mappedForms < formsCount ? "Associe chaque formulaire à une offre pour le routage." : undefined,
            }
          : null,
      ].filter(Boolean) as Step[],
    });

    // Instagram block (only if linked or expected)
    blocks.push({
      key: `ig-${p.page_id}`,
      icon: <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]/80 flex items-center justify-center"><Instagram className="h-4 w-4 text-white" /></div>,
      title: ig?.instagram_username ? `@${ig.instagram_username}` : `Instagram (page ${p.page_name})`,
      subtitle: "DM Instagram via Meta",
      steps: [
        {
          label: "Compte Instagram Business lié à la page",
          state: igLoading ? "pending" : ig?.instagram_business_account_id ? "ok" : "ko",
          hint: ig?.instagram_business_account_id
            ? undefined
            : "Va dans Meta Business Suite → Paramètres → Comptes Instagram et lie ton IG à cette page Facebook, puis reconnecte Meta ici.",
        },
        {
          label: "Webhook Instagram abonné",
          state: igLoading ? "pending" : ig?.is_subscribed_instagram ? "ok" : "ko",
          hint: ig?.is_subscribed_instagram
            ? undefined
            : "Sur developers.facebook.com → ton app → Webhooks → Instagram, abonne le champ « messages » avec le verify token.",
        },
        {
          label: "Permissions IG accordées (instagram_manage_messages)",
          state: ig?.instagram_business_account_id ? "ok" : igLoading ? "pending" : "warn",
          hint: ig?.instagram_business_account_id
            ? undefined
            : "Lors de la reconnexion Meta, accepte bien les permissions Instagram Messaging.",
        },
      ],
    });
  }

  // ---- WhatsApp numbers ----
  if (waNumbers.length === 0) {
    blocks.push({
      key: "wa-empty",
      icon: <div className="h-9 w-9 rounded-lg bg-[#25D366]/10 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-[#25D366]" /></div>,
      title: "WhatsApp Business",
      subtitle: "Aucun numéro détecté",
      steps: [
        {
          label: "Numéro WhatsApp détecté",
          state: loading ? "pending" : "ko",
          hint: "Connecte un compte Meta avec un WhatsApp Business Account, ou ajoute un numéro manuellement plus bas.",
        },
      ],
    });
  } else {
    for (const n of waNumbers) {
      blocks.push({
        key: `wa-${n.phone_number_id}`,
        icon: <div className="h-9 w-9 rounded-lg bg-[#25D366]/10 flex items-center justify-center"><MessageCircle className="h-4 w-4 text-[#25D366]" /></div>,
        title: n.verified_name || n.display_phone_number,
        subtitle: `WhatsApp · ${n.display_phone_number}`,
        steps: [
          { label: "Numéro détecté", state: "ok" },
          {
            label: "Numéro activé pour l'envoi",
            state: n.is_active ? "ok" : "warn",
            hint: n.is_active ? undefined : "Clique sur « Activer » pour utiliser ce numéro pour les envois.",
          },
          {
            label: "Webhook WhatsApp abonné",
            state: n.webhook_subscribed ? "ok" : "ko",
            hint: n.webhook_subscribed
              ? undefined
              : "Active le numéro (ça abonne le webhook automatiquement) ou vérifie le verify token côté Meta.",
          },
        ],
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">État de tes intégrations</CardTitle>
        <CardDescription>
          Vue d'ensemble étape par étape. Si quelque chose ne fonctionne pas, regarde les blocs en rouge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {blocks.map((b) => (
          <ChannelCard
            key={b.key}
            block={b}
            defaultOpen={b.steps.some((s) => s.state === "ko")}
          />
        ))}
      </CardContent>
    </Card>
  );
}
