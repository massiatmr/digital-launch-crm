import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useWhatsAppMessages, useSendWhatsAppMessage, useWhatsAppRealtime } from '@/hooks/useFollowupTasks';

type PendingMsg = { tempId: string; content: string; at: number; status: 'sending' | 'failed' };

export function WhatsAppChat({ leadId, className }: { leadId: string; className?: string }) {
  useWhatsAppRealtime(leadId);
  const { data: messages = [] } = useWhatsAppMessages(leadId);
  const sendWA = useSendWhatsAppMessage();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending.length]);

  // Drop optimistic msgs once server-confirmed message with same content arrives
  useEffect(() => {
    if (pending.length === 0) return;
    setPending((prev) =>
      prev.filter((p) => !messages.some((m: any) => m.direction === 'outbound' && m.content === p.content && new Date(m.sent_at).getTime() >= p.at - 5000))
    );
  }, [messages, pending.length]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    const tempId = `tmp-${Date.now()}`;
    setPending((p) => [...p, { tempId, content: msg, at: Date.now(), status: 'sending' }]);
    try {
      await sendWA.mutateAsync({ leadId, message: msg });
    } catch {
      setPending((p) => p.map((x) => x.tempId === tempId ? { ...x, status: 'failed' } : x));
    }
  };

  return (
    <div className={cn('rounded-xl border border-border bg-muted/10 flex flex-col', className)}>
      <div className="flex-1 min-h-[200px] overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun message. Écris ci-dessous pour démarrer.</p>
        ) : (
          <>
            {messages.map((m: any) => (
              <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                  m.direction === 'outbound' ? 'bg-primary/20 rounded-br-sm' : 'bg-card rounded-bl-sm border border-border')}>
                  <p className="whitespace-pre-line">{m.content}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {format(new Date(m.sent_at), 'HH:mm', { locale: fr })}
                    {m.direction === 'outbound' && m.status === 'dry_run' && <span className="text-amber-500">· dry-run</span>}
                    {m.direction === 'outbound' && m.status === 'sent' && <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />}
                    {m.direction === 'outbound' && m.status === 'failed' && <AlertCircle className="h-2.5 w-2.5 text-destructive" />}
                  </div>
                </div>
              </div>
            ))}
            {pending.map((p) => (
              <div key={p.tempId} className="flex justify-end">
                <div className={cn('max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 text-sm shadow-sm',
                  p.status === 'failed' ? 'bg-destructive/20' : 'bg-primary/10 opacity-70')}>
                  <p className="whitespace-pre-line">{p.content}</p>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    {p.status === 'sending' ? (<><Clock className="h-2.5 w-2.5" /> envoi…</>) : (<><AlertCircle className="h-2.5 w-2.5 text-destructive" /> échec</>)}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-2 flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Écris un message... (Entrée pour envoyer)"
          rows={1}
          className="min-h-[40px] max-h-32 resize-none border-0 bg-transparent focus-visible:ring-0"
        />
        <Button size="icon" onClick={handleSend} disabled={sendWA.isPending || !input.trim()} className="shrink-0">
          {sendWA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
