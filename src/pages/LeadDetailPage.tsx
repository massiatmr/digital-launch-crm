import { useParams, Link } from 'react-router-dom';
import { mockLeads, mockMessages, mockScripts } from '@/data/mockData';
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { ArrowLeft, Copy, Mail, MessageCircle, Phone, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

export default function LeadDetailPage() {
  const { id } = useParams();
  const lead = mockLeads.find(l => l.id === id);
  const messages = mockMessages.filter(m => m.leadId === id);
  const scripts = mockScripts.filter(s => s.leadId === id);

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Lead introuvable</p>
        <Link to="/leads" className="mt-2 text-sm text-primary hover:underline">Retour aux leads</Link>
      </div>
    );
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié dans le presse-papiers !');
  };

  return (
    <div className="space-y-6">
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl">{lead.name}</h1>
              <LeadScoreBadge score={lead.score} />
              <LeadStatusBadge status={lead.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{lead.email}</span>
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>
              <span className="capitalize">{lead.source.replace('_', ' ')}</span>
              <span>{format(new Date(lead.createdAt), "dd MMM yyyy à HH:mm", { locale: fr })}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-muted/50 p-4">
          <p className="text-sm italic text-muted-foreground">"{lead.message}"</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* AI Analysis */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="font-heading text-lg flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse-soft" />
            Analyse IA
          </h2>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Résumé</h3>
            <p className="mt-1 text-sm">{lead.aiSummary}</p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Angle de vente</h3>
            <p className="mt-1 text-sm">{lead.salesAngle}</p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prochaine action</h3>
            <p className="mt-1 text-sm">{lead.nextAction}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(lead.nextActionDate), "dd MMM yyyy à HH:mm", { locale: fr })}
            </p>
          </div>
          {lead.notes && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</h3>
              <p className="mt-1 text-sm">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-heading text-lg flex items-center gap-2 mb-4">
              <MessageCircle className="h-4 w-4 text-primary" />
              Messages préparés
            </h2>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun message généré pour ce lead.</p>
            ) : (
              <div className="space-y-4">
                {messages.map(msg => (
                  <div key={msg.id} className="rounded-lg border border-border bg-muted/30 p-4">
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
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-heading text-lg flex items-center gap-2 mb-4">
                <Phone className="h-4 w-4 text-primary" />
                Script d'appel
              </h2>
              {scripts.map(s => (
                <div key={s.id} className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm whitespace-pre-line">{s.script}</p>
                  </div>
                  {s.objections.length > 0 && (
                    <div>
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Objections & Réponses</h3>
                      <div className="space-y-2">
                        {s.objections.map((o, i) => (
                          <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                            <p className="text-xs font-medium text-lead-warm">❓ {o.objection}</p>
                            <p className="mt-1 text-sm text-foreground">→ {o.response}</p>
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
      </div>
    </div>
  );
}
