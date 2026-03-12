import { mockScripts, mockLeads } from '@/data/mockData';
import { Phone } from 'lucide-react';

export default function ScriptsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Scripts d'appel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scripts personnalisés pour vos sales calls</p>
      </div>

      <div className="space-y-4">
        {mockScripts.map(s => {
          const lead = mockLeads.find(l => l.id === s.leadId);
          return (
            <div key={s.id} className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="font-medium">{lead?.name}</span>
              </div>
              <div className="rounded-lg bg-muted/30 p-4">
                <p className="text-sm whitespace-pre-line">{s.script}</p>
              </div>
              {s.objections.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Objections & Réponses</h3>
                  <div className="space-y-2">
                    {s.objections.map((o, i) => (
                      <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-xs font-medium text-lead-warm">❓ {o.objection}</p>
                        <p className="mt-1 text-sm">→ {o.response}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
