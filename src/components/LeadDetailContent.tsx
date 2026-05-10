import { useEffect, useState } from 'react';
import { useLead, useDeleteLead, useUpdateLead } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput';
import { LeadActivityTimeline } from '@/components/LeadActivityTimeline';
import { LeadEditForm } from '@/components/LeadEditForm';
import { FollowupTimeline } from '@/components/FollowupTimeline';
import { LeadQualificationCard } from '@/components/LeadQualificationCard';
import {
  Mail,
  Phone,
  Smartphone,
  Loader2,
  Trash2,
  Sparkles,
  Activity,
  LayoutGrid,
  Save,
} from 'lucide-react';
import { ShowStatusToggle } from '@/components/ShowStatusToggle';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaceFeatures } from '@/hooks/useWorkspaceFeatures';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function LeadDetailContent({
  leadId,
  onDeleted,
}: {
  leadId: string;
  onDeleted?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hardDelete, setHardDelete] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);

  const { data: lead, isLoading } = useLead(leadId);
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();
  const { isEnabled } = useWorkspaceFeatures();
  const whatsappEnabled = isEnabled('whatsapp');

  const AI_BLOCK_REGEX = /<!-- AI_NOTES_START -->([\s\S]*?)<!-- AI_NOTES_END -->/;
  const fullNotes = lead?.notes ?? '';
  const aiMatch = fullNotes.match(AI_BLOCK_REGEX);
  const aiNotesBlock = aiMatch ? aiMatch[1].trim() : '';
  const manualNotes = fullNotes.replace(AI_BLOCK_REGEX, '').trim();

  useEffect(() => {
    if (lead && !notesDirty) setNotesDraft(manualNotes);
  }, [lead, manualNotes, notesDirty]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return <p className="py-10 text-center text-muted-foreground">Lead introuvable</p>;
  }

  const saveNotes = async () => {
    const recomposed = aiMatch
      ? `${notesDraft.trim() ? `${notesDraft.trim()}\n\n` : ''}${aiMatch[0]}`
      : notesDraft;

    await updateLead.mutateAsync({ id: lead.id, notes: recomposed });
    setNotesDirty(false);
    toast.success('Notes sauvegardées');
  };

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 pb-2 pr-12 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="font-heading truncate text-lg">{lead.name}</h2>
              <LeadScoreBadge score={lead.score} />
              <LeadStatusBadge status={lead.status} />
              <ShowStatusToggle leadId={lead.id} currentStatus={lead.show_status} size="sm" showHelper />
            </div>

            {lead.company_name && (
              <p className="truncate text-sm text-muted-foreground">{lead.company_name}</p>
            )}
          </div>
          <CreateTaskForLeadDialog leadId={lead.id} leadName={lead.name} />
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => { setConfirmDelete(o); if (!o) setHardDelete(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{hardDelete ? 'Supprimer définitivement ?' : 'Archiver ce lead ?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {hardDelete
                ? '⚠️ Action irréversible. Le lead, ses messages WhatsApp, tâches, qualification et activités seront supprimés définitivement de la base.'
                : 'Ce lead sera déplacé dans la corbeille (récupérable 30 jours) et retiré de la pipeline.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hardDelete}
              onChange={(e) => setHardDelete(e.target.checked)}
              className="h-4 w-4 accent-destructive"
            />
            <span>Supprimer définitivement (purge totale, pas de corbeille)</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteLead.mutate({ id: lead.id, hard: hardDelete }, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    setHardDelete(false);
                    onDeleted?.();
                  },
                });
              }}
            >
              {hardDelete ? 'Supprimer définitivement' : 'Archiver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="overview" className="mt-3 flex min-h-0 flex-1 flex-col">
        <TabsList className={cn('grid w-full', whatsappEnabled ? 'grid-cols-3' : 'grid-cols-2')}>
          <TabsTrigger value="overview" className="gap-1 text-xs">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Détails</span>
          </TabsTrigger>
          {whatsappEnabled && (
            <TabsTrigger value="followup" className="gap-1 text-xs">
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="activities" className="gap-1 text-xs">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activités</span>
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="mt-3 flex-1">
          <div className="space-y-4 pb-6 pr-3">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap gap-2">
                  {lead.phone && whatsappEnabled && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={toWhatsAppUrl(lead.phone)} target="_blank" rel="noopener noreferrer">
                        <Smartphone className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    </Button>
                  )}

                  {lead.phone && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={`tel:${lead.phone}`}>
                        <Phone className="h-3.5 w-3.5" />
                        {formatPhoneDisplay(lead.phone)}
                      </a>
                    </Button>
                  )}

                  {lead.email && (
                    <Button asChild variant="outline" size="sm" className="max-w-full gap-1.5">
                      <a href={`mailto:${lead.email}`} className="truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </a>
                    </Button>
                  )}
                </div>

                <div className="flex gap-2 border-t border-border/50 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </Button>
                </div>
              </div>

              <LeadEditForm lead={lead} inline />

              {lead.message && (
                <div className="rounded-lg border-l-2 border-primary/40 bg-muted/50 p-3">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                    Message initial du lead
                  </p>
                  <p className="text-sm italic">"{lead.message}"</p>
                </div>
              )}

              {(lead.ai_summary || lead.sales_angle || lead.next_action) && (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" /> Analyse IA
                  </h3>

                  {lead.ai_summary && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Résumé</p>
                      <p className="mt-0.5 text-sm">{lead.ai_summary}</p>
                    </div>
                  )}

                  {lead.sales_angle && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Angle de vente</p>
                      <p className="mt-0.5 text-sm">{lead.sales_angle}</p>
                    </div>
                  )}

                  {lead.next_action && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Prochaine action</p>
                      <p className="mt-0.5 text-sm">{lead.next_action}</p>
                      {lead.next_action_date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(lead.next_action_date), 'dd MMM yyyy à HH:mm', { locale: fr })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <LeadQualificationCard leadId={lead.id} />

              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Notes</h3>
                  {notesDirty && (
                    <Button size="sm" onClick={saveNotes} disabled={updateLead.isPending}>
                      {updateLead.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Save className="mr-1 h-3 w-3" />
                          Sauver
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {aiNotesBlock && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      Préparation d'appel par l'IA
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-sm [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_ul]:my-1">
                      <ReactMarkdown>{aiNotesBlock}</ReactMarkdown>
                    </div>
                  </div>
                )}

                <div>
                  {aiNotesBlock && (
                    <p className="mb-1 text-xs text-muted-foreground">Mes notes manuelles</p>
                  )}
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => {
                      setNotesDraft(e.target.value);
                      setNotesDirty(true);
                    }}
                    placeholder="Ajoute tes notes sur ce lead..."
                    rows={5}
                    className="resize-none"
                  />
                </div>
              </div>

              <NaturalLanguageInput leadId={lead.id} lead={lead} />
            </TabsContent>

            {whatsappEnabled && (
              <TabsContent value="followup" className="mt-0">
                <FollowupTimeline leadId={lead.id} leadName={lead.name} />
              </TabsContent>
            )}

            <TabsContent value="activities" className="mt-0">
              <LeadActivityTimeline leadId={lead.id} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
