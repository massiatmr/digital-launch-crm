import { useLeadQualification, useForceBookingPush, useRequalify } from "@/hooks/useLeadQualification";
import { Button } from "@/components/ui/button";
import { Loader2, Target, RefreshCw, CalendarPlus, Brain } from "lucide-react";
import { toast } from "sonner";

const URGENCY_LABEL: Record<string, string> = {
  immediate: "🔥 Immédiat",
  weeks: "📅 Quelques semaines",
  months: "🗓️ Quelques mois",
  unclear: "❓ Pas clair",
};
const SIGNAL_LABEL: Record<string, string> = {
  yes: "✅ Oui",
  no: "❌ Non",
  unknown: "❓ Inconnu",
};
const INTENT_BADGE: Record<string, { label: string; className: string }> = {
  ready_to_book: { label: "🎯 Prêt à réserver", className: "bg-green-500/15 text-green-300 border-green-500/40" },
  objection: { label: "⚠️ Objection", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40" },
  not_interested: { label: "🚫 Pas intéressé", className: "bg-red-500/15 text-red-300 border-red-500/40" },
  info_request: { label: "ℹ️ Demande d'info", className: "bg-blue-500/15 text-blue-300 border-blue-500/40" },
  wrong_person: { label: "👤 Mauvaise personne", className: "bg-red-500/15 text-red-300 border-red-500/40" },
  qualification_in_progress: { label: "🔍 En qualification", className: "bg-primary/15 text-primary border-primary/40" },
  unknown: { label: "❔ Inconnu", className: "bg-muted text-muted-foreground border-border" },
};

function bantScore(q: { pain_point?: string; urgency?: string; budget_signal?: string; decision_maker?: string }) {
  let n = 0;
  if (q.pain_point && q.pain_point.length > 3) n++;
  if (q.urgency && q.urgency !== "unclear") n++;
  if (q.budget_signal && q.budget_signal !== "unknown") n++;
  if (q.decision_maker && q.decision_maker !== "unknown") n++;
  return Math.round((n / 4) * 100);
}

export function LeadQualificationCard({ leadId }: { leadId: string }) {
  const { data: q, isLoading } = useLeadQualification(leadId);
  const forceBooking = useForceBookingPush(leadId);
  const requalify = useRequalify(leadId);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  }

  if (!q) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Qualification IA
          </h3>
          <Button size="sm" variant="outline" disabled={requalify.isPending} onClick={() => {
            requalify.mutate(undefined, {
              onSuccess: () => toast.success("Analyse lancée"),
              onError: (e: any) => toast.error(e.message),
            });
          }}>
            {requalify.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
            Analyser
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Aucune qualification pour le moment. Lance l'analyse IA quand tu as au moins 1 réponse du lead.</p>
      </div>
    );
  }

  const score = bantScore(q);
  const intent = INTENT_BADGE[q.intent ?? "unknown"] ?? INTENT_BADGE.unknown;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Qualification IA
        </h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${intent.className}`}>{intent.label}</span>
          <Button size="sm" variant="ghost" disabled={requalify.isPending} onClick={() => {
            requalify.mutate(undefined, {
              onSuccess: () => toast.success("Mis à jour"),
              onError: (e: any) => toast.error(e.message),
            });
          }}>
            {requalify.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">BANT-light</span>
          <span className="font-medium">{score}% qualifié · intérêt {q.interest_level}/100</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${score}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-border/60 p-2">
          <p className="text-muted-foreground">Urgence</p>
          <p className="font-medium">{URGENCY_LABEL[q.urgency] ?? q.urgency}</p>
        </div>
        <div className="rounded border border-border/60 p-2">
          <p className="text-muted-foreground">Budget</p>
          <p className="font-medium">{SIGNAL_LABEL[q.budget_signal] ?? q.budget_signal}</p>
        </div>
        <div className="rounded border border-border/60 p-2">
          <p className="text-muted-foreground">Décideur</p>
          <p className="font-medium">{SIGNAL_LABEL[q.decision_maker] ?? q.decision_maker}</p>
        </div>
        <div className="rounded border border-border/60 p-2">
          <p className="text-muted-foreground">Problème</p>
          <p className="font-medium truncate" title={q.pain_point}>{q.pain_point || "—"}</p>
        </div>
      </div>

      {q.objections?.length > 0 && (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/5 p-2">
          <p className="text-[10px] uppercase tracking-wider text-yellow-400 mb-1">Objections</p>
          <ul className="text-xs space-y-0.5">
            {q.objections.map((o, i) => <li key={i}>• {o}</li>)}
          </ul>
        </div>
      )}

      {q.summary && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-2">{q.summary}</p>
      )}

      <Button
        size="sm"
        className="w-full gap-1.5"
        disabled={forceBooking.isPending}
        onClick={() => {
          forceBooking.mutate(undefined, {
            onSuccess: () => toast.success("Tâche 'proposer RDV' créée — partira au prochain run"),
            onError: (e: any) => toast.error(e.message),
          });
        }}
      >
        {forceBooking.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
        Forcer la prise de RDV
      </Button>
    </div>
  );
}
