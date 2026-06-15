import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Facebook, Phone, CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PageOpt { page_id: string; name: string; taken: boolean; mine: boolean; }
interface AdAccountOpt {
  ad_account_id: string;
  account_id: string;
  name: string;
  currency: string;
  business_name: string;
  taken: boolean;
  mine: boolean;
}
interface WaOpt {
  phone_number_id: string;
  business_name: string;
  display_phone_number: string;
  verified_name: string;
  taken: boolean;
  mine: boolean;
}

interface Props {
  sessionId: string | null;
  workspaceName?: string;
  onClose: () => void;
  onAttached: () => void;
}

export function MetaOAuthPicker({ sessionId, workspaceName, onClose, onAttached }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pages, setPages] = useState<PageOpt[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountOpt[]>([]);
  const [waNumbers, setWaNumbers] = useState<WaOpt[]>([]);
  const [pickedPages, setPickedPages] = useState<Set<string>>(new Set());
  const [pickedAdAccounts, setPickedAdAccounts] = useState<Set<string>>(new Set());
  const [pickedWa, setPickedWa] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("meta-oauth-finalize", {
        body: { action: "list", session_id: sessionId },
      });
      setLoading(false);
      if (error || data?.error) {
        toast.error("Session expirée ou introuvable", { description: data?.error || error?.message });
        onClose();
        return;
      }
      setPages(data.pages || []);
      setAdAccounts(data.ad_accounts || []);
      setWaNumbers(data.wa_numbers || []);
      // Pre-select items not taken elsewhere
      setPickedPages(new Set((data.pages || []).filter((p: PageOpt) => !p.taken).map((p: PageOpt) => p.page_id)));
      setPickedAdAccounts(new Set((data.ad_accounts || []).filter((p: AdAccountOpt) => !p.taken).map((p: AdAccountOpt) => p.ad_account_id)));
      setPickedWa(new Set((data.wa_numbers || []).filter((p: WaOpt) => !p.taken).map((p: WaOpt) => p.phone_number_id)));
    })();
  }, [sessionId]);

  const togglePage = (id: string) => {
    setPickedPages((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAdAccount = (id: string) => {
    setPickedAdAccounts((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleWa = (id: string) => {
    setPickedWa((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleAttach = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("meta-oauth-finalize", {
      body: {
        action: "attach",
        session_id: sessionId,
        page_ids: Array.from(pickedPages),
        ad_account_ids: Array.from(pickedAdAccounts),
        phone_number_ids: Array.from(pickedWa),
      },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error("Échec de l'attachement", { description: data?.error || error?.message });
      return;
    }
    toast.success("Connexion Meta finalisée", {
      description: `${data.attached_pages} page(s) · ${data.attached_ad_accounts || 0} compte(s) pub · ${data.attached_wa} WhatsApp${
        data.skipped_pages || data.skipped_ad_accounts || data.skipped_wa
          ? ` · ${(data.skipped_pages || 0) + (data.skipped_ad_accounts || 0) + (data.skipped_wa || 0)} ignoré(s)`
          : ""
      }`,
    });
    onAttached();
  };

  const handleDiscard = async () => {
    if (!sessionId) { onClose(); return; }
    await supabase.functions.invoke("meta-oauth-finalize", {
      body: { action: "discard", session_id: sessionId },
    });
    onClose();
  };

  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => { if (!o) handleDiscard(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choisis ce que tu veux connecter</DialogTitle>
          <DialogDescription>
            {workspaceName ? `Espace : ${workspaceName}. ` : ""}
            Coche uniquement les Pages et numéros WhatsApp qui appartiennent à ce client. Les éléments déjà attribués à un autre espace sont désactivés.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Facebook className="h-4 w-4 text-[#1877F2]" />
                Pages Facebook ({pages.length})
              </h3>
              {pages.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune page détectée.</p>
              ) : (
                <ul className="space-y-1">
                  {pages.map((p) => (
                    <li
                      key={p.page_id}
                      className={`flex items-center gap-3 rounded-md border p-3 ${p.taken ? "opacity-50" : "hover:bg-muted/40"}`}
                    >
                      <Checkbox
                        checked={pickedPages.has(p.page_id)}
                        disabled={p.taken}
                        onCheckedChange={() => togglePage(p.page_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name || p.page_id}</div>
                        <div className="text-xs text-muted-foreground font-mono">{p.page_id}</div>
                      </div>
                      {p.mine && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Déjà ici
                        </Badge>
                      )}
                      {p.taken && <Badge variant="outline">Autre espace</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Comptes publicitaires ({adAccounts.length})
              </h3>
              {adAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun compte publicitaire détecté.</p>
              ) : (
                <ul className="space-y-1">
                  {adAccounts.map((a) => (
                    <li
                      key={a.ad_account_id}
                      className={`flex items-center gap-3 rounded-md border p-3 ${a.taken ? "opacity-50" : "hover:bg-muted/40"}`}
                    >
                      <Checkbox
                        checked={pickedAdAccounts.has(a.ad_account_id)}
                        disabled={a.taken}
                        onCheckedChange={() => toggleAdAccount(a.ad_account_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{a.name || a.account_id || a.ad_account_id}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">
                          {a.ad_account_id}{a.currency ? ` · ${a.currency}` : ""}{a.business_name ? ` · ${a.business_name}` : ""}
                        </div>
                      </div>
                      {a.mine && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Déjà ici
                        </Badge>
                      )}
                      {a.taken && <Badge variant="outline">Autre espace</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-500" />
                Numéros WhatsApp ({waNumbers.length})
              </h3>
              {waNumbers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun numéro WhatsApp Business détecté.</p>
              ) : (
                <ul className="space-y-1">
                  {waNumbers.map((p) => (
                    <li
                      key={p.phone_number_id}
                      className={`flex items-center gap-3 rounded-md border p-3 ${p.taken ? "opacity-50" : "hover:bg-muted/40"}`}
                    >
                      <Checkbox
                        checked={pickedWa.has(p.phone_number_id)}
                        disabled={p.taken}
                        onCheckedChange={() => toggleWa(p.phone_number_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {p.verified_name || p.business_name || "WhatsApp"} · {p.display_phone_number}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{p.phone_number_id}</div>
                      </div>
                      {p.mine && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Déjà ici
                        </Badge>
                      )}
                      {p.taken && <Badge variant="outline">Autre espace</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleDiscard} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={handleAttach}
            disabled={submitting || loading || (pickedPages.size === 0 && pickedAdAccounts.size === 0 && pickedWa.size === 0)}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Attacher la sélection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
