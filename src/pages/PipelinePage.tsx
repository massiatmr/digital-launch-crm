import { useLeads, useUpdateLead, type DbLead } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { useCreateClient } from '@/hooks/useClientData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadDetailContent } from '@/components/LeadDetailContent';
import { QuickActionsMenu } from '@/components/QuickActionsMenu';
import { LostReasonDialog } from '@/components/LostReasonDialog';

import { useState, useRef, useMemo } from 'react';
import { Loader2, GripVertical, User, ArrowRight, Search, Package, CalendarDays } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { format, subDays, subMonths, startOfYear, isAfter, isBefore } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
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

type PipelineStage = DbLead['status'];

const STAGES: { key: PipelineStage; label: string; gradient: string; dotColor: string }[] = [
  { key: 'new', label: 'Nouveau', gradient: 'from-blue-500/20 to-blue-600/5', dotColor: 'bg-blue-400' },
  { key: 'contacted', label: 'Contacté', gradient: 'from-amber-500/20 to-amber-600/5', dotColor: 'bg-amber-400' },
  { key: 'qualified', label: 'Qualifié', gradient: 'from-emerald-500/20 to-emerald-600/5', dotColor: 'bg-emerald-400' },
  { key: 'proposal', label: 'Proposition', gradient: 'from-purple-500/20 to-purple-600/5', dotColor: 'bg-purple-400' },
  { key: 'won', label: 'Gagné', gradient: 'from-emerald-500/20 to-emerald-600/5', dotColor: 'bg-emerald-400' },
  { key: 'ghost', label: 'À Relancer', gradient: 'from-amber-500/20 to-amber-600/5', dotColor: 'bg-amber-400' },
  { key: 'lost', label: 'Perdu', gradient: 'from-neutral-500/10 to-neutral-600/5', dotColor: 'bg-neutral-400' },
];

const scoreBarColors: Record<string, string> = {
  hot: 'bg-lead-hot',
  warm: 'bg-lead-warm',
  cold: 'bg-lead-cold',
};

function PipelineCard({
  lead,
  onDragStart,
  onClick,
}: {
  lead: DbLead;
  onDragStart: (e: React.DragEvent, lead: DbLead) => void;
  onClick: (lead: DbLead) => void;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const isMobileDevice = useIsMobile();

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx < 5 && dy < 5) onClick(lead);
    pointerStart.current = null;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: lead.status === 'lost' ? 0.45 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      draggable={!isMobileDevice}
      onDragStart={(e) => onDragStart(e as any, lead)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={() => { if (isMobileDevice) onClick(lead); }}
      className={cn("group relative glass-card-hover cursor-pointer overflow-hidden", lead.status === 'lost' && "grayscale")}
    >
      {/* Score color bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl', scoreBarColors[lead.score])} />

        <div className="p-3.5 pl-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{lead.name}</span>
            {lead.company_name && (
              <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{lead.company_name}</span>
            )}
            {lead.message && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{lead.message}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <QuickActionsMenu lead={lead} />
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <LeadScoreBadge score={lead.score} className="text-[10px] px-1.5 py-0" />
          </div>
          <div className="flex items-center gap-1.5">
            {lead.last_contacted_at && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {(() => {
                  const days = Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / 86400000);
                  if (days === 0) return 'Auj.';
                  return `${days}j`;
                })()}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-mono">
              {format(new Date(lead.created_at), 'dd MMM', { locale: fr })}
            </span>
          </div>
        </div>

        {(lead.email || lead.phone) && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            {lead.phone ? (
              <a
                href={toWhatsAppUrl(lead.phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate text-primary hover:underline"
              >
                {formatPhoneDisplay(lead.phone)}
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
}: {
  stage: typeof STAGES[number];
  leads: DbLead[];
  onDragStart: (e: React.DragEvent, lead: DbLead) => void;
  onDrop: (e: React.DragEvent, status: PipelineStage) => void;
  dragOverStage: PipelineStage | null;
  onDragOver: (e: React.DragEvent, stage: PipelineStage) => void;
  onDragLeave: () => void;
  onCardClick: (lead: DbLead) => void;
}) {
  const isDragOver = dragOverStage === stage.key;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border transition-all duration-200',
        isDragOver ? 'border-primary/40 bg-primary/5 scale-[1.01]' : 'border-border/50 bg-background/50',
        'min-w-[140px] sm:min-w-[200px] flex-1'
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
              <PipelineCard key={lead.id} lead={lead} onDragStart={onDragStart} onClick={onCardClick} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: allLeads = [], isLoading } = useLeads();
  const { data: offers = [] } = useOffers();
  const updateLead = useUpdateLead();
  const createClient = useCreateClient();
  const navigate = useNavigate();
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [offerFilter, setOfferFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [lostDialogLead, setLostDialogLead] = useState<DbLead | null>(null);
  const draggedLead = useRef<DbLead | null>(null);
  const isMobile = useIsMobile();

  type PeriodKey = '7d' | '30d' | '90d' | 'year' | 'all' | 'custom';
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    const now = new Date();
    switch (period) {
      case '7d': return { from: subDays(now, 7), to: now };
      case '30d': return { from: subDays(now, 30), to: now };
      case '90d': return { from: subMonths(now, 3), to: now };
      case 'year': return { from: startOfYear(now), to: now };
      case 'custom': return { from: customFrom || subDays(now, 30), to: customTo || now };
      default: return { from: new Date(0), to: now };
    }
  }, [period, customFrom, customTo]);

  const leads = useMemo(() => {
    if (period === 'all') return allLeads;
    return allLeads.filter(l => {
      const d = new Date(l.created_at);
      return isAfter(d, rangeFrom) && isBefore(d, rangeTo);
    });
  }, [allLeads, period, rangeFrom, rangeTo]);

  const filteredLeads = leads.filter(l => {
    if (offerFilter !== 'all' && l.offer_id !== offerFilter) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
      onError: () => toast.error('Erreur lors du déplacement'),
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

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pipeline</h1>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
          {filteredLeads.length} leads {!isMobile && '· Glissez-déposez pour changer l\'étape'}
        </p>
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
        {([
          { key: 'all' as PeriodKey, label: 'Tout' },
          { key: '7d' as PeriodKey, label: '7j' },
          { key: '30d' as PeriodKey, label: '30j' },
          { key: '90d' as PeriodKey, label: '90j' },
          { key: 'year' as PeriodKey, label: 'Année' },
        ]).map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200',
              period === p.key
                ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.15)]'
                : 'border-border/50 bg-card/80 text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {p.label}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 flex items-center gap-1',
                period === 'custom'
                  ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.15)]'
                  : 'border-border/50 bg-card/80 text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              <CalendarDays className="h-3 w-3" />
              Perso.
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4 flex flex-col gap-2" align="end">
            <span className="text-xs font-medium text-muted-foreground">Du</span>
            <Calendar mode="single" selected={customFrom} onSelect={(d) => { setCustomFrom(d || undefined); setPeriod('custom'); }} locale={fr} />
            <span className="text-xs font-medium text-muted-foreground">Au</span>
            <Calendar mode="single" selected={customTo} onSelect={(d) => { setCustomTo(d || undefined); setPeriod('custom'); }} locale={fr} />
          </PopoverContent>
        </Popover>
      </div>

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
          />
        ))}
      </div>

      <Sheet open={!!selectedLeadId} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <SheetContent side="right" className="sm:max-w-2xl w-full p-6">
          <SheetHeader>
            <SheetTitle className="sr-only">Détails du lead</SheetTitle>
          </SheetHeader>
          {selectedLeadId && <LeadDetailContent leadId={selectedLeadId} />}
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
    </div>
  );
}
