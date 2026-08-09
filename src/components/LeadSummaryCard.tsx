import { DbLead } from '@/hooks/useLeadData';
import { useOffers } from '@/hooks/useOfferData';
import { formatPhoneDisplay } from '@/lib/phone';
import { useDefaultCountryCode } from '@/hooks/useWorkspaces';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const SOURCE_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  website: 'Site web',
  google_sheets: 'Google Sheets',
  organic_social: 'Réseaux organic',
  recommendation: 'Recommandation',
  google_my_business: 'Google My Business',
  manual: 'Manuel',
  other: 'Autre',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-sm [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

export function LeadSummaryCard({ lead }: { lead: DbLead }) {
  const { data: offers = [] } = useOffers();
  const cc = useDefaultCountryCode();
  const offerName = offers.find((o) => o.id === lead.offer_id)?.name;

  const rows: { label: string; value: string }[] = [];
  if (lead.company_name) rows.push({ label: 'Entreprise', value: lead.company_name });
  if (lead.phone) rows.push({ label: 'Téléphone', value: formatPhoneDisplay(lead.phone, cc) });
  if (lead.email) rows.push({ label: 'Email', value: lead.email });
  if (offerName) rows.push({ label: 'Offre', value: offerName });
  rows.push({ label: 'Source', value: SOURCE_LABELS[lead.source] || lead.source });
  rows.push({
    label: 'Reçu le',
    value: format(new Date(lead.created_at), 'dd MMM yyyy à HH:mm', { locale: fr }),
  });
  if (lead.next_action) rows.push({ label: 'Prochaine action', value: lead.next_action });
  if (lead.status === 'lost' && lead.lost_reason)
    rows.push({ label: 'Raison perte', value: lead.lost_reason });

  return (
    <div className="w-full min-w-0 max-w-full rounded-xl border border-border/60 bg-card p-3 sm:p-4">
      <h3 className="mb-1 text-sm font-medium">Infos du lead</h3>
      <div>
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}
