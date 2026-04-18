import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLead, useLeadMessages, useLeadScripts, useDeleteLead } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput';
import { LeadActivityTimeline } from '@/components/LeadActivityTimeline';
import { LeadEditForm } from '@/components/LeadEditForm';
import { FollowupTimeline } from '@/components/FollowupTimeline';
import {
  Copy, Mail, MessageCircle, Phone, Smartphone, Loader2, ExternalLink,
  Pencil, Trash2, ChevronDown, ChevronUp, Sparkles, Activity, Bot, LayoutGrid,
} from 'lucide-react';
import { ShowStatusToggle } from '@/components/ShowStatusToggle';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function LeadDetailContent({ leadId }: { leadId: string }) {
  const [editing, setEditing] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(leadId);
  const { data: messages = [] } = useLeadMessages(leadId);
  const { data: scripts = [] } = useLeadScripts(leadId);
  const deleteLead = useDeleteLead();

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
    toast.success('Copié !');
  };

  const hasAiAnalysis = lead.ai_summary || lead.sales_angle || lead.next_action || lead.notes;

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-heading text-xl truncate">{lead.name}</h2>
              <LeadScoreBadge score={lead.score} />
              <LeadStatusBadge status={lead.status} />
            </div>
            {lead.company_name && (
              <p className="text-xs text-muted-foreground mt-0.5">{lead.company_name}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ShowStatusToggle leadId={lead.id} currentStatus={lead.show_status} size="md" />
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)} title="Éditer">
              <Pencil className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce lead ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. Toutes les données associées à {lead.name} seront supprimées.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      deleteLead.mutate(lead.id, {
                        onSuccess: () => {
                          toast.success('Lead supprimé');
                          navigate('/leads');
                        },
                        onError: () => toast.error('Erreur lors de la suppression'),
                      });
                    }}
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Contact line */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {lead.phone && (
            <a
              href={toWhatsAppUrl(lead.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <Phone className="h-3 w-3" />
              {formatPhoneDisplay(lead.phone)}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {lead.email && (
            <span className="flex items-center gap-1 truncate max-w-[200px]">
              <Mail className="h-3 w-3" />{lead.email}
            </span>
          )}
          <span className="capitalize">{lead.source.replace('_', ' ')}</span>
          <span>{format(new Date(lead.created_at), "dd MMM yyyy", { locale: fr })}</span>
        </div>

        {/* AI Summary banner (compact) */}
        {hasAiAnalysis && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {lead.ai_summary && (
                  <p className={`text-sm ${aiExpanded ? '' : 'line-clamp-2'}`}>{lead.ai_summary}</p>
                )}
                {aiExpanded && (
                  <div className="mt-2 space-y-2 text-sm">
                    {lead.sales_angle && (
                      <div>
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">Angle</span>
                        <p>{lead.sales_angle}</p>
                      </div>
                    )}
                    {lead.next_action && (
                      <div>
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">Prochaine action</span>
                        <p>{lead.next_action}</p>
                        {lead.next_action_date && (
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(lead.next_action_date), "dd MMM yyyy à HH:mm", { locale: fr })}
                          </p>
                        )}
                      </div>
                    )}
                    {lead.notes && (
                      <div>
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">Notes</span>
                        <p className="whitespace-pre-line">{lead.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 shrink-0"
                onClick={() => setAiExpanded(!aiExpanded)}
              >
                {aiExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0 mt-3">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="overview" className="text-xs gap-1">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Vue</span>
          </TabsTrigger>
          <TabsTrigger value="followup" className="text-xs gap-1">
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Suivi</span>
          </TabsTrigger>
          <TabsTrigger value="activities" className="text-xs gap-1">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activités</span>
          </TabsTrigger>
          <TabsTrigger value="ai-content" className="text-xs gap-1">
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">IA</span>
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-3">
          <div className="pr-3 pb-6">
            <TabsContent value="overview" className="mt-0 space-y-4">
              {lead.message && (
                <div className="rounded-lg bg-muted/50 p-3 border-l-2 border-primary/40">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Message initial</p>
                  <p className="text-sm italic">"{lead.message}"</p>
                </div>
              )}
              <NaturalLanguageInput leadId={lead.id} lead={lead} />
              {!hasAiAnalysis && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Analyse IA en cours ou non disponible...
                </p>
              )}
            </TabsContent>

            <TabsContent value="followup" className="mt-0">
              <FollowupTimeline leadId={lead.id} />
            </TabsContent>

            <TabsContent value="activities" className="mt-0">
              <LeadActivityTimeline leadId={lead.id} />
            </TabsContent>

            <TabsContent value="ai-content" className="mt-0 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="font-heading text-sm flex items-center gap-2 mb-3">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  Messages préparés
                </h3>
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun message généré.</p>
                ) : (
                  <div className="space-y-2">
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

              {scripts.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-heading text-sm flex items-center gap-2 mb-3">
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
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      {/* Edit mode in sub-Sheet */}
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Modifier le lead</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <LeadEditForm lead={lead} onClose={() => setEditing(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
