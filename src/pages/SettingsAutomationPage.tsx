import { useEffect, useState } from 'react';
import { useFollowupSettings, useUpdateFollowupSettings } from '@/hooks/useFollowupTasks';
import {
  useWhatsAppTemplates,
  useSyncTemplates,
  useCreateLocalTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  WhatsAppTemplate,
} from '@/hooks/useWhatsAppTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Save, Bot, RefreshCw, Plus, Trash2, Pencil, AlertTriangle, FlaskConical } from 'lucide-react';

const TASK_TYPES = [
  { key: 'template_initial_id', label: 'Message initial' },
  { key: 'template_followup_1_id', label: 'Relance 1' },
  { key: 'template_followup_2_id', label: 'Relance 2' },
  { key: 'template_last_followup_id', label: 'Dernière relance' },
] as const;

function TemplateDialog({ template, onClose }: { template?: WhatsAppTemplate; onClose: () => void }) {
  const create = useCreateLocalTemplate();
  const update = useUpdateTemplate();
  const [form, setForm] = useState({
    name: template?.name || '',
    language: template?.language || 'fr',
    category: template?.category || 'MARKETING',
    body_text: template?.body_text || '',
  });
  const isEdit = !!template;

  const submit = async () => {
    if (isEdit) await update.mutateAsync({ id: template!.id, ...form });
    else await create.mutateAsync(form);
    onClose();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Modifier' : 'Nouveau'} template</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nom (exact, comme dans Meta)</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="relance_simple_fr" disabled={isEdit && template?.is_synced} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Langue</Label>
            <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="fr" />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKETING">MARKETING</SelectItem>
                <SelectItem value="UTILITY">UTILITY</SelectItem>
                <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Texte du template</Label>
          <Textarea
            rows={5}
            value={form.body_text}
            onChange={(e) => setForm({ ...form, body_text: e.target.value })}
            placeholder="Salut {{1}} 👋 J'ai vu ta demande pour {{2}}. Quel est ton délai ?"
          />
          <p className="text-xs text-muted-foreground mt-1">Utilise {`{{1}}, {{2}}…`} pour les variables (l'IA les remplira selon le lead).</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={submit} disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Enregistrer
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function SettingsAutomationPage() {
  const { data: settings, isLoading } = useFollowupSettings();
  const update = useUpdateFollowupSettings();
  const { data: templates = [], isLoading: tplLoading } = useWhatsAppTemplates();
  const sync = useSyncTemplates();
  const del = useDeleteTemplate();

  const [form, setForm] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<WhatsAppTemplate | undefined>();

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (isLoading || !form) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const openNew = () => { setEditingTpl(undefined); setDialogOpen(true); };
  const openEdit = (t: WhatsAppTemplate) => { setEditingTpl(t); setDialogOpen(true); };

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-heading text-2xl flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> Automatisation WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">Templates, mappings et déclenchement à la création d'un nouveau lead.</p>
      </header>

      {/* MODE TEST */}
      <div className={`rounded-xl border p-5 ${form.dry_run ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FlaskConical className={`h-5 w-5 mt-0.5 ${form.dry_run ? 'text-yellow-400' : 'text-red-400'}`} />
            <div>
              <Label className="text-base">Mode test (dry-run)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {form.dry_run
                  ? 'ON — Aucun message réel envoyé. Tout est loggé pour vérification.'
                  : '⚠️ OFF — Les messages partent pour de vrai aux leads via WhatsApp.'}
              </p>
            </div>
          </div>
          <Switch checked={form.dry_run} onCheckedChange={(v) => set('dry_run', v)} />
        </div>
      </div>

      {/* ACTIVATION */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Activer l'automatisation</Label>
            <p className="text-xs text-muted-foreground">Crée la séquence de tâches à chaque nouveau lead.</p>
          </div>
          <Switch checked={form.is_enabled} onCheckedChange={(v) => set('is_enabled', v)} />
        </div>
      </div>

      {/* TEMPLATES */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-base">Templates WhatsApp</h2>
            <p className="text-xs text-muted-foreground">Requis pour envoyer hors fenêtre 24h. Synchronise depuis Meta ou crée-les localement.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Synchroniser
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nouveau</Button>
              </DialogTrigger>
              <TemplateDialog template={editingTpl} onClose={() => setDialogOpen(false)} />
            </Dialog>
          </div>
        </div>

        {tplLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-yellow-400" />
            Aucun template. Synchronise depuis Meta ou crée-en un.
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-background/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{t.language}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t.category}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{t.status}</span>
                    {t.variables_count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">{t.variables_count} var.</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body_text}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm('Supprimer ce template ?') && del.mutate(t.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MAPPINGS */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-heading text-base">Mapping templates → tâches</h2>
          <p className="text-xs text-muted-foreground">Quel template envoyer pour chaque étape de la séquence.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TASK_TYPES.map((t) => (
            <div key={t.key}>
              <Label>{t.label}</Label>
              <Select
                value={form[t.key] || 'none'}
                onValueChange={(v) => set(t.key, v === 'none' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Aucun (IA texte libre)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun (IA texte libre)</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>{tpl.name} ({tpl.language})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* BRIEF IA */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-heading text-base">Brief IA (pour génération texte libre & variables)</h2>
        <div>
          <Label htmlFor="ai_instructions">Instructions à l'IA</Label>
          <Textarea id="ai_instructions" rows={5}
            value={form.ai_instructions}
            onChange={(e) => set('ai_instructions', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ai_examples">Exemples de messages</Label>
          <Textarea id="ai_examples" rows={6}
            value={form.ai_examples}
            onChange={(e) => set('ai_examples', e.target.value)}
          />
        </div>
      </div>

      {/* DÉLAIS */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-heading text-base">Délais des relances</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Initial (min)</Label>
            <Input type="number" min={0} value={form.initial_delay_minutes} onChange={(e) => set('initial_delay_minutes', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <Label>Relance 1 (h)</Label>
            <Input type="number" min={1} value={form.followup_1_delay_hours} onChange={(e) => set('followup_1_delay_hours', parseInt(e.target.value) || 24)} />
          </div>
          <div>
            <Label>Relance 2 (h)</Label>
            <Input type="number" min={1} value={form.followup_2_delay_hours} onChange={(e) => set('followup_2_delay_hours', parseInt(e.target.value) || 48)} />
          </div>
          <div>
            <Label>Dernière (h)</Label>
            <Input type="number" min={1} value={form.last_followup_delay_hours} onChange={(e) => set('last_followup_delay_hours', parseInt(e.target.value) || 72)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end sticky bottom-4">
        <Button size="lg" onClick={() => update.mutate({
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
        } as any)} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
