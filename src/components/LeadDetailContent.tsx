import { useEffect, useState } from 'react';
import { useLead, useDeleteLead, useUpdateLead } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput';
import { LeadActivityTimeline } from '@/components/LeadActivityTimeline';
import { LeadTasksSection } from '@/components/LeadTasksSection';
import { LeadBookingsSection } from '@/components/LeadBookingsSection';
import { LeadEditForm } from '@/components/LeadEditForm';
import { FollowupTimeline } from '@/components/FollowupTimeline';
import { LeadQualificationCard } from '@/components/LeadQualificationCard';
import { CreateTaskForLeadDialog } from '@/components/CreateTaskForLeadDialog';
import { LeadSummaryCard } from '@/components/LeadSummaryCard';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';
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
  Merge,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { MergeLeadDialog } from '@/components/MergeLeadDialog';
import { ShowStatusToggle } from '@/components/ShowStatusToggle';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { useDefaultCountryCode } from '@/hooks/useWorkspaces';
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
  const [mergeOpen, setMergeOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);

  const { data: lead, isLoading } = useLead(leadId);
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();
  const { isEnabled } = useWorkspaceFeatures();
  const whatsappEnabled = isEnabled('whatsapp');
  const cc = useDefaultCountryCode();

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
    <div className="flex h-[100dvh] sm:h-[calc(100vh-80px)] min-w-0 max-w-full flex-col overflow-x-hidden">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 pb-3 pr-10 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="font-heading truncate text-base sm:text-lg">{lead.name}</h2>
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
        <TabsList className={cn('grid w-full gap-1', whatsappEnabled ? 'grid-cols-3' : 'grid-cols-2')}>
          <TabsTrigger value="overview" className="gap-1 text-[11px] sm:text-xs">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Détails</span>
          </TabsTrigger>
          {whatsappEnabled && (
            <TabsTrigger value="followup" className="gap-1 text-[11px] sm:text-xs">
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="activities" className="gap-1 text-[11px] sm:text-xs">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activité & tâches</span>
          </TabsTrigger>
        </TabsList>


        <ScrollArea className="mt-3 flex-1">
          <div className="space-y-4 pb-40 sm:pb-6 pr-2 sm:pr-3 pl-px" style={{ paddingBottom: 'max(10rem, calc(env(safe-area-inset-bottom) + 8rem))' }}>
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                {lead.phone && whatsappEnabled && (
                  <Button asChild size="lg" className="min-h-12 w-full justify-center gap-2 text-base sm:h-10 sm:w-auto sm:text-sm">
                    <a href={toWhatsAppUrl(lead.phone, cc)} target="_blank" rel="noopener noreferrer">
                      <Smartphone className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </Button>
                )}

                {lead.phone && (
                  <Button asChild variant="outline" size="lg" className="min-h-12 w-full justify-center gap-2 text-base sm:h-10 sm:w-auto sm:text-sm">
                    <a href={`tel:${lead.phone}`}>
                      <Phone className="h-4 w-4" />
                      Appeler
                    </a>
                  </Button>
                )}

                {lead.email && (
                  <Button asChild variant="outline" size="lg" className="min-h-12 w-full max-w-full justify-center gap-2 text-base sm:h-10 sm:w-auto sm:text-sm">
                    <a href={`mailto:${lead.email}`} className="min-w-0 truncate">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">Email</span>
                    </a>
                  </Button>
                )}
              </div>

              <LeadSummaryCard lead={lead} />

              {lead.message && (
                <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border-l-2 border-primary/40 bg-muted/50 p-3">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                    Ce qu'il a écrit (formulaire)
                  </p>
                  <pre className="w-full min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] break-words font-sans text-xs sm:text-sm italic">"{lead.message}"</pre>
                </div>
              )}

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
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 overflow-hidden">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      Préparation d'appel par l'IA
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none text-sm break-words [&_*]:min-w-0 [&_a]:break-all [&_code]:break-all [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_ul]:my-1">
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
                    className="resize-none text-base sm:text-sm"
                  />
                </div>
              </div>

              {(lead.ai_summary || lead.sales_angle || lead.next_action) && (
                <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <CollapsibleTrigger asChild>
                      <button type="button" className="flex w-full items-center justify-between gap-2 text-left">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Sparkles className="h-4 w-4 text-primary" /> Analyse IA
                        </span>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', aiOpen && 'rotate-180')} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
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
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              <LeadQualificationCard leadId={lead.id} />

              <Collapsible open={editOpen} onOpenChange={setEditOpen}>
                {!editOpen && (
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="min-h-12 w-full justify-center gap-2 text-base sm:text-sm">
                      <Pencil className="h-4 w-4" />
                      Modifier ce lead
                    </Button>
                  </CollapsibleTrigger>
                )}
                <CollapsibleContent>
                  <LeadEditForm lead={lead} inline />
                </CollapsibleContent>
              </Collapsible>

              <NaturalLanguageInput leadId={lead.id} lead={lead} />

              <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10 gap-1.5"
                  onClick={() => setMergeOpen(true)}
                >
                  <Merge className="h-3.5 w-3.5" />
                  Fusionner
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>

              <MergeLeadDialog
                open={mergeOpen}
                onOpenChange={setMergeOpen}
                currentLeadId={lead.id}
                currentLeadName={lead.name}
                workspaceId={(lead as any).workspace_id ?? null}
                onMerged={(keptId) => {
                  if (keptId !== lead.id) onDeleted?.();
                }}
              />
            </TabsContent>


            {whatsappEnabled && (
              <TabsContent value="followup" className="mt-0">
                <FollowupTimeline leadId={lead.id} leadName={lead.name} />
              </TabsContent>
            )}

            <TabsContent value="activities" className="mt-0 space-y-4">
              <LeadTasksSection leadId={lead.id} leadName={lead.name} />
              <LeadBookingsSection leadId={lead.id} />
              <LeadActivityTimeline leadId={lead.id} />

            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
