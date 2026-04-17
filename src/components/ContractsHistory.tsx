import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Copy, Loader2, FileSignature, Clock, CheckCircle, XCircle, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateContractPDF, type ContractData, type SignatureProof } from '@/lib/generateContractPDF';
import { getLogoBase64 } from '@/lib/logoBase64';
import { getDefaultSignatureBase64 } from '@/lib/signatureBase64';

interface SignatureRow {
  id: string;
  token: string;
  status: string;
  signed_at: string | null;
  created_at: string;
  expires_at: string;
  signature_image: string | null;
  signer_ip: string | null;
  contract_data: any;
}

interface Props {
  clientId: string;
  refreshKey?: number;
}

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: 'En attente', icon: Clock, cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  signed: { label: 'Signé', icon: CheckCircle, cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  expired: { label: 'Expiré', icon: XCircle, cls: 'bg-muted text-muted-foreground border-border' },
};

export default function ContractsHistory({ clientId, refreshKey }: Props) {
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contract_signatures')
      .select('id, token, status, signed_at, created_at, expires_at, signature_image, signer_ip, contract_data')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    setRows((data || []) as SignatureRow[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDownload = async (row: SignatureRow) => {
    setDownloading(row.id);
    try {
      const [logo, providerSig] = await Promise.all([getLogoBase64(), getDefaultSignatureBase64()]);
      const proof: SignatureProof | undefined = row.signature_image && row.signed_at ? {
        signatureImage: row.signature_image,
        signedAt: row.signed_at,
        signerIp: row.signer_ip || undefined,
      } : undefined;
      const pdf = generateContractPDF(row.contract_data as ContractData, logo, proof, providerSig);
      const suffix = row.status === 'signed' ? 'signe' : 'brouillon';
      const name = row.contract_data?.clientCompany || row.contract_data?.clientRepresentant || 'client';
      pdf.save(`Contrat_${suffix}_${name}.pdf`);
    } catch (err: any) {
      toast.error(`Erreur PDF : ${err.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
    toast.success('Lien copié !');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette demande de contrat ?')) return;
    const { error } = await supabase.from('contract_signatures').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Supprimé');
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Aucun contrat envoyé pour ce client.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(row => {
        const meta = STATUS_META[row.status] || STATUS_META.pending;
        const Icon = meta.icon;
        const serviceLabel = row.contract_data?.serviceType === 'ads' ? 'Meta Ads' : 'Site Web';
        return (
          <div key={row.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FileSignature className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm text-foreground truncate">Contrat {serviceLabel}</p>
                <Badge variant="outline" className={`text-xs gap-1 ${meta.cls}`}>
                  <Icon className="h-3 w-3" /> {meta.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {row.status === 'signed' && row.signed_at
                  ? `Signé le ${new Date(row.signed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : `Envoyé le ${new Date(row.created_at).toLocaleDateString('fr-FR')} — Expire le ${new Date(row.expires_at).toLocaleDateString('fr-FR')}`}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {row.status === 'pending' && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => copyLink(row.token)} className="h-8 gap-1 text-xs">
                    <Copy className="h-3.5 w-3.5" /> Lien
                  </Button>
                  <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                    <a href={`/sign/${row.token}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(row)}
                disabled={downloading === row.id}
                className="h-8 gap-1 text-xs"
              >
                {downloading === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="h-8 px-2 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
