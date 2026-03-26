import { useLeads } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search, Loader2, Clock, Package } from 'lucide-react';
import { toWhatsAppUrl, formatPhoneDisplay } from '@/lib/phone';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ScoreFilter = 'hot' | 'warm' | 'cold' | 'all';

export default function LeadsPage() {
  const { data: leads = [], isLoading } = useLeads();
  const { data: offers = [] } = useOffers();
  const [filter, setFilter] = useState<ScoreFilter>('all');
  const [offerFilter, setOfferFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.score !== filter) return false;
    if (offerFilter !== 'all' && l.offer_id !== offerFilter) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">{leads.length} leads au total</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'Tous' : f === 'hot' ? '🔥 Chauds' : f === 'warm' ? '🌤 Tièdes' : '❄️ Froids'}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              {leads.length === 0 ? (
                <>Aucun lead. <Link to="/leads/new" className="text-primary hover:underline">Ajoutez votre premier lead</Link></>
              ) : 'Aucun lead trouvé'}
            </div>
          ) : (
            filtered.map(lead => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-accent/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{lead.name}</span>
                    {lead.company_name && <span className="text-xs text-muted-foreground">· {lead.company_name}</span>}
                    <LeadScoreBadge score={lead.score} />
                    <LeadStatusBadge status={lead.status} />
                  </div>
                  <p className="mt-1 truncate text-xs sm:text-sm text-muted-foreground">{lead.message}</p>
                  <div className="mt-1 hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{lead.email}</span>
                    {lead.phone && (
                      <a
                        href={toWhatsAppUrl(lead.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                      >
                        {formatPhoneDisplay(lead.phone)}
                      </a>
                    )}
                    <span className="capitalize">{lead.source.replace('_', ' ')}</span>
                  </div>
                </div>
                <span className="ml-4 shrink-0 flex flex-col items-end gap-0.5">
                  {lead.last_contacted_at && (
                    <span className="flex items-center gap-1 text-[10px] text-accent">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(lead.last_contacted_at), { addSuffix: true, locale: fr })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), 'dd MMM', { locale: fr })}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
