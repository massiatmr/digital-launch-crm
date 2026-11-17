import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useSalesReps, repLabel, repInitials } from '@/hooks/useSalesReps';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { useLeads, useUpdateLead, useDeleteLead, type DbLead } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { useCreateClient } from '@/hooks/useClientData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadDetailContent } from '@/components/LeadDetailContent';
import { QuickActionsMenu } from '@/components/QuickActionsMenu';
import { LostReasonDialog } from '@/components/LostReasonDialog';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Loader2, GripVertical, User, ArrowRight, Search, Package, CalendarDays, CheckSquare, X, Trash2, MoveRight, Filter, UserPlus, Flame, Download } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { useDefaultCountryCode } from '@/hooks/useWorkspaces';
import { format, subDays, subMonths, startOfYear, isAfter, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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

type PipelineStage = DbLead['status'];

const STAGES: { key: PipelineStage; label: string; gradient: string; dotColor: string }[] = [
  { key: 'new', label: 'Nouveau', gradient: 'from-blue-500/20 to-blue-600/5', dotColor: 'bg-blue-400' },
  { key: 'contacted', label: 'Contacté', gradient: 'from-amber-500/20 to-amber-600/5', dotColor: 'bg-amber-400' },
  { key: 'qualified', label: 'Qualifié', gradient: 'from-emerald-500/20 to-emerald-600/5', dotColor: 'bg-emerald-400' },
  { key: 'proposal', label: 'Proposition', gradient: 'from-purple-500/20 to-purple-600/5', dotColor: 'bg-purple-400' },
  { key: 'won', label: 'Gagné', gradient: 'from-emerald-500/20 to-emerald-600/5', dotColor: 'bg-emerald-400' },
  { key: 'ghost', label: 'À Relancer', gradient: 'from-slate-500/20 to-slate-600/5', dotColor: 'bg-slate-400' },
  { key: 'lost', label: 'Perdu', gradient: 'from-neutral-500/10 to-neutral-600/5', dotColor: 'bg-neutral-400' },
];

const scoreBarColors: Record<string, string> = {
  hot: 'bg-lead-hot',
  warm: 'bg-lead-warm',
  cold: 'bg-lead-cold',
};

// Persisted filter state
const FILTERS_STORAGE_KEY = 'pipeline_filters_v1';
type PeriodKey = '7d' | '30d' | '90d' | 'year' | 'since_anchor' | 'all' | 'custom';

type PersistedFilters = {
  period: PeriodKey;
  offerFilter: string;
  scoreFilter?: string[];
  customFrom?: string;
  customTo?: string;
};

const loadFilters = (): PersistedFilters => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { period: 'all', offerFilter: 'all' };
};

function PipelineCard({
  lead,
  onDragStart,
  onClick,
  selectionMode,
  selected,
  onToggleSelect,
}: {
  lead: DbLead;
  onDragStart: (e: React.DragEvent, lead: DbLead) => void;
  onClick: (lead: DbLead) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const isMobileDevice = useIsMobile();
  const { data: cardReps = [] } = useSalesReps((lead as any).workspace_id);
  const assignee = cardReps.length > 1 ? cardReps.find(r => r.user_id === (lead as any).assigned_to) : undefined;
  const cc = useDefaultCountryCode();

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx < 5 && dy < 5) {
      if (selectionMode) onToggleSelect(lead.id);
      else onClick(lead);
    }
    pointerStart.current = null;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: lead.status === 'lost' ? 0.45 : lead.status === 'ghost' ? 0.82 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      draggable={!isMobileDevice && !selectionMode}
      onDragStart={(e) => onDragStart(e as any, lead)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={() => { if (isMobileDevice && !selectionMode) onClick(lead); }}
      className={cn(
        "group relative glass-card-hover cursor-pointer overflow-hidden",
        lead.status === 'lost' && "grayscale",
        lead.status === 'ghost' && "saturate-[0.6]",
        lead.status === 'won' && "bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/30 shadow-[0_0_20px_-5px_hsl(152_70%_45%/0.4)]",
        selected && "ring-2 ring-primary border-primary/60",
      )}
    >
      {/* Score color bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', lead.status === 'won' ? 'bg-emerald-400' : scoreBarColors[lead.score])} />

        <div className="p-3.5 pl-4">
        <div className="flex items-start justify-between gap-2">
          {selectionMode && (
            <div onClick={(e) => { e.stopPropagation(); onToggleSelect(lead.id); }} className="pt-0.5">
              <Checkbox checked={selected} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{lead.name}</span>
            {lead.company_name && (
              <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{lead.company_name}</span>
            )}
            {lead.message && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{lead.message}</p>
            )}
          </div>
          {!selectionMode && (
            <div className="flex items-center gap-1">
              <QuickActionsMenu lead={lead} />
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-1.5">
          <LeadScoreBadge score={lead.score} className="text-[10px] px-1.5 py-0" />
          {assignee && (
            <span title={repLabel(assignee.email)} className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold text-primary">
              {repInitials(assignee.email)}
            </span>
          )}
        </div>

        {(lead.email || lead.phone) && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            {lead.phone ? (
              <a
                href={toWhatsAppUrl(lead.phone, cc)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate text-primary hover:underline"
              >
                {formatPhoneDisplay(lead.phone, cc)}
              </a>
            ) : (
              <span className="truncate">{lead.email}</span>
            )}
          </div>
        )}

        {lead.next_action && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-primary/5 border border-primary/10 px-2 py-1 text-[10px] text-muted-foreground">
            <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">{lead.next_action}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PipelineColumn({
  stage,
  leads,
  onDragStart,
  onDrop,
  dragOverStage,
  onDragOver,
  onDragLeave,
  onCardClick,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: {
  stage: typeof STAGES[number];
  leads: DbLead[];
  onDragStart: (e: React.DragEvent, lead: DbLead) => void;
  onDrop: (e: React.DragEvent, status: PipelineStage) => void;
  dragOverStage: PipelineStage | null;
  onDragOver: (e: React.DragEvent, stage: PipelineStage) => void;
  onDragLeave: () => void;
  onCardClick: (lead: DbLead) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const isDragOver = dragOverStage === stage.key;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border transition-all duration-200',
        isDragOver ? 'border-primary/40 bg-primary/5 scale-[1.01]' : 'border-border/50 bg-background/50',
        'min-w-[180px] sm:min-w-[220px] flex-1'
      )}
      onDragOver={(e) => onDragOver(e, stage.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage.key)}
    >
      {/* Gradient header */}
      <div className={cn('flex items-center justify-between rounded-t-xl border-b border-border/50 px-4 py-3 bg-gradient-to-r', stage.gradient)}>
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', stage.dotColor)} />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{stage.label}</h3>
        </div>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-background/50 px-1.5 text-[10px] font-mono font-semibold text-foreground">
          {leads.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar p-2" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <AnimatePresence mode="popLayout">
          {leads.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border/50 py-8 text-xs text-muted-foreground">
              Aucun lead
            </div>
          ) : (
            leads.map(lead => (
              <PipelineCard
                key={lead.id}
                lead={lead}
                onDragStart={onDragStart}
                onClick={onCardClick}
                selectionMode={selectionMode}
                selected={selectedIds.has(lead.id)}
                onToggleSelect={onToggleSelect}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { user: authUser } = useAuth();
  const pipelineWsId = useCurrentWorkspaceId();
  const { data: reps = [] } = useSalesReps(pipelineWsId);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() => { try { return localStorage.getItem('pipeline_assignee_filter') || 'all'; } catch { return 'all'; } });
  useEffect(() => { try { localStorage.setItem('pipeline_assignee_filter', assigneeFilter); } catch {} }, [assigneeFilter]);
  const { data: allLeads = [], isLoading, isError: isLeadsError, error: leadsError } = useLeads();
  const { data: offers = [], isError: isOffersError, error: offersError } = useOffers();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const createClient = useCreateClient();
  const navigate = useNavigate();
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lostDialogLead, setLostDialogLead] = useState<DbLead | null>(null);
  const draggedLead = useRef<DbLead | null>(null);
  const isMobile = useIsMobile();

  // Persisted filters
  const initial = useMemo(() => loadFilters(), []);
  const [period, setPeriod] = useState<PeriodKey>(initial.period);
  const [offerFilter, setOfferFilter] = useState<string>(initial.offerFilter);
  const [scoreFilter, setScoreFilter] = useState<string[]>(Array.isArray(initial.scoreFilter) ? initial.scoreFilter : []);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(initial.customFrom ? new Date(initial.customFrom) : undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(initial.customTo ? new Date(initial.customTo) : undefined);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        period,
        offerFilter,
        scoreFilter,
        customFrom: customFrom?.toISOString(),
        customTo: customTo?.toISOString(),
      }));
    } catch {}
  }, [period, offerFilter, scoreFilter, customFrom, customTo]);

  const ANCHOR_STORAGE_KEY = 'dashboard_anchor_date';
  const DEFAULT_ANCHOR = new Date(2026, 3, 14);
  const loadAnchor = (): Date => {
    try {
      const stored = localStorage.getItem(ANCHOR_STORAGE_KEY);
      if (stored) {
        const d = new Date(stored);
        if (!isNaN(d.getTime())) return d;
      }
    } catch {}
    return DEFAULT_ANCHOR;
  };
  const [anchorDate, setAnchorDate] = useState<Date>(() => loadAnchor());

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const handleSaveAnchor = (d: Date | undefined) => {
    if (!d) return;
    setAnchorDate(d);
    try { localStorage.setItem(ANCHOR_STORAGE_KEY, d.toISOString()); } catch {}
    setPeriod('since_anchor');
  };

  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    const now = new Date();
    switch (period) {
      case '7d': return { from: subDays(now, 7), to: now };
      case '30d': return { from: subDays(now, 30), to: now };
      case '90d': return { from: subMonths(now, 3), to: now };
      case 'year': return { from: startOfYear(now), to: now };
      case 'since_anchor': return { from: anchorDate, to: now };
      case 'custom': return { from: customFrom || subDays(now, 30), to: customTo || now };
      default: return { from: new Date(0), to: now };
    }
  }, [period, customFrom, customTo, anchorDate]);

  const leads = useMemo(() => {
    if (period === 'all') return allLeads;
    return allLeads.filter(l => {
      const d = new Date(l.created_at);
      return isAfter(d, rangeFrom) && isBefore(d, rangeTo);
    });
  }, [allLeads, period, rangeFrom, rangeTo]);

  const filteredLeads = leads.filter(l => {
    if (offerFilter !== 'all' && l.offer_id !== offerFilter) return false;
    if (scoreFilter.length > 0 && !scoreFilter.includes(l.score)) return false;
    if (reps.length > 1 && assigneeFilter !== 'all') {
      const a = (l as any).assigned_to || null;
      if (assigneeFilter === 'mine' ? a !== authUser?.id : assigneeFilter === 'none' ? a !== null : a !== assigneeFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');
      const phoneDigits = (l.phone || '').replace(/\D/g, '');
      const matchName = l.name?.toLowerCase().includes(q);
      const matchCompany = (l.company_name || '').toLowerCase().includes(q);
      const matchEmail = (l.email || '').toLowerCase().includes(q);
      const matchPhone = qDigits.length >= 3 && phoneDigits.includes(qDigits);
      if (!matchName && !matchCompany && !matchEmail && !matchPhone) return false;
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filteredLeads.map(l => l.id)));
  };

  const bulkChangeStage = async (newStatus: PipelineStage) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const stageLabel = STAGES.find(s => s.key === newStatus)?.label || newStatus;
    let ok = 0, ko = 0;
    await Promise.all(ids.map(id => new Promise<void>(resolve => {
      updateLead.mutate({ id, status: newStatus } as any, {
        onSuccess: () => { ok++; resolve(); },
        onError: () => { ko++; resolve(); },
      });
    })));
    toast.success(`${ok} lead(s) → "${stageLabel}"${ko ? ` · ${ko} échec(s)` : ''}`);
    exitSelection();
  };

  const queryClient = useQueryClient();
  const bulkUpdate = async (patch: Record<string, any>, label: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const { error } = await supabase.from('leads').update(patch as any).in('id', ids);
    if (error) { toast.error(`Échec : ${error.message}`); return; }
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
    toast.success(`${ids.length} lead(s) ${label}`);
    exitSelection();
  };

  const bulkExport = () => {
    const rows = allLeads.filter(l => selectedIds.has(l.id));
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nom', 'Entreprise', 'Téléphone', 'Email', 'Étape', 'Score', 'Commercial', 'Créé le'];
    const csv = [header.map(esc).join(';'), ...rows.map(l => [
      l.name, l.company_name, l.phone, l.email, STAGES.find(s => s.key === l.status)?.label || l.status, l.score,
      repLabel(reps.find(r => r.user_id === (l as any).assigned_to)?.email), format(new Date(l.created_at), 'dd/MM/yyyy'),
    ].map(esc).join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `leads-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let ok = 0, ko = 0;
    await Promise.all(ids.map(id => new Promise<void>(resolve => {
      deleteLead.mutate(id, {
        onSuccess: () => { ok++; resolve(); },
        onError: () => { ko++; resolve(); },
      });
    })));
    toast.success(`${ok} lead(s) supprimé(s)${ko ? ` · ${ko} échec(s)` : ''}`);
    setBulkDeleteOpen(false);
    exitSelection();
  };

  const handleDragStart = (_e: React.DragEvent, lead: DbLead) => { draggedLead.current = lead; };
  const handleDragOver = (e: React.DragEvent, stage: PipelineStage) => { e.preventDefault(); setDragOverStage(stage); };
  const handleDragLeave = () => setDragOverStage(null);

  const handleDrop = (e: React.DragEvent, newStatus: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const lead = draggedLead.current;
    if (!lead || lead.status === newStatus) return;
    
    if (newStatus === 'lost') {
      setLostDialogLead(lead);
      draggedLead.current = null;
      return;
    }
    
    applyStatusChange(lead, newStatus);
    draggedLead.current = null;
  };

  const applyStatusChange = (lead: DbLead, newStatus: PipelineStage, lostReason?: string) => {
    const stageLabel = STAGES.find(s => s.key === newStatus)?.label || newStatus;
    const updates: any = { id: lead.id, status: newStatus };
    if (lostReason) updates.lost_reason = lostReason;
    
    updateLead.mutate(updates, {
      onSuccess: () => {
        toast.success(`${lead.name} → "${stageLabel}"`);
        if (newStatus === 'won') {
          createClient.mutate({
            name: lead.name,
            company_name: lead.company_name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            whatsapp: lead.phone || '',
            website: '',
            offer_id: lead.offer_id || null,
            status: 'signe' as any,
            notes: [lead.notes, lead.message, lead.ai_summary, lead.sales_angle].filter(Boolean).join('\n\n') || '',
          } as any, {
            onSuccess: (data: any) => {
              toast.success(`Client "${lead.name}" créé automatiquement`, {
                action: { label: 'Voir', onClick: () => navigate(`/clients/${data.id}`) },
              });
            },
          });
        }
      },
      onError: (err: any) => {
        console.error('[Pipeline] move error', err);
        toast.error(`Erreur: ${err?.message || 'déplacement échoué'}`);
      },
    });
  };

  const leadsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.key] = filteredLeads.filter(l => l.status === stage.key);
    return acc;
  }, {} as Record<PipelineStage, DbLead[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Chargement...</span>
        </div>
      </div>
    );
  }

  if (isLeadsError || isOffersError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-sm font-medium text-foreground">Impossible de charger la pipeline</span>
          <span className="max-w-md text-sm text-muted-foreground">
            {String(leadsError?.message || offersError?.message || 'La connexion au backend a échoué.')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            {filteredLeads.length} leads {!isMobile && !selectionMode && '· Glissez-déposez pour changer l\'étape'}
          </p>
        </div>
        <Button
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => { if (selectionMode) exitSelection(); else setSelectionMode(true); }}
        >
          {selectionMode ? <><X className="h-3.5 w-3.5" />Quitter</> : <><CheckSquare className="h-3.5 w-3.5" />Sélectionner</>}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
        </div>
        {offers.length > 0 && (
          <Select value={offerFilter} onValueChange={setOfferFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs border-border/50 bg-card/80">
              <Package className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Toutes les offres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les offres</SelectItem>
              {offers.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'h-9 rounded-lg border px-2.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                scoreFilter.length > 0
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border/50 bg-card/80 text-muted-foreground hover:text-foreground'
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Score
              {scoreFilter.length > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {scoreFilter.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Score du prospect</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {([['hot', '🔥 Chaud'], ['warm', '🌤 Tiède'], ['cold', '❄️ Froid']] as const).map(([s, label]) => {
              const on = scoreFilter.includes(s);
              return (
                <DropdownMenuItem
                  key={s}
                  onSelect={(e) => e.preventDefault()}
                  onClick={() => setScoreFilter(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                  className="text-xs"
                >
                  <Checkbox checked={on} className="mr-2" />
                  {label}
                </DropdownMenuItem>
              );
            })}
            {scoreFilter.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setScoreFilter([])} className="text-xs text-muted-foreground">
                  <X className="h-3.5 w-3.5 mr-2" />Tout afficher
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {reps.length > 1 && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs border-border/50 bg-card/80">
              <User className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les leads</SelectItem>
              <SelectItem value="mine">Mes leads</SelectItem>
              <SelectItem value="none">Non assignés</SelectItem>
              {reps.map(r => <SelectItem key={r.user_id} value={r.user_id}>{repLabel(r.email)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[170px] h-9 text-xs border-border/50 bg-card/80">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tout</SelectItem>
            <SelectItem value="7d">7 jours</SelectItem>
            <SelectItem value="30d">30 jours</SelectItem>
            <SelectItem value="90d">Trimestre</SelectItem>
            <SelectItem value="year">Année</SelectItem>
            <SelectItem value="since_anchor">Depuis {format(anchorDate, 'dd MMM yyyy', { locale: fr })}</SelectItem>
            <SelectItem value="custom">Personnalisé</SelectItem>
          </SelectContent>
        </Select>
        {period === 'since_anchor' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs border-border/50 bg-card/80">
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                {format(anchorDate, 'dd MMM yyyy', { locale: fr })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={anchorDate}
                onSelect={handleSaveAnchor}
                locale={fr}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        )}
        {period === 'custom' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs border-border/50 bg-card/80">
                {customFrom ? format(customFrom, 'dd/MM', { locale: fr }) : 'Du'} — {customTo ? format(customTo, 'dd/MM', { locale: fr }) : 'Au'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4 flex flex-col gap-2" align="end">
              <span className="text-xs font-medium text-muted-foreground">Du</span>
              <Calendar mode="single" selected={customFrom} onSelect={(d) => setCustomFrom(d || undefined)} locale={fr} />
              <span className="text-xs font-medium text-muted-foreground">Au</span>
              <Calendar mode="single" selected={customTo} onSelect={(d) => setCustomTo(d || undefined)} locale={fr} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectionMode && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 backdrop-blur-sm px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllVisible}>
            Tout sélectionner ({filteredLeads.length})
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Effacer
          </Button>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-7 text-xs gap-1.5" disabled={selectedIds.size === 0}>
                <MoveRight className="h-3.5 w-3.5" />
                Changer d'étape
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Déplacer vers</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STAGES.map(s => (
                <DropdownMenuItem
                  key={s.key}
                  className="text-xs gap-2"
                  onClick={() => {
                    if (s.key === 'lost') {
                      // Bulk lost without reason dialog for simplicity
                      bulkChangeStage('lost');
                    } else {
                      bulkChangeStage(s.key);
                    }
                  }}
                >
                  <span className={cn('h-2 w-2 rounded-full', s.dotColor)} />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {reps.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-7 text-xs gap-1.5" disabled={selectedIds.size === 0}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Assigner
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Assigner à</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {reps.map(r => (
                  <DropdownMenuItem key={r.user_id} className="text-xs gap-2" onClick={() => bulkUpdate({ assigned_to: r.user_id }, `assigné(s) à ${repLabel(r.email)}`)}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold text-primary">{repInitials(r.email)}</span>
                    {repLabel(r.email)}{r.user_id === authUser?.id ? ' (moi)' : ''}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs" onClick={() => bulkUpdate({ assigned_to: null }, 'désassigné(s)')}>Retirer l'assignation</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={selectedIds.size === 0}>
                <Flame className="h-3.5 w-3.5" />
                Score
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs" onClick={() => bulkUpdate({ score: 'hot' }, '→ 🔥 Chaud')}>🔥 Chaud</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => bulkUpdate({ score: 'warm' }, '→ 🌤 Tiède')}>🌤 Tiède</DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => bulkUpdate({ score: 'cold' }, '→ ❄️ Froid')}>❄️ Froid</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {offers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={selectedIds.size === 0}>
                  <Package className="h-3.5 w-3.5" />
                  Offre
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {offers.map((o: any) => (
                  <DropdownMenuItem key={o.id} className="text-xs" onClick={() => bulkUpdate({ offer_id: o.id }, `→ offre ${o.name}`)}>{o.name}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs" onClick={() => bulkUpdate({ offer_id: null }, 'sans offre')}>Aucune offre</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={selectedIds.size === 0} onClick={bulkExport}>
            <Download className="h-3.5 w-3.5" />
            Exporter
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={selectedIds.size === 0}
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer
          </Button>
        </div>
      )}

      <div className="flex flex-1 gap-2 sm:gap-3 overflow-x-auto custom-scrollbar pb-4 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ touchAction: 'pan-x' }}>
        {STAGES.map(stage => (
          <PipelineColumn
            key={stage.key}
            stage={stage}
            leads={leadsByStage[stage.key] || []}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            dragOverStage={dragOverStage}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onCardClick={(lead) => setSelectedLeadId(lead.id)}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      <Sheet open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <SheetContent side="right" className="w-full max-w-full sm:max-w-2xl p-4 sm:p-6">
          <SheetHeader>
            <SheetTitle className="sr-only">Détails du lead</SheetTitle>
          </SheetHeader>
          {selectedLeadId && <LeadDetailContent leadId={selectedLeadId} onDeleted={() => setSelectedLeadId(null)} />}
        </SheetContent>
      </Sheet>

      <LostReasonDialog
        open={!!lostDialogLead}
        onConfirm={(reason) => {
          if (lostDialogLead) applyStatusChange(lostDialogLead, 'lost', reason);
          setLostDialogLead(null);
        }}
        onCancel={() => setLostDialogLead(null)}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedIds.size} lead(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action déplace les leads dans la corbeille. Vous pourrez les restaurer depuis Paramètres &gt; Corbeille.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
