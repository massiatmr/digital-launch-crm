import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Megaphone, Send, Trash2, X, Loader2, CheckCircle2, XCircle, Clock, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  useCampaigns, useCampaign, useCampaignRecipients,
  useCreateCampaign, useLaunchCampaign, useCancelCampaign, useDeleteCampaign,
  previewAudience, type Campaign, type CampaignStatus,
} from "@/hooks/useCampaigns";
import { useActiveWorkspaceTemplates } from "@/hooks/useWhatsAppTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspaceId } from "@/hooks/useWorkspaces";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost", "ghost"];
const SCORES = ["hot", "warm", "cold"];
const SOURCES = ["facebook", "messenger", "instagram", "website", "manual", "organic", "referral", "gmb", "other"];

function statusBadge(s: CampaignStatus) {
  const map: Record<CampaignStatus, { label: string; cls: string; icon: any }> = {
    draft: { label: "Brouillon", cls: "bg-muted text-muted-foreground", icon: Clock },
    scheduled: { label: "Programmée", cls: "bg-blue-500/15 text-blue-300", icon: Clock },
    running: { label: "En cours", cls: "bg-primary/15 text-primary", icon: Loader2 },
    completed: { label: "Terminée", cls: "bg-green-500/15 text-green-300", icon: CheckCircle2 },
    cancelled: { label: "Annulée", cls: "bg-muted text-muted-foreground", icon: X },
    failed: { label: "Échec", cls: "bg-destructive/15 text-destructive", icon: XCircle },
  };
  const c = map[s];
  const Ico = c.icon;
  return (
    <Badge variant="outline" className={`${c.cls} border-0 gap-1`}>
      <Ico className={`h-3 w-3 ${s === "running" ? "animate-spin" : ""}`} />
      {c.label}
    </Badge>
  );
}

export default function CampaignsPage() {
  const { id } = useParams();
  if (id) return <CampaignDetail id={id} />;
  return <CampaignsList />;
}

function CampaignsList() {
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading } = useCampaigns();
  const [builderOpen, setBuilderOpen] = useState(false);
  const del = useDeleteCampaign();

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Megaphone className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Campagnes WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Envoi en masse de templates à plusieurs contacts</p>
          </div>
        </div>
        <Button onClick={() => setBuilderOpen(true)} className="gradient-primary">
          <Plus className="h-4 w-4 mr-2" /> Nouvelle campagne
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement…</div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">Aucune campagne pour le moment.</p>
          <Button onClick={() => setBuilderOpen(true)} variant="outline">Créer ma première campagne</Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <Card key={c.id} className="p-4 hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => navigate(`/campaigns/${c.id}`)}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{c.name}</h3>
                    {statusBadge(c.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.template_name ? `Template : ${c.template_name}` : "Aucun template"} ·{" "}
                    {c.total_recipients} destinataires · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: fr })}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-400">{c.sent_count} envoyés</span>
                  {c.failed_count > 0 && <span className="text-destructive">{c.failed_count} échecs</span>}
                  <Button
                    size="icon" variant="ghost"
                    onClick={(e) => { e.stopPropagation(); if (confirm("Supprimer cette campagne ?")) del.mutate(c.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CampaignBuilder open={builderOpen} onOpenChange={setBuilderOpen} />
    </div>
  );
}

/* ===================== BUILDER WIZARD ===================== */

function CampaignBuilder({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateCampaign();
  const launch = useLaunchCampaign();
  const workspaceId = useCurrentWorkspaceId();
  const { data: templates = [] } = useActiveWorkspaceTemplates();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [audienceMode, setAudienceMode] = useState<"manual" | "filter">("manual");
  const [filter, setFilter] = useState<any>({ entity: "leads", workspace_id: workspaceId });
  const [audiencePreview, setAudiencePreview] = useState<{ total: number; sample: any[] } | null>(null);
  const [manualSelected, setManualSelected] = useState<Map<string, { kind: "lead" | "client"; id: string; name: string; phone: string }>>(new Map());
  const [manualPool, setManualPool] = useState<any[]>([]);
  const [manualSearch, setManualSearch] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [varMapping, setVarMapping] = useState<Record<string, string>>({});
  const [scheduledAt, setScheduledAt] = useState<string>("");

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const [offers, setOffers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!open || !workspaceId) return;
    supabase.from("offers").select("id, name").eq("workspace_id", workspaceId).is("deleted_at", null).order("name")
      .then(({ data }) => setOffers((data as any) || []));
  }, [open, workspaceId]);

  useEffect(() => {
    setFilter((f: any) => ({ ...f, workspace_id: workspaceId }));
  }, [workspaceId]);

  // Charge le pool en mode manuel
  useEffect(() => {
    if (!open || audienceMode !== "manual") return;
    (async () => {
      let q = supabase.from("leads").select("id, name, phone, status, score").is("deleted_at", null).not("phone", "is", null).neq("phone", "").order("created_at", { ascending: false }).limit(200);
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data } = await q;
      setManualPool((data ?? []).map((l: any) => ({ kind: "lead", ...l })));
    })();
  }, [open, audienceMode, workspaceId]);

  // Refresh audience preview en mode filtre
  useEffect(() => {
    if (!open || audienceMode !== "filter") return;
    const t = setTimeout(async () => {
      try {
        const res = await previewAudience(filter);
        setAudiencePreview(res);
      } catch (e: any) {
        setAudiencePreview({ total: 0, sample: [] });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [filter, audienceMode, open]);

  const filteredManualPool = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    if (!q) return manualPool;
    return manualPool.filter((l) => (l.name || "").toLowerCase().includes(q) || (l.phone || "").includes(q));
  }, [manualPool, manualSearch]);

  const totalSelected = audienceMode === "manual" ? manualSelected.size : audiencePreview?.total ?? 0;

  const toggleManual = (l: any) => {
    const next = new Map(manualSelected);
    if (next.has(l.id)) next.delete(l.id);
    else next.set(l.id, { kind: "lead", id: l.id, name: l.name, phone: l.phone });
    setManualSelected(next);
  };

  const selectAllVisible = () => {
    const next = new Map(manualSelected);
    for (const l of filteredManualPool) next.set(l.id, { kind: "lead", id: l.id, name: l.name, phone: l.phone });
    setManualSelected(next);
  };

  // Variables count → init mapping
  useEffect(() => {
    if (!selectedTemplate) return;
    const map: Record<string, string> = {};
    for (let i = 1; i <= (selectedTemplate.variables_count || 0); i++) {
      map[String(i)] = varMapping[String(i)] || (i === 1 ? "name" : "static:");
    }
    setVarMapping(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const reset = () => {
    setStep(1); setName(""); setAudienceMode("manual"); setFilter({ entity: "leads", workspace_id: workspaceId });
    setManualSelected(new Map()); setTemplateId(""); setVarMapping({}); setScheduledAt(""); setAudiencePreview(null);
  };

  const canStep1 = name.trim().length > 1 && totalSelected > 0;
  const canStep2 = !!selectedTemplate;

  const onLaunch = async () => {
    try {
      const campaign = await create.mutateAsync({
        name,
        template_id: selectedTemplate!.id,
        template_name: selectedTemplate!.name,
        template_language: selectedTemplate!.language,
        template_variables_mapping: varMapping,
        audience_mode: audienceMode,
        audience_filter: audienceMode === "filter" ? filter : {},
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      const manualRecipients = audienceMode === "manual"
        ? Array.from(manualSelected.values()).map((r) => ({ kind: r.kind, id: r.id }))
        : undefined;
      await launch.mutateAsync({ campaign_id: campaign.id, manual_recipients: manualRecipients });
      onOpenChange(false);
      reset();
      navigate(`/campaigns/${campaign.id}`);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Nouvelle campagne WhatsApp · Étape {step}/3</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {step === 1 && (
            <div className="space-y-4 pb-4">
              <div>
                <Label>Nom de la campagne</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Relance prospects froids — Juin" />
              </div>

              <Tabs value={audienceMode} onValueChange={(v) => setAudienceMode(v as any)}>
                <TabsList>
                  <TabsTrigger value="manual">Sélection manuelle</TabsTrigger>
                  <TabsTrigger value="filter">Ciblage par filtres</TabsTrigger>
                </TabsList>

                <TabsContent value="manual" className="space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Rechercher par nom ou téléphone…" className="pl-9" value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} />
                    </div>
                    <Button variant="outline" size="sm" onClick={selectAllVisible}>Tout sélectionner ({filteredManualPool.length})</Button>
                    <Button variant="ghost" size="sm" onClick={() => setManualSelected(new Map())}>Vider</Button>
                  </div>
                  <Card className="max-h-[300px] overflow-y-auto divide-y">
                    {filteredManualPool.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">Aucun lead avec téléphone</p>
                    ) : filteredManualPool.map((l) => (
                      <label key={l.id} className="flex items-center gap-3 p-2.5 hover:bg-accent/40 cursor-pointer">
                        <Checkbox checked={manualSelected.has(l.id)} onCheckedChange={() => toggleManual(l)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{l.name}</p>
                          <p className="text-xs text-muted-foreground">{l.phone} · {l.status} · {l.score}</p>
                        </div>
                      </label>
                    ))}
                  </Card>
                  <p className="text-sm font-medium text-primary">{manualSelected.size} contact(s) sélectionné(s)</p>
                </TabsContent>

                <TabsContent value="filter" className="space-y-3 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Type</Label>
                      <Select value={filter.entity || "leads"} onValueChange={(v) => setFilter({ ...filter, entity: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="leads">Leads uniquement</SelectItem>
                          <SelectItem value="clients">Clients uniquement</SelectItem>
                          <SelectItem value="both">Les deux</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Sans réponse depuis (jours)</Label>
                      <Input type="number" min={0} placeholder="0 = ignoré"
                        value={filter.no_reply_days || ""} onChange={(e) => setFilter({ ...filter, no_reply_days: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                  </div>

                  {(filter.entity === "leads" || filter.entity === "both" || !filter.entity) && (
                    <>
                      <ChipMulti label="Statut lead" options={LEAD_STATUSES} value={filter.lead_statuses || []} onChange={(v) => setFilter({ ...filter, lead_statuses: v })} />
                      {offers.length > 0 && (
                        <ChipMulti label="Offre" options={offers.map((o) => o.id)} labels={Object.fromEntries(offers.map((o) => [o.id, o.name]))} value={filter.offer_ids || []} onChange={(v) => setFilter({ ...filter, offer_ids: v })} />
                      )}
                      <ChipMulti label="Score" options={SCORES} value={filter.scores || []} onChange={(v) => setFilter({ ...filter, scores: v })} />
                      <ChipMulti label="Source" options={SOURCES} value={filter.sources || []} onChange={(v) => setFilter({ ...filter, sources: v })} />
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={!!filter.never_contacted} onCheckedChange={(v) => setFilter({ ...filter, never_contacted: v })} />
                        Uniquement ceux jamais contactés
                      </label>
                    </>
                  )}

                  <Card className="p-3 bg-primary/5 border-primary/20">
                    <p className="text-sm">
                      <span className="font-bold text-primary text-lg">{audiencePreview?.total ?? "—"}</span> destinataires correspondent à ces critères
                    </p>
                    {audiencePreview?.sample?.length ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Aperçu : {audiencePreview.sample.slice(0, 5).map((s) => s.name).filter(Boolean).join(", ")}…
                      </p>
                    ) : null}
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 pb-4">
              <div>
                <Label>Template WhatsApp approuvé</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.filter((t) => t.status === "APPROVED" || t.status === "approved").length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">
                        Aucun template approuvé. Crée-en un dans Réglages → WhatsApp.
                      </div>
                    )}
                    {templates.filter((t) => t.status === "APPROVED" || t.status === "approved").map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.language}) — {t.variables_count} variable(s)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <Card className="p-4 bg-muted/30">
                  <Label className="text-xs uppercase text-muted-foreground">Aperçu</Label>
                  <p className="whitespace-pre-wrap text-sm mt-2">{selectedTemplate.body_text}</p>
                </Card>
              )}

              {selectedTemplate && selectedTemplate.variables_count > 0 && (
                <div className="space-y-2">
                  <Label>Variables — champs du contact à utiliser</Label>
                  {Object.keys(varMapping).map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-sm w-12 text-muted-foreground">{`{{${k}}}`}</span>
                      <Select value={varMapping[k]} onValueChange={(v) => setVarMapping({ ...varMapping, [k]: v })}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Nom du contact</SelectItem>
                          <SelectItem value="company_name">Nom de société</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="phone">Téléphone</SelectItem>
                          <SelectItem value="static:">Texte fixe (à éditer)</SelectItem>
                        </SelectContent>
                      </Select>
                      {varMapping[k]?.startsWith("static:") && (
                        <Input
                          className="flex-1"
                          placeholder="Valeur"
                          value={varMapping[k].slice(7)}
                          onChange={(e) => setVarMapping({ ...varMapping, [k]: "static:" + e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label>Programmer l'envoi (optionnel)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Laisser vide pour envoyer immédiatement.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 pb-4">
              <Card className="p-4 space-y-2">
                <Row k="Nom" v={name} />
                <Row k="Audience" v={`${audienceMode === "manual" ? "Sélection manuelle" : "Filtres"} · ${totalSelected} destinataires`} />
                <Row k="Template" v={`${selectedTemplate?.name} (${selectedTemplate?.language})`} />
                <Row k="Envoi" v={scheduledAt ? `Programmé pour ${new Date(scheduledAt).toLocaleString("fr-FR")}` : "Immédiat"} />
              </Card>
              <Card className="p-3 bg-amber-500/10 border-amber-500/30 text-sm">
                ⚠️ Une campagne WhatsApp envoie des templates HSM payants Meta. Vérifie la liste avant lancement.
              </Card>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t pt-4 flex sm:justify-between gap-2">
          <Button variant="ghost" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}>
            {step > 1 ? "Précédent" : "Annuler"}
          </Button>
          {step < 3 ? (
            <Button
              disabled={(step === 1 && !canStep1) || (step === 2 && !canStep2)}
              onClick={() => setStep(step + 1)}
              className="gradient-primary"
            >
              Continuer
            </Button>
          ) : (
            <Button onClick={onLaunch} disabled={create.isPending || launch.isPending} className="gradient-primary">
              {launch.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {scheduledAt ? "Programmer" : "Lancer maintenant"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right">{v}</span></div>;
}

function ChipMulti({ label, options, value, onChange, labels }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string> }) {
  const toggle = (o: string) => {
    if (value.includes(o)) onChange(value.filter((x) => x !== o));
    else onChange([...value, o]);
  };
  return (
    <div>
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${
              value.includes(o) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"
            }`}
          >
            {labels?.[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ===================== DETAIL ===================== */

function CampaignDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: campaign } = useCampaign(id);
  const { data: recipients = [] } = useCampaignRecipients(id);
  const cancel = useCancelCampaign();

  if (!campaign) return <div className="container py-6">Chargement…</div>;

  const counts = {
    pending: recipients.filter((r) => r.status === "pending").length,
    sent: recipients.filter((r) => r.status === "sent" || r.status === "delivered" || r.status === "read").length,
    failed: recipients.filter((r) => r.status === "failed").length,
    skipped: recipients.filter((r) => r.status === "skipped").length,
  };

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-3">{campaign.name} {statusBadge(campaign.status)}</h1>
          <p className="text-sm text-muted-foreground">Template : {campaign.template_name} · {campaign.total_recipients} destinataires</p>
        </div>
        {(campaign.status === "running" || campaign.status === "scheduled") && (
          <Button variant="outline" onClick={() => cancel.mutate(campaign.id)}><X className="h-4 w-4 mr-2" />Annuler</Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="En attente" value={counts.pending} color="text-amber-400" />
        <StatCard label="Envoyés" value={counts.sent} color="text-green-400" />
        <StatCard label="Échecs" value={counts.failed} color="text-destructive" />
        <StatCard label="Ignorés" value={counts.skipped} color="text-muted-foreground" />
      </div>

      {campaign.error_message && (
        <Card className="p-3 bg-destructive/10 border-destructive/30 text-sm text-destructive">
          {campaign.error_message}
        </Card>
      )}

      <Card>
        <div className="p-3 border-b text-sm font-medium">Destinataires</div>
        <div className="max-h-[500px] overflow-y-auto divide-y">
          {recipients.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun destinataire</p>
          ) : recipients.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.contact_name || r.phone}</p>
                <p className="text-xs text-muted-foreground">{r.phone}{r.error_message ? ` · ${r.error_message}` : ""}</p>
              </div>
              <RecipientBadge status={r.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  );
}

function RecipientBadge({ status }: { status: string }) {
  const m: Record<string, { l: string; c: string }> = {
    pending: { l: "En attente", c: "bg-amber-500/15 text-amber-300" },
    sent: { l: "Envoyé", c: "bg-green-500/15 text-green-300" },
    delivered: { l: "Délivré", c: "bg-green-500/15 text-green-300" },
    read: { l: "Lu", c: "bg-emerald-500/15 text-emerald-300" },
    failed: { l: "Échec", c: "bg-destructive/15 text-destructive" },
    skipped: { l: "Ignoré", c: "bg-muted text-muted-foreground" },
  };
  const x = m[status] || m.pending;
  return <Badge variant="outline" className={`${x.c} border-0`}>{x.l}</Badge>;
}
