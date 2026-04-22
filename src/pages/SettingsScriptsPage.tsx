import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useFollowupScripts,
  useUpsertFollowupScript,
  useDeleteFollowupScript,
  PHASE_LABELS,
  PHASE_ORDER,
  FollowupScript,
  FollowupScriptPhase,
} from '@/hooks/useFollowupScripts';
import { cn } from '@/lib/utils';

function ScriptCard({ script }: { script: FollowupScript }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FollowupScript>(script);
  const upsert = useUpsertFollowupScript();
  const del = useDeleteFollowupScript();
  const dirty =
    draft.title !== script.title ||
    draft.content !== script.content ||
    draft.phase !== script.phase ||
    draft.is_enabled !== script.is_enabled;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">
          {PHASE_LABELS[script.phase]}
        </span>
        <span className={cn('text-sm truncate flex-1', !script.is_enabled && 'text-muted-foreground line-through')}>
          {script.title || 'Sans titre'}
        </span>
      </button>

      {open && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/10">
          <div className="grid sm:grid-cols-[1fr_180px] gap-2">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Titre du script"
            />
            <Select value={draft.phase} onValueChange={(v) => setDraft({ ...draft, phase: v as FollowupScriptPhase })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PHASE_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={8}
            placeholder="Contenu du message. Tu peux utiliser {{name}} pour insérer le prénom du lead."
            className="font-mono text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.is_enabled}
                onCheckedChange={(v) => setDraft({ ...draft, is_enabled: v })}
              />
              Actif
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => del.mutate(script.id)}
                disabled={del.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                disabled={!dirty || upsert.isPending}
                onClick={() => upsert.mutate(draft)}
              >
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsScriptsPage() {
  const { data: scripts = [], isLoading } = useFollowupScripts();
  const upsert = useUpsertFollowupScript();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const grouped = PHASE_ORDER.map((p) => ({
    phase: p,
    items: scripts.filter((s) => s.phase === p),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        Crée des scripts de relance pré-écrits que tu pourras insérer en un clic dans les conversations WhatsApp.
        Variable disponible : <code className="text-primary">{'{{name}}'}</code> (prénom du lead).
      </div>

      <Button onClick={() => upsert.mutate({ phase: 'custom', title: 'Nouveau script', content: '' })} disabled={upsert.isPending}>
        <Plus className="h-4 w-4 mr-1.5" /> Nouveau script
      </Button>

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun script. Clique sur "Nouveau script" pour commencer.
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.phase} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {PHASE_LABELS[g.phase]}
              </h3>
              <div className="space-y-2">
                {g.items.map((s) => <ScriptCard key={s.id} script={s} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
