import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Copy, Loader2, Receipt, Clock, CheckCircle, AlertTriangle, ExternalLink, Trash2, Send, Check } from 'lucide-react';
import { toast } from 'sonner';
import { generateInvoicePDF, type InvoiceData } from '@/lib/generateInvoicePDF';
import { getLogoBase64 } from '@/lib/logoBase64';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface InvoiceRow {
  id: string;
  token: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: 'sent' | 'paid' | 'overdue';
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  sent_at: string | null;
  created_at: string;
  invoice_data: any;
}

interface Props {
  clientId: string;
  clientEmail?: string;
  clientName?: string;
  refreshKey?: number;
}

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  sent: { label: 'Envoyée', icon: Clock, cls: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  paid: { label: 'Payée', icon: CheckCircle, cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  overdue: { label: 'En retard', icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

export default function InvoicesHistory({ clientId, clientEmail, clientName, refreshKey }: Props) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Auto-update overdue
    await supabase.rpc('mark_overdue_invoices' as any);
    const { data } = await supabase
      .from('invoices' as any)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setRows((data || []) as unknown as InvoiceRow[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDownload = async (row: InvoiceRow) => {
    setBusy(row.id);
    try {
      const logo = await getLogoBase64();
      const pdf = generateInvoicePDF(row.invoice_data as InvoiceData, logo);
      pdf.save(`Facture_${row.invoice_number}.pdf`);
    } catch (err: any) {
      toast.error(`Erreur PDF : ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleSendEmail = async (row: InvoiceRow) => {
    if (!clientEmail) { toast.error("Pas d'email client"); return; }
    setBusy(row.id);
    try {
      const logo = await getLogoBase64();
      const pdf = generateInvoicePDF(row.invoice_data as InvoiceData, logo);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const publicLink = `${window.location.origin}/invoice/${row.token}`;
      const { error } = await supabase.functions.invoke('send-document-email', {
        body: {
          recipientEmail: clientEmail,
          recipientName: clientName || '',
          subject: `Facture ${row.invoice_number} - Digital Launch`,
          documentBase64: pdfBase64,
          documentName: `Facture_${row.invoice_number}.pdf`,
          message: `Bonjour ${clientName || ''},\n\nVeuillez trouver ci-joint votre facture n° ${row.invoice_number}.\n\nVous pouvez également la consulter et la télécharger ici : ${publicLink}\n\nCordialement,\nDigital Launch Agency`,
        },
      });
      if (error) throw error;
      await supabase.from('invoices' as any).update({ sent_at: new Date().toISOString() } as any).eq('id', row.id);
      toast.success('Facture envoyée par email !');
      load();
    } catch (err: any) {
      toast.error(`Erreur : ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/invoice/${token}`);
    toast.success('Lien copié !');
  };

  const togglePaid = async (row: InvoiceRow) => {
    const newStatus = row.status === 'paid' ? 'sent' : 'paid';
    const { error } = await supabase
      .from('invoices' as any)
      .update({ status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null } as any)
      .eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    toast.success(newStatus === 'paid' ? 'Marquée payée' : 'Marquée non payée');
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette facture ?')) return;
    const { error } = await supabase.from('invoices' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Supprimée');
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
        Aucune facture pour le moment
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(row => {
        const meta = STATUS_META[row.status] || STATUS_META.sent;
        const Icon = meta.icon;
        return (
          <div key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{row.invoice_number}</p>
                  <Badge variant="outline" className={`text-xs gap-1 ${meta.cls}`}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Émise le {format(new Date(row.issue_date), 'dd MMM yyyy', { locale: fr })}
                  {row.due_date && ` • Échéance ${format(new Date(row.due_date), 'dd MMM yyyy', { locale: fr })}`}
                  {row.paid_at && ` • Payée le ${format(new Date(row.paid_at), 'dd MMM yyyy', { locale: fr })}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{Number(row.amount).toFixed(2)} {row.currency === 'EUR' ? '€' : row.currency}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="outline" onClick={() => handleDownload(row)} disabled={busy === row.id} className="h-8 text-xs gap-1">
                {busy === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSendEmail(row)} disabled={busy === row.id || !clientEmail} className="h-8 text-xs gap-1">
                <Send className="h-3 w-3" /> Email
              </Button>
              <Button size="sm" variant="outline" onClick={() => copyLink(row.token)} className="h-8 text-xs gap-1">
                <Copy className="h-3 w-3" /> Lien
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`/invoice/${row.token}`, '_blank')} className="h-8 text-xs gap-1">
                <ExternalLink className="h-3 w-3" /> Voir
              </Button>
              <Button
                size="sm"
                variant={row.status === 'paid' ? 'default' : 'outline'}
                onClick={() => togglePaid(row)}
                className="h-8 text-xs gap-1"
              >
                <Check className="h-3 w-3" /> {row.status === 'paid' ? 'Payée' : 'Marquer payée'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(row.id)} className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive ml-auto">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
