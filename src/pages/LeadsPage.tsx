import { mockLeads } from '@/data/mockData';
import { LeadScoreBadge } from '@/components/LeadScoreBadge';
import { LeadStatusBadge } from '@/components/LeadStatusBadge';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Search } from 'lucide-react';
import { LeadScore } from '@/types/lead';

export default function LeadsPage() {
  const [filter, setFilter] = useState<LeadScore | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = mockLeads.filter(l => {
    if (filter !== 'all' && l.score !== filter) return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mockLeads.length} leads au total</p>
      </div>

      {/* Filters */}
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

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.map(lead => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{lead.name}</span>
                  <LeadScoreBadge score={lead.score} />
                  <LeadStatusBadge status={lead.status} />
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{lead.message}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{lead.email}</span>
                  <span>{lead.phone}</span>
                  <span className="capitalize">{lead.source.replace('_', ' ')}</span>
                </div>
              </div>
              <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                {format(new Date(lead.createdAt), 'dd MMM yyyy', { locale: fr })}
              </span>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">Aucun lead trouvé</div>
          )}
        </div>
      </div>
    </div>
  );
}
