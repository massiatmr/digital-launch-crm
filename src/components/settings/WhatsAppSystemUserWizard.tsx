import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Copy, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
  existingNumbers?: ExistingWhatsappNumber[];
}

interface DiscoveredNumber {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string;
  business_account_id: string;
  source?: "meta" | "known" | "manual";
}

interface ExistingWhatsappNumber {
  phone_number_id: string;
  display_phone_number: string;
  verified_name: string;
  business_account_id: string;
}

export function WhatsAppSystemUserWizard({ open, onOpenChange, onSuccess, existingNumbers = [] }: Props) {
  const workspaceId = useCurrentWorkspaceId();
  const [step, setStep] = useState(1);
  const [token, setToken] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [numbers, setNumbers] = useState<DiscoveredNumber[]>([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(1);
      setToken("");
      setNumbers([]);
      setSelectedPhoneId("");
      setManualPhoneId("");
      setManualWabaId("");
    }
  }, [open]);

  const copy = (text: string, label = "Copié") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const discoverNumbers = async () => {
    if (!token.trim()) return;
    setDiscovering(true);
    const t = token.trim();
    const GRAPH = "https://graph.facebook.com/v21.0";
    const found: DiscoveredNumber[] = [];
    const errors: string[] = [];

    const pushPhones = (waba: any) => {
      for (const phone of waba?.phone_numbers?.data || []) {
        if (found.some((f) => f.phone_number_id === phone.id)) continue;
        found.push({
          phone_number_id: phone.id,
          display_phone_number: phone.display_phone_number,
          verified_name: phone.verified_name || "",
          business_account_id: waba.id,
          source: "meta",
        });
      }
    };

    const fetchWabaPhones = async (wabaId: string) => {
      const r = await fetch(
        `${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${encodeURIComponent(t)}`,
      );
      const d = await r.json();
      if (r.ok) pushPhones({ id: wabaId, phone_numbers: { data: d.data || [] } });
    };

    try {
      // 1) List businesses the token belongs to (owned + client side)
      const bizRes = await fetch(
        `${GRAPH}/me/businesses?fields=id,name&access_token=${encodeURIComponent(t)}`,
      );
      const bizData = await bizRes.json();
      if (!bizRes.ok) {
        toast.error("Token invalide", { description: bizData?.error?.message || "Vérifie le token" });
        setDiscovering(false);
        return;
      }

      // 2) For each business, fetch owned + client WABAs
      for (const biz of bizData.data || []) {
        for (const kind of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
          const r = await fetch(
            `${GRAPH}/${biz.id}/${kind}?fields=id,name,phone_numbers{id,display_phone_number,verified_name}&access_token=${encodeURIComponent(t)}`,
          );
          const d = await r.json();
          if (!r.ok) {
            if (d?.error?.message) errors.push(`${biz.name} · ${kind}: ${d.error.message}`);
            continue;
          }
          for (const waba of d.data || []) {
            if (waba.phone_numbers?.data?.length) pushPhones(waba);
            else await fetchWabaPhones(waba.id); // fallback when nested expansion is blocked
          }
        }
      }

      // 3) Fallback: /me/assigned_whatsapp_business_accounts (System User direct assets)
      if (found.length === 0) {
        const r = await fetch(
          `${GRAPH}/me?fields=assigned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${encodeURIComponent(t)}`,
        );
        const d = await r.json();
        if (r.ok) {
          for (const waba of d?.assigned_whatsapp_business_accounts?.data || []) {
            if (waba.phone_numbers?.data?.length) pushPhones(waba);
            else await fetchWabaPhones(waba.id);
          }
        } else if (d?.error?.message) {
          errors.push(`assigned: ${d.error.message}`);
        }
      }

      if (found.length === 0 && existingNumbers.length > 0) {
        for (const n of existingNumbers) {
          if (!n.phone_number_id || !n.business_account_id) continue;
          if (found.some((f) => f.phone_number_id === n.phone_number_id)) continue;
          found.push({ ...n, source: "known" });
        }
        if (found.length > 0) {
          toast.info("Autodétection limitée par Meta", {
            description: "Le token System User ne liste pas les Business assets, donc j’utilise les numéros déjà visibles dans le CRM pour y attacher le token permanent.",
            duration: 8000,
          });
        }
      }

      if (found.length === 0) {
        toast.warning("Aucun numéro WhatsApp trouvé", {
          description:
            errors[0] ||
            "Meta ne permet pas toujours de lister les assets depuis un token System User. Colle le Phone Number ID + WABA ID manuellement à l’étape suivante.",
          duration: 8000,
        });
      }
      setNumbers(found);
      if (found.length === 1) setSelectedPhoneId(found[0].phone_number_id);
      setStep(5);
    } catch (e) {
      toast.error("Erreur réseau", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setDiscovering(false);
    }
  };

  const saveNumber = async (picked?: DiscoveredNumber) => {
    if (!picked) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-config-manage", {
      body: {
        action: "save",
        workspace_id: workspaceId,
        phone_number_id: picked.phone_number_id,
        business_account_id: picked.business_account_id,
        access_token: token.trim(),
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error("Échec de l'enregistrement", { description: data?.error || error?.message });
      return;
    }
    toast.success("Numéro enregistré", { description: "Active-le maintenant depuis la liste." });
    onOpenChange(false);
    onSuccess?.();
  };

  const save = async () => {
    const picked = numbers.find((n) => n.phone_number_id === selectedPhoneId);
    await saveNumber(picked);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configurer via System User (BM client)</SheetTitle>
          <SheetDescription>
            Crée un System User dans le Business Manager du client pour générer un token permanent — fonctionne en mode Dev sans App Review.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* STEP 1 */}
          <StepBlock
            n={1}
            active={step === 1}
            done={step > 1}
            title="Aller dans le Business Manager du client"
          >
            <p className="text-sm text-muted-foreground">
              Ouvre <code className="text-xs">business.facebook.com/settings/system-users</code> avec ton compte (tu dois être Admin du BM client).
            </p>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" /> Ouvrir Business Manager
              </a>
            </Button>
            <Button size="sm" onClick={() => setStep(2)}>Suivant <ChevronRight className="h-3 w-3" /></Button>
          </StepBlock>

          {/* STEP 2 */}
          <StepBlock
            n={2}
            active={step === 2}
            done={step > 2}
            title="Créer un System User"
          >
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Clique sur <strong>Add</strong> en haut</li>
              <li>Nom suggéré : <code className="text-xs">DigitalLaunch CRM</code></li>
              <li>Rôle : <strong>Admin</strong></li>
            </ul>
            <Button size="sm" onClick={() => setStep(3)}>Suivant <ChevronRight className="h-3 w-3" /></Button>
          </StepBlock>

          {/* STEP 3 */}
          <StepBlock
            n={3}
            active={step === 3}
            done={step > 3}
            title="Assigner la WABA + ton app au System User"
          >
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Clique sur <strong>Add Assets</strong></li>
              <li>Section <strong>WhatsApp Accounts</strong> → coche la WABA, donne <strong>Full Control</strong></li>
              <li>Section <strong>Apps</strong> → coche ton app Meta agence, donne <strong>Full Control</strong></li>
            </ul>
            <Button size="sm" onClick={() => setStep(4)}>Suivant <ChevronRight className="h-3 w-3" /></Button>
          </StepBlock>

          {/* STEP 4 */}
          <StepBlock
            n={4}
            active={step === 4}
            done={step > 4}
            title="Générer un token permanent"
          >
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Sur la fiche du System User → <strong>Generate New Token</strong></li>
              <li>Sélectionne <strong>ton app Meta</strong></li>
              <li>Expiration : <strong>Never</strong></li>
              <li>Permissions à cocher :
                <ul className="list-disc pl-5 mt-1">
                  <li><code className="text-xs">whatsapp_business_messaging</code></li>
                  <li><code className="text-xs">whatsapp_business_management</code></li>
                </ul>
              </li>
              <li>Copie le token (affiché 1 seule fois !)</li>
            </ul>
            <div className="space-y-2 pt-2">
              <Label className="text-xs">Colle le token ici</Label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG..."
                type="password"
                className="font-mono text-sm"
              />
              <Button size="sm" onClick={discoverNumbers} disabled={!token.trim() || discovering}>
                {discovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                Détecter les numéros
              </Button>
            </div>
          </StepBlock>

          {/* STEP 5 */}
          <StepBlock
            n={5}
            active={step === 5}
            done={false}
            title="Sélectionner le numéro à activer"
          >
            <div className="space-y-4">
              {numbers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun numéro listé par Meta avec ce token. Ce n'est pas bloquant : colle le Phone Number ID + WABA ID ci-dessous pour enregistrer le token permanent.
                </p>
              ) : (
                <div className="space-y-3">
                <Select value={selectedPhoneId} onValueChange={setSelectedPhoneId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un numéro" /></SelectTrigger>
                  <SelectContent>
                    {numbers.map((n) => (
                      <SelectItem key={n.phone_number_id} value={n.phone_number_id}>
                        {n.verified_name || "WhatsApp"} · {n.display_phone_number || n.phone_number_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {numbers.some((n) => n.source === "known") && (
                  <p className="text-xs text-muted-foreground">
                    Numéro repris depuis la connexion Meta existante : l'enregistrement remplacera son ancien token par le token System User.
                  </p>
                )}
                <Button onClick={save} disabled={!selectedPhoneId || saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Enregistrer ce numéro
                </Button>
                </div>
              )}

              <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
                <p className="text-xs font-medium">Fallback manuel</p>
                <p className="text-xs text-muted-foreground">
                  Utilise cette option si le numéro est visible dans Meta mais pas listé par le token System User.
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="ex: 123456789012345" className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">WhatsApp Business Account ID (WABA)</Label>
                  <Input value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="ex: 987654321098765" className="font-mono text-sm" />
                </div>
                <Button
                  variant="outline"
                  onClick={() => saveNumber({
                    phone_number_id: manualPhoneId.trim(),
                    business_account_id: manualWabaId.trim(),
                    display_phone_number: manualPhoneId.trim(),
                    verified_name: "WhatsApp",
                    source: "manual",
                  })}
                  disabled={!manualPhoneId.trim() || !manualWabaId.trim() || saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Enregistrer manuellement
                </Button>
              </div>
            </div>
          </StepBlock>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StepBlock({
  n, title, active, done, children,
}: { n: number; title: string; active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border p-4 space-y-3 transition ${active ? "border-primary bg-primary/5" : done ? "border-green-500/30 bg-green-500/5" : "opacity-60"}`}>
      <div className="flex items-center gap-2">
        <Badge variant={done ? "default" : active ? "secondary" : "outline"} className="h-6 w-6 rounded-full p-0 flex items-center justify-center">
          {done ? <CheckCircle2 className="h-3 w-3" /> : n}
        </Badge>
        <h4 className="font-semibold text-sm">{title}</h4>
      </div>
      {(active || done) && <div className="space-y-3 pl-8">{children}</div>}
    </div>
  );
}
