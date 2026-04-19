import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLead, useLeadMessages, useLeadScripts, useDeleteLead, useUpdateLead } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { NaturalLanguageInput } from '@/components/NaturalLanguageInput';
import { LeadActivityTimeline } from '@/components/LeadActivityTimeline';
import { LeadEditForm } from '@/components/LeadEditForm';
import { FollowupTimeline } from '@/components/FollowupTimeline';
import {
  Mail, Phone, Smartphone, Loader2, ExternalLink,
  Pencil, Trash2, Sparkles, Activity, LayoutGrid, Building2, Save, MoreVertical,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ShowStatusToggle } from '@/components/ShowStatusToggle';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function LeadDetailContent({ leadId }: { leadId: string }) {
  const [editing, setEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(leadId);
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();

  useEffect(() => {
    if (lead && !notesDirty) setNotesDraft(lead.notes ?? '');
  }, [lead?.notes, notesDirty]);

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

  const saveNotes = async () => {
    await updateLead.mutateAsync({ id: lead.id, notes: notesDraft });
    setNotesDirty(false);
    toast.success('Notes sauvegardées');
  };

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col">
      {/* Compact Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-heading text-lg truncate">{lead.name}</h2>
              <LeadScoreBadge score={lead.score} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <LeadStatusBadge status={lead.status} />
              {lead.company_name && (
                <span className="flex items-center gap-1 truncate">
                  <Building2 className="h-3 w-3" />{lead.company_name}
                </span>
              )}
              <span className="capitalize">· {lead.source.replace('_', ' ')}</span>
              <span>· {format(new Date(lead.created_at), "dd MMM", { locale: fr })}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ShowStatusToggle leadId={lead.id} currentStatus={lead.show_status} size="sm" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {lead.phone && (
                  <DropdownMenuItem asChild>
                    <a href={toWhatsAppUrl(lead.phone)} target="_blank" rel="noopener noreferrer" className="cursor-pointer">
                      <Smartphone className="h-4 w-4 mr-2" />WhatsApp
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  </DropdownMenuItem>
                )}
                {lead.phone && (
                  <DropdownMenuItem asChild>
                    <a href={`tel:${lead.phone}`} className="cursor-pointer">
                      <Phone className="h-4 w-4 mr-2" />{formatPhoneDisplay(lead.phone)}
                    </a>
                  </DropdownMenuItem>
                )}
                {lead.email && (
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${lead.email}`} className="cursor-pointer">
                      <Mail className="h-4 w-4 mr-2" /><span className="truncate">{lead.email}</span>
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4 mr-2" />Modifier
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
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

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0 mt-3">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="overview" className="text-xs gap-1">
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Détails</span>
          </TabsTrigger>
          <TabsTrigger value="followup" className="text-xs gap-1">
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="activities" className="text-xs gap-1">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activités</span>
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 mt-3">
          <div className="pr-3 pb-6">
            <TabsContent value="overview" className="mt-0 space-y-4">
              {/* Message initial */}
              {lead.message && (
                <div className="rounded-lg bg-muted/50 p-3 border-l-2 border-primary/40">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Message initial du lead</p>
                  <p className="text-sm italic">"{lead.message}"</p>
                </div>
              )}

              {/* Analyse IA */}
              {(lead.ai_summary || lead.sales_angle || lead.next_action) && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Analyse IA
                  </h3>
                  {lead.ai_summary && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Résumé</p>
                      <p className="text-sm mt-0.5">{lead.ai_summary}</p>
                    </div>
                  )}
                  {lead.sales_angle && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Angle de vente</p>
                      <p className="text-sm mt-0.5">{lead.sales_angle}</p>
                    </div>
                  )}
                  {lead.next_action && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Prochaine action</p>
                      <p className="text-sm mt-0.5">{lead.next_action}</p>
                      {lead.next_action_date && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(lead.next_action_date), "dd MMM yyyy à HH:mm", { locale: fr })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notes éditables */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Notes</h3>
                  {notesDirty && (
                    <Button size="sm" onClick={saveNotes} disabled={updateLead.isPending}>
                      {updateLead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Save className="h-3 w-3 mr-1" />Sauver</>}
                    </Button>
                  )}
                </div>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                  placeholder="Ajoute tes notes sur ce lead..."
                  rows={6}
                  className="resize-none"
                />
              </div>

              {/* Input langage naturel */}
              <NaturalLanguageInput leadId={lead.id} lead={lead} />
            </TabsContent>

            <TabsContent value="followup" className="mt-0">
              <FollowupTimeline leadId={lead.id} />
            </TabsContent>

            <TabsContent value="activities" className="mt-0">
              <LeadActivityTimeline leadId={lead.id} />
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
