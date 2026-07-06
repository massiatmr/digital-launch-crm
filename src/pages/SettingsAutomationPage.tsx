import { useEffect, useMemo, useState } from 'react';
import { useFollowupSettings, useUpdateFollowupSettings } from '@/hooks/useFollowupTasks';
import { useWhatsAppTemplates, useActiveWorkspaceTemplates } from '@/hooks/useWhatsAppTemplates';
import { useCronStatus, useDueTasksCount, useRunFollowupNow } from '@/hooks/useFollowupCron';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Loader2, Bot, FlaskConical, Settings as SettingsIcon, AlertTriangle, CheckCircle2, Zap, PlayCircle, Filter, Phone, RefreshCw, FileText, MessageSquare,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SequenceEditor } from '@/components/automation/SequenceEditor';
import { TemplatesManager } from '@/components/automation/TemplatesManager';
import { OfferSequenceSwitcher } from '@/components/automation/OfferSequenceSwitcher';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const LEAD_SOURCES: { value: string; label: string; group?: string }[] = [
  { value: 'facebook', label: 'Facebook Lead Ads', group: 'Ads & Web' },
  { value: 'website', label: 'Site web', group: 'Ads & Web' },
  { value: 'google_sheets', label: 'Google Sheets', group: 'Ads & Web' },
  { value: 'organic_social', label: 'Réseaux organic', group: 'Ads & Web' },
  { value: 'recommendation', label: 'Recommendation', group: 'Ads & Web' },
  { value: 'google_my_business', label: 'Google My Business', group: 'Ads & Web' },
  { value: 'manual', label: 'Manuel', group: 'Ads & Web' },
  { value: 'other', label: 'Autre', group: 'Ads & Web' },
  // Canaux Meta — traités séparément (logique de fenêtre 24h, pas de numéro, profil parfois vide)
  { value: 'whatsapp', label: 'WhatsApp (entrant)', group: 'Canaux Meta' },
  { value: 'messenger', label: 'Messenger (Meta)', group: 'Canaux Meta' },
  { value: 'instagram', label: 'Instagram DM (Meta)', group: 'Canaux Meta' },
];

export default function SettingsAutomationPage() {
  const { data: settings, isLoading } = useFollowupSettings();
  const update = useUpdateFollowupSettings();
  const { data: templates = [] } = useWhatsAppTemplates();
  const { data: activeTemplates = [] } = useActiveWorkspaceTemplates();
  const { data: cronStatus } = useCronStatus();
  const { data: dueCount = 0 } = useDueTasksCount();
  const runNow = useRunFollowupNow();

  const [form, setForm] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [kind, setKind] = useState<'qualification' | 'website_booking'>('qualification');

  useEffect(() => { if (settings && !form) setForm(settings); }, [settings, form]);

  const set = (patch: Record<string, any>) => { setForm({ ...form, ...patch }); setDirty(true); };

  const save = () => {
    update.mutate({
      is_enabled: form.is_enabled,
      dry_run: form.dry_run,
      ai_instructions: form.ai_instructions,
      ai_examples: form.ai_examples,
      trigger_sources: form.trigger_sources,
      trigger_only_new_status: form.trigger_only_new_status,
      inactivity_threshold_hours: form.inactivity_threshold_hours,
      enable_call_escalation: form.enable_call_escalation,
      enable_24h_template_switch: form.enable_24h_template_switch,
      template_reactivation_id: form.template_reactivation_id,
      prompt_qualification: form.prompt_qualification,
      prompt_objection: form.prompt_objection,
      prompt_closing: form.prompt_closing,
      prompt_reactivation: form.prompt_reactivation,
      enable_ab_test: form.enable_ab_test,
      auto_stop_on_not_interested: form.auto_stop_on_not_interested,
    } as any, { onSuccess: () => setDirty(false) });
  };

  const toggleSource = (src: string) => {
    const current: string[] = form.trigger_sources || [];
    const next = current.includes(src) ? current.filter((s) => s !== src) : [...current, src];
    set({ trigger_sources: next });
  };

  if (isLoading || !form) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-5xl space-y-5 pb-24">
      {/* COMPACT HEADER */}
      <header className="rounded-xl border border-border bg-card/50 backdrop-blur-md p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-heading text-xl">Automatisation conversations</h1>
              <p className="text-xs text-muted-foreground">WhatsApp, Messenger & Instagram — séquence déclenchée à chaque nouveau lead.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
              form.dry_run
                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            )}>
              <FlaskConical className="h-3 w-3" />
              {form.dry_run ? 'Mode test' : 'LIVE'}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
              form.is_enabled
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-muted text-muted-foreground border-border'
            )}>
              {form.is_enabled ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {form.is_enabled ? 'Auto active' : 'Auto OFF'}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending}
              className="gap-1.5"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Lancer ({dueCount})
            </Button>
          </div>
        </div>

        {form.dry_run && (
          <div className="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 flex items-center justify-between gap-3">
            <span className="text-xs text-yellow-300">
              <strong>Mode test actif</strong> — aucun message WhatsApp n'est envoyé aux leads.
            </span>
            <Button size="sm" variant="outline" onClick={() => set({ dry_run: false })} className="shrink-0 border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/10 h-7 text-xs">
              Passer en LIVE
            </Button>
          </div>
        )}
      </header>

      {/* OFFER SWITCHER */}
      <OfferSequenceSwitcher value={offerId} onChange={setOfferId} />

      {/* SEQUENCE — main view */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col items-center mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium">
            🆕 Nouveau lead {offerId ? 'sur cette offre' : ''}
          </span>
          <div className="h-4 w-px bg-border mt-1" />
        </div>

        <SequenceEditor offerId={offerId} />

        <div className="flex flex-col items-center mt-4">
          <div className="h-4 w-px bg-border" />
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs">
            💤 Lead marqué froid si aucune réponse
          </span>
        </div>

        {templates.length === 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-yellow-400">Aucun template disponible</p>
              <p className="text-muted-foreground mt-0.5">
                Ouvre <strong>Templates WhatsApp</strong> ci-dessous pour synchroniser depuis Meta ou en créer un.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ADVANCED — collapsed by default */}
      <Accordion type="multiple" className="space-y-2">
        {/* Conditions */}
        <AccordionItem value="conditions" className="rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-primary" />
              Conditions de déclenchement <span className="text-xs text-muted-foreground font-normal">— sources, statut</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm">Uniquement leads à l'étape "Nouveau"</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Si désactivé, un lead créé directement en "Contacté" recevra aussi la séquence.</p>
              </div>
              <Switch checked={form.trigger_only_new_status ?? true} onCheckedChange={(v) => set({ trigger_only_new_status: v })} />
            </div>
            <div className="pt-3 border-t border-border">
              <Label className="text-sm">Sources de leads autorisées</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                Seules ces sources déclencheront la séquence. <strong>Messenger / Instagram</strong> sont traités à part :
                pas de numéro de téléphone, pas de fenêtre 24h WhatsApp, et le nom du prospect peut être vide
                (l'IA enverra alors un message pour le demander et mettra à jour la fiche automatiquement).
              </p>
              {(['Ads & Web', 'Canaux Meta'] as const).map((group) => (
                <div key={group} className="mb-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{group}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {LEAD_SOURCES.filter((s) => s.group === group).map((src) => {
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
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 24h window & call */}
        <AccordionItem value="window" className="rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-primary" />
              Fenêtre 24h & escalade appel
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div>
              <Label className="text-sm flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Délai d'inactivité avant relance auto
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  value={(() => {
                    const h = form.inactivity_threshold_hours ?? 12;
                    return h < 1 ? Math.round(h * 60) : h;
                  })()}
                  onChange={(e) => {
                    const n = Math.max(1, parseInt(e.target.value, 10) || 1);
                    const isMinutes = (form.inactivity_threshold_hours ?? 12) < 1;
                    set({ inactivity_threshold_hours: isMinutes ? n / 60 : n });
                  }}
                />
                <Select
                  value={(form.inactivity_threshold_hours ?? 12) < 1 ? 'minutes' : 'hours'}
                  onValueChange={(unit) => {
                    const cur = form.inactivity_threshold_hours ?? 12;
                    if (unit === 'minutes') set({ inactivity_threshold_hours: (cur < 1 ? Math.round(cur * 60) : cur * 60) / 60 });
                    else set({ inactivity_threshold_hours: cur < 1 ? Math.max(1, Math.round(cur * 60 / 60)) : cur });
                  }}
                >
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Heures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 pt-3 border-t border-border">
              <div>
                <Label className="text-sm">Escalade vers appel manuel</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Crée une tâche d'appel + notif push pour les leads chauds silencieux.</p>
              </div>
              <Switch checked={form.enable_call_escalation ?? true} onCheckedChange={(v) => set({ enable_call_escalation: v })} />
            </div>
            <div className="pt-3 border-t border-border space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-sm">Bascule template après 24h</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Quand la fenêtre WhatsApp est fermée, envoie un template "reprise".</p>
                </div>
                <Switch checked={form.enable_24h_template_switch ?? true} onCheckedChange={(v) => set({ enable_24h_template_switch: v })} />
              </div>
              {form.enable_24h_template_switch && (
                <div>
                  <Label className="text-sm">Template de reprise</Label>
                  <Select
                    value={form.template_reactivation_id ?? 'none'}
                    onValueChange={(v) => set({ template_reactivation_id: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Choisir un template…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Aucun</SelectItem>
                      {activeTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name} ({t.language})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Templates */}
        <AccordionItem value="templates" className="rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              Templates WhatsApp <span className="text-xs text-muted-foreground font-normal">({templates.length})</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <TemplatesManager />
          </AccordionContent>
        </AccordionItem>

        {/* Mode & exécution */}
        <AccordionItem value="mode" className="rounded-xl border border-border bg-card px-4">
          <AccordionTrigger className="hover:no-underline">
            <span className="flex items-center gap-2 text-sm">
              <SettingsIcon className="h-4 w-4 text-primary" />
              Mode test & exécution
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className={cn(
              'rounded-lg border p-3 flex items-start justify-between gap-4',
              form.dry_run ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-red-500/40 bg-red-500/5'
            )}>
              <div className="flex items-start gap-2">
                <FlaskConical className={cn('h-4 w-4 mt-0.5', form.dry_run ? 'text-yellow-400' : 'text-red-400')} />
                <div>
                  <Label className="text-sm">Mode test (dry-run)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {form.dry_run ? 'ON — Aucun envoi réel.' : '⚠️ OFF — Envois réels aux leads.'}
                  </p>
                </div>
              </div>
              <Switch checked={form.dry_run} onCheckedChange={(v) => set({ dry_run: v })} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm">Activer l'automatisation</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Crée la séquence à chaque nouveau lead.</p>
              </div>
              <Switch checked={form.is_enabled} onCheckedChange={(v) => set({ is_enabled: v })} />
            </div>
            {cronStatus && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">Cron exécuté</span>
                  <span className="text-muted-foreground">
                    {cronStatus.last_run_at ? formatDistanceToNow(new Date(cronStatus.last_run_at), { addSuffix: true, locale: fr }) : 'jamais'}
                  </span>
                </div>
                <p className="text-muted-foreground">Tâches en attente : <strong>{dueCount}</strong></p>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* STICKY SAVE */}
      {dirty && (
        <div className="fixed bottom-4 right-4 z-50 flex gap-2 bg-card border border-primary/40 rounded-xl px-3 py-2 shadow-2xl shadow-primary/20">
          <span className="text-xs text-muted-foreground self-center">Modifications non enregistrées</span>
          <Button size="sm" onClick={save} disabled={update.isPending} className="gap-1.5">
            {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}
