import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, AlertTriangle, CheckCircle2, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenWizard: () => void;
}

interface Usage {
  conversations: number;
  limit: number;
  pct: number;
  waba_count: number;
}

export function WhatsAppHelpDialog({ open, onOpenChange, onOpenWizard }: Props) {
  const workspaceId = useCurrentWorkspaceId();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase.functions
      .invoke("whatsapp-app-usage", { body: { workspace_id: workspaceId } })
      .then(({ data }) => {
        if (data?.ok) setUsage({
          conversations: data.conversations || 0,
          limit: data.limit || 1000,
          pct: data.pct || 0,
          waba_count: data.waba_count || 0,
        });
      })
      .finally(() => setLoading(false));
  }, [open, workspaceId]);

  const pctColor = usage && usage.pct > 80 ? "text-destructive" : usage && usage.pct > 50 ? "text-amber-500" : "text-green-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Guide WhatsApp Business
          </DialogTitle>
          <DialogDescription>
            Activer les numéros détectés via Meta OAuth, dépanner et suivre la consommation en mode Dev.
          </DialogDescription>
        </DialogHeader>

        {/* Usage counter */}
        <div className="rounded-lg border bg-card/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Consommation 24h (mode Dev)</span>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : usage ? (
              <span className={`text-sm font-mono ${pctColor}`}>
                {usage.conversations} / {usage.limit}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Indisponible</span>
            )}
          </div>
          <Progress value={usage?.pct || 0} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{usage?.waba_count || 0} WABA(s) connectée(s) (limite ~5 en Dev)</span>
            {usage && usage.pct > 80 && (
              <span className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" /> Passe en Live bientôt
              </span>
            )}
          </div>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="auto">
            <AccordionTrigger className="text-sm">Activation 1-clic (recommandé)</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>Quand tu connectes ton compte Meta agency (admin du BM client), les WABA détectées apparaissent dans la liste. Clique <strong>Activer</strong> à côté du numéro :</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Le système abonne la WABA à ton app Meta (<code className="text-xs">POST /waba_id/subscribed_apps</code>)</li>
                <li>Stocke le token agency + phone_number_id dans ce workspace</li>
                <li>Synchronise les templates Meta approuvés sur la WABA</li>
              </ol>
              <p>Marche uniquement si ton token contient <code className="text-xs">whatsapp_business_management</code>.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="manual">
            <AccordionTrigger className="text-sm">Activation manuelle (System User)</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>Si l'activation auto échoue (ex : <em>Permission refusée</em>), crée un System User permanent dans le BM client :</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>BM client → Users → System Users → Add</li>
                <li>Assigne la WABA + ton app comme assets</li>
                <li>Génère un token Never-expire avec <code className="text-xs">whatsapp_business_messaging</code> + <code className="text-xs">whatsapp_business_management</code></li>
                <li>Colle-le dans le wizard ci-dessous</li>
              </ol>
              <Button size="sm" onClick={() => { onOpenChange(false); onOpenWizard(); }}>
                Ouvrir le wizard System User
              </Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="limits">
            <AccordionTrigger className="text-sm">Limites mode Dev & passage en Live</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <ul className="list-disc pl-5 space-y-1">
                <li>~1000 conversations / 24h cumulées sur l'app</li>
                <li>~5 WABA actives simultanément maximum</li>
                <li>Au-delà → App Review + Business Verification obligatoires</li>
              </ul>
              <Button size="sm" variant="outline" asChild>
                <a href="https://developers.facebook.com/docs/development/release/app-review" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" /> Démarrer l'App Review
                </a>
              </Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="webhook">
            <AccordionTrigger className="text-sm">Webhook (géré automatiquement)</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Aucune action requise. L'abonnement webhook est fait automatiquement lors de l'activation.
              </p>
              <p>Les messages entrants sont routés par <code className="text-xs">phone_number_id</code> vers le bon workspace.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="trouble">
            <AccordionTrigger className="text-sm">Dépannage</AccordionTrigger>
            <AccordionContent className="space-y-3 text-sm text-muted-foreground">
              <div>
                <Badge variant="outline" className="mb-1">WABA déjà attribuée</Badge>
                <p>Le numéro est connecté dans un autre workspace. Supprime-le depuis cet espace d'abord.</p>
              </div>
              <div>
                <Badge variant="outline" className="mb-1">Permission refusée</Badge>
                <p>Ton token n'a pas <code className="text-xs">whatsapp_business_management</code>, ou tu n'es pas Admin du BM. Passe par le wizard System User.</p>
              </div>
              <div>
                <Badge variant="outline" className="mb-1">Numéro déjà sur l'app WhatsApp Business mobile</Badge>
                <p>Le client doit migrer vers Cloud API : désinstaller l'app mobile WA Business, ou faire un transfert depuis Meta Business Manager → WhatsApp Accounts.</p>
              </div>
              <div>
                <Badge variant="outline" className="mb-1">Template non envoyé</Badge>
                <p>Le 1er message doit utiliser un template approuvé. Vérifie le statut dans la liste de templates synchronisés.</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
