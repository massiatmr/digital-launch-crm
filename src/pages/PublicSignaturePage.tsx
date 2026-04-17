import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import SignaturePad from '@/components/SignaturePad';
import { CheckCircle, AlertCircle, Loader2, FileText, Shield, Download } from 'lucide-react';
import { generateContractPDF, type ContractArticle, type SignatureProof } from '@/lib/generateContractPDF';
import { getLogoBase64 } from '@/lib/logoBase64';
import { getDefaultSignatureBase64 } from '@/lib/signatureBase64';

type Status = 'loading' | 'ready' | 'signing' | 'signed' | 'expired' | 'already_signed' | 'error';

interface ContractSnapshot {
  clientCompany: string;
  clientRepresentant: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  serviceType: 'website' | 'ads';
  setupFee: string;
  managementFee: string;
  recommendedBudget: string;
  contractDate: string;
  customArticles?: ContractArticle[];
  emitterName: string;
  emitterRepresentative: string;
}

export default function PublicSignaturePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [contract, setContract] = useState<ContractSnapshot | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [signatureProof, setSignatureProof] = useState<SignatureProof | null>(null);

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-signature`;

  const handleDownloadSigned = async () => {
    if (!contract) return;
    const logo = await getLogoBase64();
    const proof = signatureProof || (signatureData ? {
      signatureImage: signatureData,
      signedAt: new Date().toISOString(),
    } : undefined);
    const pdf = generateContractPDF(contract, logo, proof);
    pdf.save(`Contrat_signe_${contract.clientCompany || contract.clientRepresentant || 'client'}.pdf`);
  };

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    fetch(`${baseUrl}?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error === 'already_signed') { setStatus('already_signed'); return; }
        if (data.error === 'expired') { setStatus('expired'); return; }
        if (data.error) { setErrorMsg(data.error); setStatus('error'); return; }
        setContract(data.contract);
        setStatus('ready');
      })
      .catch(() => { setErrorMsg('Impossible de charger le contrat'); setStatus('error'); });
  }, [token, baseUrl]);

  const handleSign = async () => {
    if (!signatureData || !token) return;
    setStatus('signing');
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signatureBase64: signatureData }),
      });
      const data = await res.json();
      if (data.error) { setErrorMsg(data.error); setStatus('error'); return; }
      if (data.contract) setContract(data.contract);
      if (data.signature) setSignatureProof(data.signature);
      setStatus('signed');
    } catch {
      setErrorMsg('Erreur lors de la signature');
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'signed') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-10 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Contrat signé !</h1>
            <p className="text-muted-foreground">Votre signature a été enregistrée avec succès. Téléchargez votre exemplaire signé ci-dessous.</p>
            <Button onClick={handleDownloadSigned} className="w-full gap-2 h-11">
              <Download className="h-4 w-4" /> Télécharger mon contrat signé
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60 pt-2">
              <Shield className="h-3.5 w-3.5" />
              Signature horodatée et sécurisée
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'already_signed') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-10 space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Contrat déjà signé</h1>
            <p className="text-muted-foreground">Ce contrat a déjà été signé. Aucune action supplémentaire n'est nécessaire.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'expired' || status === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-10 pb-10 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">
              {status === 'expired' ? 'Lien expiré' : 'Erreur'}
            </h1>
            <p className="text-muted-foreground">
              {status === 'expired'
                ? 'Ce lien de signature a expiré. Veuillez demander un nouveau lien.'
                : errorMsg || 'Une erreur est survenue.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ready — show contract + signature pad
  const articles = contract?.customArticles?.length
    ? contract.customArticles
    : [];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                Contrat de prestation {contract?.serviceType === 'ads' ? 'Meta Ads' : 'Site Web'}
              </h1>
              <p className="text-sm text-muted-foreground">Veuillez lire le contrat puis signer ci-dessous</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Parties */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="font-semibold text-foreground">Parties</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Prestataire</p>
                <p className="text-muted-foreground">{contract?.emitterName}</p>
                <p className="text-muted-foreground">Représenté par {contract?.emitterRepresentative}</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Client</p>
                <p className="text-muted-foreground">{contract?.clientCompany || contract?.clientRepresentant}</p>
                <p className="text-muted-foreground">Représenté par {contract?.clientRepresentant}</p>
                {contract?.clientAddress && <p className="text-muted-foreground">{contract.clientAddress}</p>}
              </div>
            </div>
            {contract?.serviceType === 'ads' && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                {contract.setupFee && <p><span className="text-muted-foreground">Configuration :</span> <span className="font-medium">{contract.setupFee}</span></p>}
                {contract.managementFee && <p><span className="text-muted-foreground">Gestion :</span> <span className="font-medium">{contract.managementFee}</span></p>}
                {contract.recommendedBudget && <p><span className="text-muted-foreground">Budget recommandé :</span> <span className="font-medium">{contract.recommendedBudget}</span></p>}
              </div>
            )}
            {contract?.serviceType === 'website' && contract.setupFee && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p><span className="text-muted-foreground">Prix total :</span> <span className="font-medium">{contract.setupFee}</span></p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Articles */}
        {articles.length > 0 && (
          <Card>
            <CardContent className="pt-6 space-y-5">
              <h2 className="font-semibold text-foreground">Articles du contrat</h2>
              {articles.map((article, i) => (
                <div key={i} className="space-y-1.5">
                  <h3 className="text-sm font-medium text-foreground">{article.title}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {article.content
                      .replace('{budget}', contract?.recommendedBudget || '')
                      .replace('{setupFee}', contract?.setupFee || '')
                      .replace('{managementFee}', contract?.managementFee || '')}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Date */}
        <div className="text-sm text-muted-foreground px-1">
          Fait le : {contract?.contractDate}
        </div>

        {/* Signature */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="font-semibold text-foreground">Votre signature</h2>
            <p className="text-sm text-muted-foreground">
              En signant ci-dessous, vous acceptez les termes du contrat ci-dessus.
            </p>
            <SignaturePad onSignatureChange={setSignatureData} />
            <Button
              onClick={handleSign}
              disabled={!signatureData || status === 'signing'}
              className="w-full h-12 gap-2 text-base"
            >
              {status === 'signing' ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Signature en cours...</>
              ) : (
                <>✍️ Confirmer et signer</>
              )}
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60 pt-2">
              <Shield className="h-3.5 w-3.5" />
              Votre signature sera horodatée avec votre adresse IP
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
