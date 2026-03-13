import { useLeads, useUpdateLead, type DbLead } from '@/hooks/useLeadData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadDetailContent } from '@/components/LeadDetailContent';
import { useState, useRef } from 'react';
import { Loader2, GripVertical, User, ArrowRight, Search } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type PipelineStage = DbLead['status'];

const STAGES: { key: PipelineStage; label: string; color: string; icon: string }[] = [
  { key: 'new', label: 'Nouveau', color: 'bg-lead-cold/20 border-lead-cold/40 text-lead-cold', icon: '🆕' },
  { key: 'contacted', label: 'Contacté', color: 'bg-lead-warm/20 border-lead-warm/40 text-lead-warm', icon: '📞' },
  { key: 'qualified', label: 'Qualifié', color: 'bg-primary/20 border-primary/40 text-primary', icon: '✅' },
  { key: 'proposal', label: 'Proposition', color: 'bg-[hsl(280,60%,55%)]/20 border-[hsl(280,60%,55%)]/40 text-[hsl(280,60%,65%)]', icon: '📋' },
  { key: 'ghost', label: 'À Relancer', color: 'bg-lead-warm/20 border-lead-warm/40 text-lead-warm', icon: '👻' },
  { key: 'won', label: 'Gagné', color: 'bg-primary/20 border-primary/40 text-primary', icon: '🏆' },
  { key: 'lost', label: 'Perdu', color: 'bg-destructive/20 border-destructive/40 text-destructive', icon: '❌' },
];

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

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx < 5 && dy < 5) {
      onClick(lead);
    }
    pointerStart.current = null;
  };

  const isMobileDevice = useIsMobile();

  return (
    <div
      draggable={!isMobileDevice}
      onDragStart={(e) => onDragStart(e, lead)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={() => { if (isMobileDevice) onClick(lead); }}
      className="group relative rounded-lg border border-border bg-card p-3 cursor-pointer active:cursor-grabbing transition-all hover:border-primary/30 hover:shadow-[0_0_15px_hsl(var(--primary)/0.08)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground line-clamp-1">
            {lead.name}
          </span>
          {lead.company_name && (
            <span className="text-[10px] text-muted-foreground line-clamp-1">{lead.company_name}</span>
          )}
          {lead.message && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{lead.message}</p>
          )}
        </div>
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <LeadScoreBadge score={lead.score} className="text-[10px] px-1.5 py-0" />
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(lead.created_at), 'dd MMM', { locale: fr })}
        </span>
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
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-accent/50 px-2 py-1 text-[10px] text-muted-foreground">
          <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate">{lead.next_action}</span>
        </div>
      )}
    </div>
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
        'flex flex-col rounded-xl border transition-colors',
        isDragOver ? 'border-primary/50 bg-primary/5' : 'border-border bg-background',
        'min-w-[160px] sm:min-w-[220px] flex-1'
      )}
      onDragOver={(e) => onDragOver(e, stage.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage.key)}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{stage.icon}</span>
          <h3 className="text-sm font-medium text-foreground">{stage.label}</h3>
        </div>
        <span className={cn(
          'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold',
          stage.color
        )}>
          {leads.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar p-2" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {leads.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
            Aucun lead
          </div>
        ) : (
          leads.map(lead => (
            <PipelineCard key={lead.id} lead={lead} onDragStart={onDragStart} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: leads = [], isLoading } = useLeads();
  const updateLead = useUpdateLead();
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [scoreFilter, setScoreFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [search, setSearch] = useState('');
  const draggedLead = useRef<DbLead | null>(null);
  const isMobile = useIsMobile();

  const filteredLeads = leads.filter(l => {
    if (scoreFilter !== 'all' && l.score !== scoreFilter) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDragStart = (_e: React.DragEvent, lead: DbLead) => {
    draggedLead.current = lead;
  };

  const handleDragOver = (e: React.DragEvent, stage: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const handleDragLeave = () => setDragOverStage(null);

  const handleDrop = (e: React.DragEvent, newStatus: PipelineStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const lead = draggedLead.current;
    if (!lead || lead.status === newStatus) return;
    const stageLabel = STAGES.find(s => s.key === newStatus)?.label || newStatus;
    updateLead.mutate(
      { id: lead.id, status: newStatus },
      {
        onSuccess: () => toast.success(`${lead.name} déplacé vers "${stageLabel}"`),
        onError: () => toast.error('Erreur lors du déplacement'),
      }
    );
    draggedLead.current = null;
  };

  const leadsByStage = STAGES.reduce((acc, stage) => {
    acc[stage.key] = filteredLeads.filter(l => l.status === stage.key);
    return acc;
  }, {} as Record<PipelineStage, DbLead[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl">Pipeline</h1>
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
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {(['all', 'hot', 'warm', 'cold'] as const).map(f => (
          <button
            key={f}
            onClick={() => setScoreFilter(f)}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              scoreFilter === f
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            )}
          >
            {f === 'all' ? 'Tous' : f === 'hot' ? '🔥' : f === 'warm' ? '🌤' : '❄️'}
          </button>
        ))}
      </div>

      <div className="flex flex-1 gap-2 sm:gap-3 overflow-x-auto custom-scrollbar pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
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
    </div>
  );
}
