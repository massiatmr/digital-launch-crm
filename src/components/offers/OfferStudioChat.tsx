import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Send, Loader2, Undo2, User, Wand2 } from 'lucide-react';
import { useOfferChat, useSendOfferChatMessage, useUndoOfferChange } from '@/hooks/useOfferAIChat';
import type { DbOffer, DbOfferPage } from '@/hooks/useOfferData';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Rends le titre plus accrocheur',
  'Réécris avec un ton plus direct',
  'Ajoute une section témoignages',
  'Supprime la FAQ',
  'Plus court et impactant',
];

interface Props {
  offer: DbOffer;
  page: DbOfferPage;
}

export default function OfferStudioChat({ offer, page }: Props) {
  const { data: messages = [] } = useOfferChat(offer.id);
  const send = useSendOfferChatMessage(offer.id);
  const undo = useUndoOfferChange(offer.id);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, send.isPending]);

  const handleSend = async (text?: string) => {
    const instruction = (text ?? input).trim();
    if (!instruction || send.isPending) return;
    setInput('');

    const previousSnapshot = {
      offer: { name: offer.name, description: offer.description, niche: offer.niche },
      page: {
        headline: page.headline,
        subheadline: page.subheadline,
        cta_text: page.cta_text,
        sections: page.sections,
        testimonials: page.testimonials,
      },
    };

    await send.mutateAsync({
      instruction,
      offer: { name: offer.name, description: offer.description, niche: offer.niche },
      page: {
        id: page.id,
        headline: page.headline,
        subheadline: page.subheadline,
        cta_text: page.cta_text,
        sections: Array.isArray(page.sections) ? page.sections : [],
        testimonials: Array.isArray(page.testimonials) ? page.testimonials : [],
      },
      history: messages.map((m) => ({ role: m.role, content: m.content })),
      previousSnapshot,
    });
  };

  const lastAssistantWithSnapshot = [...messages].reverse().find((m) => m.role === 'assistant' && m.snapshot);

  return (
    <div className="flex flex-col h-full bg-card/30">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Assistant IA</p>
            <p className="text-xs text-muted-foreground">Édite ton offre en langage naturel</p>
          </div>
        </div>
        {lastAssistantWithSnapshot && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => undo.mutate({ snapshot: lastAssistantWithSnapshot.snapshot, pageId: page.id })}
            disabled={undo.isPending}
            className="text-xs"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Annuler
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="inline-flex p-3 rounded-full bg-primary/10">
              <Wand2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Demande-moi n'importe quoi</p>
              <p className="text-xs text-muted-foreground mt-1">Je modifie ta landing page en direct</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary border border-border/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <div className="shrink-0 p-1.5 rounded-md bg-primary/10 h-fit">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-muted text-foreground rounded-bl-sm'
              )}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="shrink-0 p-1.5 rounded-md bg-muted h-fit">
                <User className="h-3.5 w-3.5" />
              </div>
            )}
          </div>
        ))}

        {send.isPending && (
          <div className="flex gap-2 justify-start">
            <div className="shrink-0 p-1.5 rounded-md bg-primary/10 h-fit">
              <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Modification en cours…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border/50 p-3">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ex: rends le titre plus accrocheur..."
            rows={2}
            className="resize-none text-sm"
            disabled={send.isPending}
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={!input.trim() || send.isPending}
            className="shrink-0"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
