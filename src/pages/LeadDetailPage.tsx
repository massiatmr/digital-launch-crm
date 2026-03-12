import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { LeadDetailContent } from '@/components/LeadDetailContent';
import { useLead } from '@/hooks/useLeadData';

export default function LeadDetailPage() {
  const { id } = useParams();
  const { data: lead, isLoading } = useLead(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Lead introuvable</p>
        <Link to="/leads" className="mt-2 text-sm text-primary hover:underline">Retour aux leads</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <LeadDetailContent leadId={lead.id} />
    </div>
  );
}
