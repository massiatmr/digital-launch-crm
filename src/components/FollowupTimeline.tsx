import { useState } from 'react';
import { useFollowupTasks, useConversationState, useSendNow, useCancelTask, useGenerateMessage, useMarkLeadReplied } from '@/hooks/useFollowupTasks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, X, Sparkles, MessageSquare, Bot, CheckCircle2, Clock, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { WhatsAppChat } from './WhatsAppChat';

const TYPE_LABEL: Record<string, string> = {
  initial_message: 'Message initial',
  followup_1: 'Relance 1 (24h)',
  followup_2: 'Relance 2 (48h)',
  last_followup: 'Dernière relance (72h)',
  qualification: 'Qualification IA',
  propose_meeting: 'Proposer un RDV',
  reactivation: '🔄 Relancer (silence)',
  template_24h: '📨 Template reprise (24h+)',
  manual_call: '📞 Appel manuel (prioritaire)',
};

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'En attente', icon: Clock, className: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Programmée', icon: Clock, className: 'bg-primary/15 text-primary' },
  sent: { label: 'Envoyée', icon: CheckCircle2, className: 'bg-green-500/15 text-green-400' },
  cancelled: { label: 'Annulée', icon: XCircle, className: 'bg-muted/50 text-muted-foreground line-through' },
  failed: { label: 'Échec', icon: AlertCircle, className: 'bg-destructive/15 text-destructive' },
  skipped: { label: 'Ignorée', icon: XCircle, className: 'bg-muted/50 text-muted-foreground' },
};

export function FollowupTimeline({ leadId, leadName }: { leadId: string; leadName?: string }) {
  const { data: tasks = [], isLoading } = useFollowupTasks(leadId);
  const { data: convState } = useConversationState(leadId);
  const sendNow = useSendNow();
  const cancelTask = useCancelTask();
  const generate = useGenerateMessage();
  const markReplied = useMarkLeadReplied();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showSequence, setShowSequence] = useState(false);

  const startEdit = async (taskId: string, taskType: string) => {
    setEditing(taskId);
    setDraft('');
    try {
      const msg = await generate.mutateAsync({ leadId, taskType });
      setDraft(msg);
    } catch {}
  };

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      {/* Header conversation */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm">Conversation WhatsApp</h3>
          <Badge variant="outline" className="border-primary/30 text-primary text-xs">
            {convState?.state ?? 'NEW'}
          </Badge>
        </div>
        {convState?.last_inbound_at && (
          <span className="text-xs text-muted-foreground">
            Réponse {formatDistanceToNow(new Date(convState.last_inbound_at), { locale: fr, addSuffix: true })}
          </span>
        )}
      </div>

      <WhatsAppChat leadId={leadId} leadName={leadName} className="max-h-[420px]" />

      {/* Marquer une réponse manuelle */}
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-xs text-muted-foreground"
        onClick={async () => {
          const content = window.prompt('Colle le message reçu sur WhatsApp :');
          if (content?.trim()) await markReplied.mutateAsync({ leadId, content: content.trim() });
        }}
      >
        <MessageSquare className="h-3 w-3 mr-1" /> Enregistrer une réponse manuelle (annule les relances)
      </Button>

      {/* Séquence automatique (collapsible) */}
      <div className="rounded-xl border border-border bg-card">
        <button
          onClick={() => setShowSequence(!showSequence)}
          className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Séquence automatique ({tasks.filter((t: any) => t.status === 'scheduled' || t.status === 'pending').length} en attente)
          </span>
          {showSequence ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showSequence && (
          <div className="border-t border-border p-3 space-y-2">
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">Aucune tâche planifiée.</p>}
            {tasks.map((t: any) => {
              const meta = STATUS_META[t.status] ?? STATUS_META.pending;
              const Icon = meta.icon;
              const isFuture = new Date(t.scheduled_at).getTime() - Date.now() > 1000 * 60 * 60 * 24 * 365;
              return (
                <div key={t.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', meta.className)}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                      <span className="text-sm font-medium truncate">{TYPE_LABEL[t.task_type] ?? t.task_type}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(t.status === 'pending' || t.status === 'scheduled' || t.status === 'failed') && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(t.id, t.task_type)} disabled={generate.isPending && editing === t.id}>
                            {generate.isPending && editing === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="h-3 w-3 mr-1" />Préparer</>}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelTask.mutate(t.id)} className="text-destructive">
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {!isFuture
                      ? `Prévu: ${format(new Date(t.scheduled_at), "dd MMM yyyy à HH:mm", { locale: fr })}`
                      : 'Déclenchée par événement'}
                    {t.executed_at && ` · Envoyée: ${format(new Date(t.executed_at), "dd MMM HH:mm", { locale: fr })}`}
                  </p>
                  {t.error_message && <p className="mt-1 text-xs text-destructive">{t.error_message}</p>}

                  {editing === t.id && (
                    <div className="mt-3 space-y-2">
                      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Message à envoyer..." />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setDraft(''); }}>Fermer</Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          const msg = await generate.mutateAsync({ leadId, taskType: t.task_type });
                          setDraft(msg);
                        }} disabled={generate.isPending}>
                          <Sparkles className="h-3 w-3 mr-1" />Régénérer
                        </Button>
                        <Button size="sm" onClick={async () => {
                          await sendNow.mutateAsync({ taskId: t.id, customMessage: draft });
                          setEditing(null); setDraft('');
                        }} disabled={sendNow.isPending || !draft.trim()}>
                          {sendNow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Envoyer</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
