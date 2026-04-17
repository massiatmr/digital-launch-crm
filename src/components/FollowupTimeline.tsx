import { useState } from 'react';
import { useFollowupTasks, useWhatsAppMessages, useConversationState, useSendNow, useCancelTask, useGenerateMessage, useMarkLeadReplied } from '@/hooks/useFollowupTasks';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, X, Sparkles, MessageSquare, Bot, User, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  initial_message: 'Message initial',
  followup_1: 'Relance 1 (24h)',
  followup_2: 'Relance 2 (48h)',
  last_followup: 'Dernière relance (72h)',
  qualification: 'Qualification',
  propose_meeting: 'Proposer un RDV',
};

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'En attente', icon: Clock, className: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Programmée', icon: Clock, className: 'bg-primary/15 text-primary' },
  sent: { label: 'Envoyée', icon: CheckCircle2, className: 'bg-green-500/15 text-green-400' },
  cancelled: { label: 'Annulée', icon: XCircle, className: 'bg-muted/50 text-muted-foreground line-through' },
  failed: { label: 'Échec', icon: AlertCircle, className: 'bg-destructive/15 text-destructive' },
  skipped: { label: 'Ignorée', icon: XCircle, className: 'bg-muted/50 text-muted-foreground' },
};

export function FollowupTimeline({ leadId }: { leadId: string }) {
  const { data: tasks = [], isLoading } = useFollowupTasks(leadId);
  const { data: messages = [] } = useWhatsAppMessages(leadId);
  const { data: convState } = useConversationState(leadId);
  const sendNow = useSendNow();
  const cancelTask = useCancelTask();
  const generate = useGenerateMessage();
  const markReplied = useMarkLeadReplied();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);

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
    <div className="space-y-4">
      {/* État conversation */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h3 className="font-heading text-base">Suivi automatique WhatsApp</h3>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            {convState?.state ?? 'NEW'}
          </Badge>
        </div>
        {convState?.last_inbound_at && (
          <p className="mt-2 text-xs text-muted-foreground">
            Dernière réponse du lead : {formatDistanceToNow(new Date(convState.last_inbound_at), { locale: fr, addSuffix: true })}
          </p>
        )}
      </div>

      {/* Marquer comme répondu */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Le lead a répondu ?</h4>
          {!showReplyInput && (
            <Button size="sm" variant="outline" onClick={() => setShowReplyInput(true)}>
              Enregistrer une réponse
            </Button>
          )}
        </div>
        {showReplyInput && (
          <>
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Colle le message reçu sur WhatsApp..."
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => {
                if (!replyContent.trim()) return;
                await markReplied.mutateAsync({ leadId, content: replyContent.trim() });
                setReplyContent(''); setShowReplyInput(false);
              }} disabled={markReplied.isPending || !replyContent.trim()}>
                {markReplied.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enregistrer'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setReplyContent(''); setShowReplyInput(false); }}>Annuler</Button>
            </div>
          </>
        )}
      </div>

      {/* Tâches */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium">Séquence de tâches</h4>
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">Aucune tâche planifiée.</p>}
        <div className="space-y-2">
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
                    : 'Déclenchée par événement (réponse / qualification)'}
                  {t.executed_at && ` · Envoyée: ${format(new Date(t.executed_at), "dd MMM HH:mm", { locale: fr })}`}
                </p>
                {t.message_content && t.status === 'sent' && (
                  <p className="mt-2 text-sm whitespace-pre-line rounded-md bg-background/50 p-2 border border-border/50">{t.message_content}</p>
                )}
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
      </div>

      {/* Historique conversation */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Historique WhatsApp</h4>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun message échangé.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((m: any) => (
              <div key={m.id} className={cn('flex gap-2', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  m.direction === 'outbound' ? 'bg-primary/15 text-foreground' : 'bg-muted text-foreground')}>
                  <div className="flex items-center gap-1 mb-0.5 text-xs text-muted-foreground">
                    {m.direction === 'outbound' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {m.direction === 'outbound' ? 'Moi' : 'Lead'} · {format(new Date(m.sent_at), "dd MMM HH:mm", { locale: fr })}
                  </div>
                  <p className="whitespace-pre-line">{m.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
