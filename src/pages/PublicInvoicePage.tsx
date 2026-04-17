import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Download, Receipt, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { generateInvoicePDF, type InvoiceData } from '@/lib/generateInvoicePDF';
import { getLogoBase64 } from '@/lib/logoBase64';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type Status = 'loading' | 'ready' | 'error';

interface InvoiceRecord {
  invoice_number: string;
  amount: number;
  currency: string;
  status: 'sent' | 'paid' | 'overdue';
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  invoice_data: InvoiceData;
}

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    (async () => {
      const { data, error } = await supabase.rpc('get_invoice_by_token' as any, { p_token: token });
      if (error || !data) { setStatus('error'); return; }
      setInvoice(data as unknown as InvoiceRecord);
      setStatus('ready');
    })();
  }, [token]);

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const logo = await getLogoBase64();
      const pdf = generateInvoicePDF(invoice.invoice_data, logo);
      pdf.save(`Facture_${invoice.invoice_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'error' || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-bold">Facture introuvable</h1>
            <p className="text-sm text-muted-foreground">Le lien est invalide ou la facture a été supprimée.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';
  const isOverdue = invoice.status === 'overdue';

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-primary/10 items-center justify-center mb-2">
            <Receipt className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Facture {invoice.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">Digital Launch Agency</p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-5">
            {isPaid && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-sm">
                <CheckCircle className="h-4 w-4" />
                Cette facture a été marquée comme payée{invoice.paid_at && ` le ${format(new Date(invoice.paid_at), 'dd MMM yyyy', { locale: fr })}`}.
              </div>
            )}
            {isOverdue && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 text-sm">
                <AlertCircle className="h-4 w-4" />
                Cette facture est en retard de paiement.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Date d'émission</p>
                <p className="font-medium text-foreground">{format(new Date(invoice.issue_date), 'dd MMM yyyy', { locale: fr })}</p>
              </div>
              {invoice.due_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Échéance</p>
                  <p className="font-medium text-foreground">{format(new Date(invoice.due_date), 'dd MMM yyyy', { locale: fr })}</p>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Montant total</p>
              <p className="text-3xl font-bold text-foreground">{Number(invoice.amount).toFixed(2)} {invoice.currency === 'EUR' ? '€' : invoice.currency}</p>
            </div>

            <Button onClick={handleDownload} disabled={downloading} size="lg" className="w-full gap-2">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Télécharger la facture (PDF)
            </Button>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Pour toute question, contactez-nous à contact@digitallaunch-llc.com
        </p>
      </div>
    </div>
  );
}
