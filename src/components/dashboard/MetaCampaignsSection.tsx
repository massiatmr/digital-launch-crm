import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { RefreshCw, AlertTriangle, Megaphone, ExternalLink, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMetaCampaigns } from "@/hooks/useMetaCampaigns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

type RangeKey = "inherit" | "7d" | "30d" | "90d" | "ytd";

interface Props {
  workspaceId: string | null;
  dateFrom: Date;
  dateTo: Date;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
}

export function MetaCampaignsSection({ workspaceId, dateFrom, dateTo }: Props) {
  const [includePaused, setIncludePaused] = useState(false);
  const [range, setRange] = useState<RangeKey>("inherit");
  const isMobile = useIsMobile();

  const { effectiveFrom, effectiveTo } = useMemo(() => {
    if (range === "inherit") return { effectiveFrom: dateFrom, effectiveTo: dateTo };
    const to = new Date();
    const from = new Date();
    if (range === "7d") from.setDate(to.getDate() - 7);
    else if (range === "30d") from.setDate(to.getDate() - 30);
    else if (range === "90d") from.setDate(to.getDate() - 90);
    else if (range === "ytd") { from.setMonth(0); from.setDate(1); }
    return { effectiveFrom: from, effectiveTo: to };
  }, [range, dateFrom, dateTo]);

  const { data, isLoading, isFetching, refetch, error } = useMetaCampaigns({
    workspaceId,
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
    includePaused,
  });

  const campaigns = data?.campaigns ?? [];
  const needsReconnect = data?.needs_reconnect ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="stat-icon-glow bg-gradient-to-br from-primary/20 to-primary/5">
            <Megaphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Campagnes Meta Ads</h2>
            <p className="text-xs text-muted-foreground">
              Leads, dépense et coût par lead sur la période sélectionnée
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">Période dashboard</SelectItem>
              <SelectItem value="7d">7 derniers jours</SelectItem>
              <SelectItem value="30d">30 derniers jours</SelectItem>
              <SelectItem value="90d">90 derniers jours</SelectItem>
              <SelectItem value="ytd">Depuis le 1er janvier</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch
              checked={includePaused}
              onCheckedChange={setIncludePaused}
              aria-label="Inclure désactivées"
            />
            Inclure désactivées
          </label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {needsReconnect.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <strong>Token expiré</strong> — Reconnectez Meta pour : {needsReconnect.join(", ")}.{" "}
            <Link to="/settings/integrations" className="underline">Reconnecter</Link>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Chargement des campagnes…
        </div>
      ) : error ? (
        <div className="text-sm text-destructive py-6">
          Erreur lors du chargement des campagnes Meta.
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <p>Aucune campagne Meta trouvée sur cette période.</p>
          <Link to="/settings/integrations" className="inline-flex items-center gap-1 mt-2 text-primary hover:underline text-xs">
            Connecter Meta <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div key={c.campaign_id} className="rounded-md border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{c.campaign_name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{c.page_name}</div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    c.status === "ACTIVE" ? "border-green-500/40 text-green-400" : "border-muted text-muted-foreground"
                  )}
                >
                  {c.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center items-end">
                <div className="col-span-1 rounded-md bg-primary/10 border border-primary/30 py-2">
                  <div className="text-[10px] text-primary/80 uppercase tracking-wide">CPL</div>
                  <div className="text-base font-mono font-bold text-primary">
                    {c.cpl_crm != null ? formatMoney(c.cpl_crm, c.currency) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Leads</div>
                  <div className="text-sm font-mono text-foreground">{c.leads_crm}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Dépense</div>
                  <div className="text-sm font-mono text-foreground">{formatMoney(c.spend, c.currency)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5">
                <TableHead className="text-xs">Page</TableHead>
                <TableHead className="text-xs">Campagne</TableHead>
                <TableHead className="text-xs">Statut</TableHead>
                <TableHead className="text-xs text-right text-primary">CPL</TableHead>
                <TableHead className="text-xs text-right">Leads</TableHead>
                <TableHead className="text-xs text-right">Dépense</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.campaign_id} className="border-white/5 hover:bg-white/[0.02]">
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{c.page_name}</TableCell>
                  <TableCell className="text-sm text-foreground max-w-[260px] truncate">{c.campaign_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        c.status === "ACTIVE" ? "border-green-500/40 text-green-400" : "border-muted text-muted-foreground"
                      )}
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-base font-bold text-primary">
                    {c.cpl_crm != null ? formatMoney(c.cpl_crm, c.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-foreground">{c.leads_crm}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-foreground">
                    {formatMoney(c.spend, c.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </motion.div>
  );
}
