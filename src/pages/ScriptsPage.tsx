import { useAllScripts } from '@/hooks/useLeadData';
import { Phone, Loader2 } from 'lucide-react';

export default function ScriptsPage() {
  const { data: scripts = [], isLoading } = useAllScripts();

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
        <h1 className="font-heading text-3xl">Scripts d'appel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scripts personnalisés pour vos sales calls</p>
      </div>

      {scripts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          Aucun script généré. Ajoutez des leads chauds pour obtenir des scripts.
        </div>
      ) : (
        <div className="space-y-4">
          {scripts.map((s: any) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="font-medium">{s.leads?.name || 'Lead'}</span>
              </div>
              <div className="rounded-lg bg-muted/30 p-4">
                <p className="text-sm whitespace-pre-line">{s.script}</p>
              </div>
              {s.objections?.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Objections & Réponses</h3>
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
    </div>
  );
}
