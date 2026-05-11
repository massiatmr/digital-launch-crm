import { useAiMonitor } from '@/hooks/useAiStatus';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Pause, Moon, CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

type Row = ReturnType<typeof useAiMonitor>['data'] extends (infer U)[] | undefined ? U : never;

function computeStatus(r: Row) {
  if (r.resolved_at) return { label: 'Résolue', icon: CheckCircle2, tone: 'muted' };
  if (r.automation_paused_at) return { label: 'En pause', icon: Pause, tone: 'warning' };
  if (r.snoozed_until && new Date(r.snoozed_until) > new Date()) return { label: 'Sourdine', icon: Moon, tone: 'warning' };
  if (r.pending_tasks > 0) return { label: 'IA active', icon: Bot, tone: 'success' };
  const repliedNoTask = r.last_inbound_at && (!r.last_outbound_at || new Date(r.last_inbound_at) > new Date(r.last_outbound_at));
  if (repliedNoTask) return { label: 'À relancer', icon: AlertTriangle, tone: 'danger' };
  return { label: 'Inactive', icon: Clock, tone: 'muted' };
}

export default function AiMonitorPage() {
  const { data, isLoading } = useAiMonitor(150);

  return (
    <div className="container mx-auto py-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Monitoring IA</h1>
        <p className="text-sm text-muted-foreground mt-1">État de l'IA sur chaque conversation. Actualisé toutes les 30s.</p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}

      <div className="space-y-2">
        {(data ?? []).map((r) => {
          const s = computeStatus(r);
          const Icon = s.icon;
          const toneCls =
            s.tone === 'success' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
            : s.tone === 'warning' ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
            : s.tone === 'danger' ? 'text-red-300 bg-red-500/10 border-red-500/30'
            : 'text-muted-foreground bg-white/5 border-white/10';
          return (
            <Card key={r.lead_id} className="p-3 flex items-center gap-3 hover:bg-white/5 transition-colors">
              <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${toneCls}`}>
                <Icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/conversations?lead=${r.lead_id}`} className="font-medium hover:underline">
                  {r.name || 'Sans nom'}
                </Link>
                <div className="text-xs text-muted-foreground truncate">
                  {r.phone || '—'} · source: {r.source} · statut: {r.status}
                </div>
              </div>
              <div className="text-xs text-right text-muted-foreground hidden sm:block">
                {r.next_scheduled_at ? (
                  <>Prochaine: {formatDistanceToNow(new Date(r.next_scheduled_at), { addSuffix: true, locale: fr })}</>
                ) : r.last_inbound_at ? (
                  <>Dernier msg: {formatDistanceToNow(new Date(r.last_inbound_at), { addSuffix: true, locale: fr })}</>
                ) : '—'}
                <div>{r.pending_tasks} tâche(s) en file</div>
              </div>
            </Card>
          );
        })}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="text-muted-foreground text-sm">Aucun lead à monitorer.</p>
        )}
      </div>
    </div>
  );
}
