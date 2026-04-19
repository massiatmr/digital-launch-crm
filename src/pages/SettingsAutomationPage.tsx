import { useEffect, useMemo, useState } from 'react';
import { useFollowupSettings, useUpdateFollowupSettings } from '@/hooks/useFollowupTasks';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import { useCronStatus, useDueTasksCount, useRunFollowupNow } from '@/hooks/useFollowupCron';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Bot, FlaskConical, Workflow, FileText, Sparkles, Settings as SettingsIcon, AlertTriangle, CheckCircle2, Zap, PlayCircle, Clock, Filter, Phone, RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: 'facebook', label: 'Facebook Lead Ads' },
  { value: 'website', label: 'Site web' },
  { value: 'google_sheets', label: 'Google Sheets' },
  { value: 'organic_social', label: 'Réseaux organic' },
  { value: 'recommendation', label: 'Recommendation' },
  { value: 'google_my_business', label: 'Google My Business' },
  { value: 'manual', label: 'Manuel' },
  { value: 'other', label: 'Autre' },
];
import { STEPS, StepCard } from '@/components/automation/StepCard';
import { StepEditorSheet } from '@/components/automation/StepEditorSheet';
import { TemplatesManager } from '@/components/automation/TemplatesManager';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function SettingsAutomationPage() {
  const { data: settings, isLoading } = useFollowupSettings();
  const update = useUpdateFollowupSettings();
  const { data: templates = [] } = useWhatsAppTemplates();
  const { data: cronStatus } = useCronStatus();
  const { data: dueCount = 0 } = useDueTasksCount();
  const runNow = useRunFollowupNow();

  const [form, setForm] = useState<any>(null);
  const [editingStep, setEditingStep] = useState<typeof STEPS[number] | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (settings && !form) setForm(settings); }, [settings, form]);

  const set = (patch: Record<string, any>) => { setForm({ ...form, ...patch }); setDirty(true); };

  const save = () => {
    update.mutate({
      is_enabled: form.is_enabled,
      dry_run: form.dry_run,
      ai_instructions: form.ai_instructions,
      ai_examples: form.ai_examples,
      initial_delay_minutes: form.initial_delay_minutes,
      followup_1_delay_hours: form.followup_1_delay_hours,
      followup_2_delay_hours: form.followup_2_delay_hours,
      last_followup_delay_hours: form.last_followup_delay_hours,
      template_initial_id: form.template_initial_id,
      template_followup_1_id: form.template_followup_1_id,
      template_followup_2_id: form.template_followup_2_id,
      template_last_followup_id: form.template_last_followup_id,
      trigger_sources: form.trigger_sources,
      trigger_only_new_status: form.trigger_only_new_status,
      inactivity_threshold_hours: form.inactivity_threshold_hours,
      enable_call_escalation: form.enable_call_escalation,
      enable_24h_template_switch: form.enable_24h_template_switch,
      template_reactivation_id: form.template_reactivation_id,
    } as any, { onSuccess: () => setDirty(false) });
  };

  const toggleSource = (src: string) => {
    const current: string[] = form.trigger_sources || [];
    const next = current.includes(src) ? current.filter((s) => s !== src) : [...current, src];
    set({ trigger_sources: next });
  };

  const stats = useMemo(() => {
    if (!form) return { mapped: 0, total: STEPS.length };
    const mapped = STEPS.filter((s) => form[s.key]).length;
    return { mapped, total: STEPS.length };
  }, [form]);

  if (isLoading || !form) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-5xl space-y-6 pb-24">
      {form.dry_run && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-yellow-300">
            <FlaskConical className="h-4 w-4" />
            <span><strong>Mode test actif</strong> — aucun message WhatsApp réel n'est envoyé aux leads.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => set({ dry_run: false })} className="shrink-0 border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/10">
            Passer en LIVE
          </Button>
        </div>
      )}
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> Automatisation WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Séquence de relances déclenchée à chaque nouveau lead.
          </p>
        </div>

        {/* STATUS BADGES */}
        <div className="flex flex-wrap gap-2">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
            form.dry_run
              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          )}>
            <FlaskConical className="h-3.5 w-3.5" />
            {form.dry_run ? 'Mode test' : 'Mode LIVE'}
          </span>
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
            form.is_enabled
              ? 'bg-green-500/10 text-green-400 border-green-500/30'
              : 'bg-muted text-muted-foreground border-border'
          )}>
            {form.is_enabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {form.is_enabled ? 'Auto active' : 'Auto désactivée'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-muted/30">
            {stats.mapped}/{stats.total} étapes configurées
          </span>
        </div>
      </header>

      {/* TABS */}
      <Tabs defaultValue="sequence" className="w-full">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="sequence" className="gap-1.5"><Workflow className="h-4 w-4" />Séquence</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><FileText className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5"><Sparkles className="h-4 w-4" />Brief IA</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><SettingsIcon className="h-4 w-4" />Réglages</TabsTrigger>
        </TabsList>

        {/* TAB: SÉQUENCE */}
        <TabsContent value="sequence" className="mt-6 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-heading text-base">Parcours du lead</h2>
                <p className="text-xs text-muted-foreground">Clique une étape pour modifier son délai et son template.</p>
              </div>
            </div>

            {/* Start indicator */}
            <div className="flex flex-col items-center mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium">
                🆕 Nouveau lead créé
              </span>
              <div className="h-4 w-px bg-border mt-1" />
            </div>

            <div className="space-y-0">
              {STEPS.map((step, i) => (
                <StepCard
                  key={step.key}
                  step={step}
                  index={i}
                  template={templates.find((t) => t.id === form[step.key]) || null}
                  delay={form[step.delayKey] || 0}
                  isLast={i === STEPS.length - 1}
                  dryRun={form.dry_run}
                  onClick={() => setEditingStep(step)}
                />
              ))}
            </div>

            {/* End indicator */}
            <div className="flex flex-col items-center mt-2">
              <div className="h-4 w-px bg-border" />
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs">
                💤 Lead marqué froid si aucune réponse
              </span>
            </div>
          </div>

          {templates.length === 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-400">Aucun template disponible</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Va dans l'onglet <strong>Templates</strong> pour synchroniser depuis Meta ou en créer un.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB: TEMPLATES */}
        <TabsContent value="templates" className="mt-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <TemplatesManager />
          </div>
        </TabsContent>

        {/* TAB: BRIEF IA */}
        <TabsContent value="ai" className="mt-6 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-heading text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Personnalité de l'IA
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Utilisé pour générer les variables des templates et les messages texte libre.
              </p>
            </div>
            <div>
              <Label htmlFor="ai_instructions">Instructions (ton, style, longueur)</Label>
              <Textarea id="ai_instructions" rows={6} className="mt-1"
                value={form.ai_instructions}
                onChange={(e) => set({ ai_instructions: e.target.value })}
                placeholder="Tu es un commercial humain et bienveillant…" />
            </div>
            <div>
              <Label htmlFor="ai_examples">Exemples de messages (style à imiter)</Label>
              <Textarea id="ai_examples" rows={8} className="mt-1"
                value={form.ai_examples}
                onChange={(e) => set({ ai_examples: e.target.value })}
                placeholder={`Initial:\n"Salut Marie 👋 J'ai vu ta demande pour [offre]. Quel est ton délai ?"\n\nRelance 1:\n"…"`} />
              <p className="text-xs text-muted-foreground mt-1">Plus tu donnes d'exemples, plus l'IA imite ton style.</p>
            </div>
          </div>
        </TabsContent>

        {/* TAB: RÉGLAGES */}
        <TabsContent value="settings" className="mt-6 space-y-4">
          <div className={cn(
            'rounded-xl border p-5',
            form.dry_run ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-red-500/40 bg-red-500/5'
          )}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <FlaskConical className={cn('h-5 w-5 mt-0.5', form.dry_run ? 'text-yellow-400' : 'text-red-400')} />
                <div>
                  <Label className="text-base">Mode test (dry-run)</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.dry_run
                      ? 'ON — Aucun envoi réel. Tout est loggé pour vérification.'
                      : '⚠️ OFF — Les messages partent pour de vrai aux leads.'}
                  </p>
                </div>
              </div>
              <Switch checked={form.dry_run} onCheckedChange={(v) => set({ dry_run: v })} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-base">Activer l'automatisation</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Crée automatiquement la séquence à chaque nouveau lead.
                </p>
              </div>
              <Switch checked={form.is_enabled} onCheckedChange={(v) => set({ is_enabled: v })} />
            </div>
          </div>

          {/* CONDITIONS DE DÉCLENCHEMENT */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-heading text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" /> Conditions de déclenchement
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Quels leads doivent recevoir la séquence automatique ?
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 pt-2 border-t border-border">
              <div>
                <Label className="text-sm">Uniquement leads à l'étape "Nouveau"</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Si désactivé, un lead créé directement en "Contacté" recevra aussi la séquence.
                </p>
              </div>
              <Switch
                checked={form.trigger_only_new_status ?? true}
                onCheckedChange={(v) => set({ trigger_only_new_status: v })}
              />
            </div>

            <div className="pt-2 border-t border-border">
              <Label className="text-sm">Sources de leads autorisées</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Seuls les leads provenant de ces sources déclencheront la séquence.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {LEAD_SOURCES.map((src) => {
                  const checked = (form.trigger_sources || []).includes(src.value);
                  return (
                    <label
                      key={src.value}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                        checked ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30'
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleSource(src.value)} />
                      <span className="text-sm">{src.label}</span>
                    </label>
                  );
                })}
              </div>
              {(form.trigger_sources || []).length === 0 && (
                <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Aucune source sélectionnée → l'automatisation ne se déclenchera jamais.
                </p>
              )}
            </div>
          </div>

          {/* RELANCES HUMAINES & FENÊTRE 24H */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-heading text-base flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> Relances humaines & fenêtre 24h
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Détecte les conversations inactives et escalade vers un appel quand nécessaire.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <Label className="text-sm flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Délai d'inactivité avant relance
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Si le lead a répondu puis ne dit plus rien pendant ce temps, une tâche "Relancer conversation" est créée.
              </p>
              <Select
                value={String(form.inactivity_threshold_hours ?? 12)}
                onValueChange={(v) => set({ inactivity_threshold_hours: parseInt(v, 10) })}
              >
                <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 heures</SelectItem>
                  <SelectItem value="12">12 heures (recommandé)</SelectItem>
                  <SelectItem value="18">18 heures</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-4 pt-3 border-t border-border">
              <div>
                <Label className="text-sm">Escalade vers appel manuel</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Crée une tâche d'appel + notif push si lead chaud sans réponse après 2 relances, ou lead engagé silencieux 24h+.
                </p>
              </div>
              <Switch
                checked={form.enable_call_escalation ?? true}
                onCheckedChange={(v) => set({ enable_call_escalation: v })}
              />
            </div>

            <div className="pt-3 border-t border-border space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-sm">Bascule template après 24h</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Quand la fenêtre WhatsApp est fermée (24h sans inbound), envoie automatiquement un template "reprise".
                  </p>
                </div>
                <Switch
                  checked={form.enable_24h_template_switch ?? true}
                  onCheckedChange={(v) => set({ enable_24h_template_switch: v })}
                />
              </div>

              {form.enable_24h_template_switch && (
                <div>
                  <Label className="text-sm">Template de reprise (utility/marketing approuvé)</Label>
                  <Select
                    value={form.template_reactivation_id ?? 'none'}
                    onValueChange={(v) => set({ template_reactivation_id: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="w-full mt-1">
                      <SelectValue placeholder="Choisir un template…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Aucun (la bascule sera ignorée)</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.language})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!form.template_reactivation_id && (
                    <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Sans template, la bascule 24h ne fait rien.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* DÉCLENCHEUR & EXÉCUTION */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h2 className="font-heading text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Déclencheur & exécution
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Le moteur qui détecte les tâches dues et lance les envois.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Trigger DB */}
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Trigger lead
                </div>
                <p className="text-sm font-medium">Actif</p>
                <p className="text-xs text-muted-foreground mt-0.5">Crée la séquence à chaque nouveau lead</p>
              </div>

              {/* Cron */}
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  {cronStatus?.active ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                  )}
                  Cron (chaque minute)
                </div>
                <p className="text-sm font-medium">{cronStatus?.active ? 'Actif' : 'Inactif'}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {cronStatus?.last_run_at
                    ? `Dernier run: ${formatDistanceToNow(new Date(cronStatus.last_run_at), { addSuffix: true, locale: fr })}`
                    : 'Pas encore exécuté'}
                </p>
              </div>

              {/* Tâches dues */}
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Clock className="h-3.5 w-3.5 text-primary" /> Tâches dues
                </div>
                <p className="text-sm font-medium font-mono">{dueCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">En attente de traitement</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runNow.mutate()}
                disabled={runNow.isPending || dueCount === 0}
                className="gap-2"
              >
                {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Exécuter maintenant ({dueCount})
              </Button>
              <p className="text-xs text-muted-foreground sm:self-center">
                Force le traitement immédiat de toutes les tâches dues, sans attendre le cron.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* SAVE BAR */}
      {dirty && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-card border border-primary/40 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.4)] rounded-full pl-4 pr-2 py-2 flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Modifications non sauvegardées</span>
            <Button size="sm" onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Sauvegarder
            </Button>
          </div>
        </div>
      )}

      {/* STEP EDITOR */}
      <StepEditorSheet
        open={!!editingStep}
        onOpenChange={(v) => !v && setEditingStep(null)}
        step={editingStep}
        templates={templates}
        currentTemplateId={editingStep ? form[editingStep.key] : null}
        currentDelay={editingStep ? form[editingStep.delayKey] || 0 : 0}
        onSave={({ templateId, delay }) => {
          if (!editingStep) return;
          set({ [editingStep.key]: templateId, [editingStep.delayKey]: delay });
        }}
      />
    </div>
  );
}
