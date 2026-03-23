import { useState } from 'react';
import { useLead, useLeadMessages, useLeadScripts } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput';
import { LeadActivityTimeline } from '@/components/LeadActivityTimeline';
import { LeadEditForm } from '@/components/LeadEditForm';
import { Copy, Mail, MessageCircle, Phone, Smartphone, Loader2, ExternalLink, Pencil } from 'lucide-react';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AnimatePresence } from 'framer-motion';

export function LeadDetailContent({ leadId }: { leadId: string }) {
  const [editing, setEditing] = useState(false);
  const { data: lead, isLoading } = useLead(leadId);
  const { data: messages = [] } = useLeadMessages(leadId);
  const { data: scripts = [] } = useLeadScripts(leadId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return <p className="text-muted-foreground py-10 text-center">Lead introuvable</p>;
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié dans le presse-papiers !');
  };

  return (
    <ScrollArea className="h-[calc(100vh-80px)]">
      <div className="space-y-6 pr-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-heading text-xl">{lead.name}</h2>
            {lead.company_name && <span className="text-sm text-muted-foreground">· {lead.company_name}</span>}
            <LeadScoreBadge score={lead.score} />
            <LeadStatusBadge status={lead.status} />
            <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {lead.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{lead.email}</span>}
            {lead.phone && (
              <a
                href={toWhatsAppUrl(lead.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                {formatPhoneDisplay(lead.phone)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span className="capitalize">{lead.source.replace('_', ' ')}</span>
            <span>{format(new Date(lead.created_at), "dd MMM yyyy à HH:mm", { locale: fr })}</span>
          </div>
        </div>

        {/* Edit Form */}
        <AnimatePresence>
          {editing && <LeadEditForm lead={lead} onClose={() => setEditing(false)} />}
        </AnimatePresence>

        {/* Voice/Text Update - First */}
        <NaturalLanguageInput leadId={lead.id} lead={lead} />

        {lead.message && (
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm italic text-muted-foreground">"{lead.message}"</p>
          </div>
        )}

        {/* AI Analysis */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-heading text-base flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse-soft" />
            Analyse IA
          </h3>
          {lead.ai_summary ? (
            <>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Résumé</h4>
                <p className="mt-1 text-sm">{lead.ai_summary}</p>
              </div>
              {lead.sales_angle && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Angle de vente</h4>
                  <p className="mt-1 text-sm">{lead.sales_angle}</p>
                </div>
              )}
              {lead.next_action && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prochaine action</h4>
                  <p className="mt-1 text-sm">{lead.next_action}</p>
                  {lead.next_action_date && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(lead.next_action_date), "dd MMM yyyy à HH:mm", { locale: fr })}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Analyse IA en cours ou non disponible...</p>
          )}
          {lead.notes && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</h4>
              <p className="mt-1 text-sm whitespace-pre-line">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Activity Timeline */}
        <LeadActivityTimeline leadId={lead.id} />

        {/* Messages */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-heading text-base flex items-center gap-2 mb-4">
            <MessageCircle className="h-4 w-4 text-primary" />
            Messages préparés
          </h3>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun message généré pour ce lead.</p>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
                      {msg.type === 'whatsapp' && <Smartphone className="h-3 w-3" />}
                      {msg.type}
                    </span>
                    <button
                      onClick={() => copyToClipboard(msg.content)}
                      className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Copy className="h-3 w-3" /> Copier
                    </button>
                  </div>
                  <p className="text-sm whitespace-pre-line">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scripts */}
        {scripts.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-heading text-base flex items-center gap-2 mb-4">
              <Phone className="h-4 w-4 text-primary" />
              Script d'appel
            </h3>
            {scripts.map(s => (
              <div key={s.id} className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm whitespace-pre-line">{s.script}</p>
                </div>
                {s.objections?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Objections & Réponses</h4>
                    <div className="space-y-2">
                      {s.objections.map((o: any, i: number) => (
                        <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-xs font-medium text-lead-warm">❓ {o.objection}</p>
                          <p className="mt-1 text-sm">→ {o.response}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </ScrollArea>
  );
}
