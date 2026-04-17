import { useEffect, useState } from 'react';
import { useFollowupSettings, useUpdateFollowupSettings } from '@/hooks/useFollowupTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Bot } from 'lucide-react';

export default function SettingsAutomationPage() {
  const { data: settings, isLoading } = useFollowupSettings();
  const update = useUpdateFollowupSettings();
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (isLoading || !form) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-heading text-2xl flex items-center gap-2"><Bot className="h-6 w-6 text-primary" /> Automatisation WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure le ton, les exemples et les délais des relances IA.</p>
      </header>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Activer l'automatisation</Label>
            <p className="text-xs text-muted-foreground">Quand activé, chaque nouveau lead reçoit automatiquement la séquence.</p>
          </div>
          <Switch checked={form.is_enabled} onCheckedChange={(v) => set('is_enabled', v)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-heading text-base">Brief IA</h2>
        <div>
          <Label htmlFor="ai_instructions">Instructions à l'IA</Label>
          <Textarea id="ai_instructions" rows={6}
            value={form.ai_instructions}
            onChange={(e) => set('ai_instructions', e.target.value)}
            placeholder="Tu es un commercial humain et bienveillant..."
          />
          <p className="text-xs text-muted-foreground mt-1">Ton, contraintes, longueur, langue, signature interdite, etc.</p>
        </div>
        <div>
          <Label htmlFor="ai_examples">Exemples de messages à suivre</Label>
          <Textarea id="ai_examples" rows={8}
            value={form.ai_examples}
            onChange={(e) => set('ai_examples', e.target.value)}
            placeholder={`Exemple message initial:\n"Salut Marie 👋 J'ai vu ta demande pour [offre]. Quel est ton délai idéal pour démarrer ?"\n\nExemple relance 1:\n"..."`}
          />
          <p className="text-xs text-muted-foreground mt-1">Plus tu donnes d'exemples, plus l'IA imite ton style.</p>
        </div>
      </div>

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
        <p className="text-xs text-muted-foreground">Délais comptés depuis la création du lead. S'appliquent aux prochains nouveaux leads.</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => update.mutate({
          is_enabled: form.is_enabled,
          ai_instructions: form.ai_instructions,
          ai_examples: form.ai_examples,
          initial_delay_minutes: form.initial_delay_minutes,
          followup_1_delay_hours: form.followup_1_delay_hours,
          followup_2_delay_hours: form.followup_2_delay_hours,
          last_followup_delay_hours: form.last_followup_delay_hours,
        })} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
