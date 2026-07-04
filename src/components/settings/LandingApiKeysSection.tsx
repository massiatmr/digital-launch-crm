import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";
import { Copy, Loader2, Plus, Trash2, Webhook, AlertCircle } from "lucide-react";

interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-lead`;

function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `wsk_${hex}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function LandingApiKeysSection() {
  const workspaceId = useCurrentWorkspaceId();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; key: string; label: string } | null>(null);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_api_keys")
      .select("id, label, key_prefix, created_at, last_used_at, revoked_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erreur de chargement", { description: error.message });
    setKeys((data as ApiKey[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${what} copié`);
  };

  const createKey = async () => {
    if (!workspaceId) return;
    setCreating(true);
    const key = generateKey();
    const hash = await sha256Hex(key);
    const { data, error } = await supabase
      .from("workspace_api_keys")
      .insert({
        workspace_id: workspaceId,
        label: label.trim() || "Landing page",
        key_hash: hash,
        key_prefix: key.slice(0, 12),
      })
      .select("id, label")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Échec création", { description: error?.message });
      return;
    }
    setRevealed({ id: data.id, key, label: data.label });
    setLabel("");
    load();
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Révoquer cette clé ? Les sites qui l'utilisent ne pourront plus envoyer de leads.")) return;
    const { error } = await supabase
      .from("workspace_api_keys")
      .update({ revoked_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast.error("Échec révocation", { description: error.message });
      return;
    }
    toast.success("Clé révoquée");
    load();
  };

  const sampleCode = (key: string) => `// Sur ta landing page (form submit)
await fetch("${INGEST_URL}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "${key}"
  },
  body: JSON.stringify({
    // === Contact (au moins 1 requis : name, email ou phone) ===
    name: "Jean Dupont",                // Nom complet du lead
    email: "jean@exemple.com",          // Email
    phone: "+33612345678",              // Téléphone (0X... FR auto-converti en +33)
    company_name: "Acme SARL",          // Entreprise (optionnel)

    // === Message / contexte ===
    message: "Je suis intéressé par vos services",

    // === Source du lead ===
    // Valeurs valides : "website" | "facebook" | "google_my_business"
    //                  | "organic_social" | "recommendation" | "whatsapp"
    //                  | "google_sheets" | "manual" | "other"
    source: "website",
    source_label: "landing-demenageur", // Libellé libre (nom de la page/campagne)

    // === Liens ===
    offer_slug: "demenageur",           // Slug de l'offre CRM (optionnel)
    page_url: window.location.href,     // URL de la landing

    // === UTM tracking (optionnel) ===
    utm: {
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "promo_oct",
      utm_content: "ad_variant_a",
      utm_term: "demenagement paris"
    },

    // === Champs personnalisés (optionnel) ===
    // Tout ce que tu mets ici sera ajouté aux notes du lead sous forme "Clé : valeur"
    fields: {
      budget: "5000 EUR",
      date_souhaitee: "15/11/2026",
      surface_m2: 80,
      ville_depart: "Paris",
      ville_arrivee: "Lyon"
    }
  })
});`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Webhook className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle>API Landing Pages</CardTitle>
            <CardDescription>
              Génère une clé API pour recevoir des leads depuis tes autres sites web. Chaque clé est isolée à cet espace.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline">URL d'envoi</Badge>
            <code className="text-xs font-mono break-all">{INGEST_URL}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(INGEST_URL, "URL")}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Méthode : <code>POST</code> · Header : <code>x-api-key: &lt;ta_cle&gt;</code>
            <br />
            <span className="font-semibold">Champs body JSON :</span> <code>name</code>, <code>email</code>, <code>phone</code>, <code>company_name</code>, <code>message</code>, <code>source</code>, <code>source_label</code>, <code>offer_slug</code>, <code>page_url</code>, <code>utm</code> (objet), <code>fields</code> (objet libre pour champs custom).
            <br />
            Au moins un contact requis : <code>name</code>, <code>email</code> ou <code>phone</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="label" className="text-xs">Nom de la clé (ex: site déménageur)</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Landing déménageur"
              maxLength={60}
            />
          </div>
          <Button onClick={createKey} disabled={creating || !workspaceId}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Générer une clé
          </Button>
        </div>

        {revealed && (
          <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Copie ta clé maintenant — elle ne sera plus visible après.</p>
                <p className="text-xs text-muted-foreground mt-1">{revealed.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono break-all bg-background border border-border rounded px-2 py-1.5">
                {revealed.key}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(revealed.key, "Clé")}>
                <Copy className="h-3 w-3" /> Copier
              </Button>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Voir un exemple d'intégration (fetch)</summary>
              <pre className="mt-2 p-3 rounded bg-background border border-border overflow-x-auto text-[11px]">
{sampleCode(revealed.key)}
              </pre>
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => copy(sampleCode(revealed.key), "Code exemple")}>
                <Copy className="h-3 w-3" /> Copier le code
              </Button>
            </details>
            <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>J'ai copié</Button>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Clés actives</h3>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
              Aucune clé pour le moment.
            </p>
          ) : (
            keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border bg-card/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{k.label}</span>
                    {k.revoked_at ? (
                      <Badge variant="destructive">Révoquée</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {k.key_prefix}…
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Créée le {new Date(k.created_at).toLocaleDateString("fr-FR")}
                    {k.last_used_at && ` · Dernière utilisation : ${new Date(k.last_used_at).toLocaleString("fr-FR")}`}
                  </div>
                </div>
                {!k.revoked_at && (
                  <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)}>
                    <Trash2 className="h-3 w-3" /> Révoquer
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
