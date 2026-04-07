import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Send, Check, Loader2, Building2, FileSignature, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { generateContractPDF, type ContractData } from '@/lib/generateContractPDF';
import { supabase } from '@/integrations/supabase/client';
import logoUrl from '@/assets/logo.webp';
import type { BillingInfo } from './InvoiceGenerator';

interface Props {
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  offerName?: string;
  billingInfo?: BillingInfo;
  onBillingInfoChange?: (info: BillingInfo) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export default function ContractGenerator({ clientName, clientCompany, clientEmail, clientPhone, offerName, billingInfo, onBillingInfoChange }: Props) {
  const defaultServiceType = offerName?.toLowerCase().includes('ads') || offerName?.toLowerCase().includes('pub') ? 'ads' : 'website';

  const [serviceType, setServiceType] = useState<'website' | 'ads'>(billingInfo?.serviceType === 'ads' || billingInfo?.serviceType === 'website' ? billingInfo.serviceType : defaultServiceType);
  const [clientCompanyField, setClientCompanyField] = useState(billingInfo?.clientCompany || clientCompany);
  const [clientRepresentant, setClientRepresentant] = useState(billingInfo?.clientRepresentant || clientName);
  const [clientAddress, setClientAddress] = useState(billingInfo?.clientAddress || '');
  const [clientEmailField, setClientEmailField] = useState(clientEmail);
  const [clientPhoneField, setClientPhoneField] = useState(clientPhone);
  const [clientSiret, setClientSiret] = useState(billingInfo?.clientSiret || '');
  const [setupFee, setSetupFee] = useState(billingInfo?.setupFee || '');
  const [managementFee, setManagementFee] = useState(billingInfo?.managementFee || '');
  const [recommendedBudget, setRecommendedBudget] = useState(billingInfo?.recommendedBudget || '');
  const [contractDate, setContractDate] = useState(new Date().toLocaleDateString('fr-FR'));
  const [sending, setSending] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const isFirstRender = useRef(true);

  useEffect(() => {
    fetch(logoUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      });
  }, []);

  // Silent auto-save
  const saveBillingInfo = useCallback(() => {
    setSaveStatus('saving');
    onBillingInfoChange?.({
      ...billingInfo,
      clientCompany: clientCompanyField,
      clientRepresentant,
      clientAddress,
      clientSiret,
      setupFee,
      managementFee,
      recommendedBudget,
    });
    setTimeout(() => setSaveStatus('saved'), 400);
    setTimeout(() => setSaveStatus('idle'), 2500);
  }, [clientCompanyField, clientRepresentant, clientAddress, clientSiret, setupFee, managementFee, recommendedBudget, onBillingInfoChange, billingInfo]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(saveBillingInfo, 2000);
    return () => clearTimeout(timer);
  }, [saveBillingInfo]);

  const buildData = (): ContractData => ({
    clientCompany: clientCompanyField, clientRepresentant, clientAddress,
    clientEmail: clientEmailField, clientPhone: clientPhoneField,
    serviceType, setupFee, managementFee, recommendedBudget, contractDate,
  });

  const handleDownload = () => {
    const pdf = generateContractPDF(buildData(), logoBase64);
    pdf.save(`Contrat_${serviceType === 'ads' ? 'MetaAds' : 'SiteWeb'}_${clientCompanyField || clientName}.pdf`);
    toast.success('Contrat téléchargé !');
  };

  const handleSendEmail = async () => {
    if (!clientEmail) { toast.error("Pas d'email client renseigné"); return; }
    setSending(true);
    try {
      const pdf = generateContractPDF(buildData(), logoBase64);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const docName = `Contrat_${serviceType === 'ads' ? 'MetaAds' : 'SiteWeb'}_${clientCompanyField || clientName}.pdf`;
      const { error } = await supabase.functions.invoke('send-document-email', {
        body: {
          recipientEmail: clientEmail, recipientName: clientName,
          subject: `Contrat ${serviceType === 'ads' ? 'Meta Ads' : 'Site Web'} - Digital Launch`,
          documentBase64: pdfBase64, documentName: docName,
          message: `Bonjour ${clientName},\n\nVeuillez trouver ci-joint votre contrat de prestation ${serviceType === 'ads' ? 'Meta Ads' : 'Site Web'}.\n\nCordialement,\nDigital Launch`,
        },
      });
      if (error) throw error;
      toast.success('Contrat envoyé par email !');
    } catch (err: any) {
      toast.error(`Erreur : ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with save status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileSignature className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Générer un contrat</h3>
            <p className="text-xs text-muted-foreground">Les modifications sont sauvegardées automatiquement</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saveStatus === 'saving' && <><Loader2 className="h-3 w-3 animate-spin" /> Sauvegarde...</>}
          {saveStatus === 'saved' && <><Check className="h-3 w-3 text-emerald-500" /> Sauvegardé</>}
        </div>
      </div>

      {/* Section 1: Service type */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
          <FileSignature className="h-4 w-4 text-primary" />
          Type de prestation
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['website', 'ads'] as const).map(type => (
            <button
              key={type}
              onClick={() => setServiceType(type)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                serviceType === type
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-muted/50'
              }`}
            >
              <span className="text-lg">{type === 'website' ? '🌐' : '📣'}</span>
              <p className="font-medium text-sm mt-1 text-foreground">{type === 'website' ? 'Site Web' : 'Meta Ads'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {type === 'website' ? 'Conception et développement' : 'Gestion de campagnes'}
              </p>
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Date du contrat</Label>
          <Input value={contractDate} onChange={e => setContractDate(e.target.value)} className="h-9" />
        </div>
      </div>

      {/* Section 2: Client info */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
          <Building2 className="h-4 w-4 text-primary" />
          Entreprise cliente
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Entreprise</Label>
            <Input value={clientCompanyField} onChange={e => setClientCompanyField(e.target.value)} className="h-9" placeholder="Nom de l'entreprise" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Représentant</Label>
            <Input value={clientRepresentant} onChange={e => setClientRepresentant(e.target.value)} className="h-9" placeholder="Nom du représentant" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Adresse</Label>
            <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} className="h-9" placeholder="Adresse complète" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">SIRET</Label>
            <Input value={clientSiret} onChange={e => setClientSiret(e.target.value)} className="h-9" placeholder="N° SIRET" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input value={clientEmailField} onChange={e => setClientEmailField(e.target.value)} className="h-9" placeholder="email@entreprise.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Téléphone</Label>
            <Input value={clientPhoneField} onChange={e => setClientPhoneField(e.target.value)} className="h-9" placeholder="+33 6 ..." />
          </div>
        </div>
      </div>

      {/* Section 3: Fees */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
          <DollarSign className="h-4 w-4 text-primary" />
          Montants
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {serviceType === 'ads' ? 'Frais de configuration initiale' : 'Prix total'}
            </Label>
            <Input placeholder="Ex: 500€" value={setupFee} onChange={e => setSetupFee(e.target.value)} className="h-9" />
          </div>
          {serviceType === 'ads' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Honoraires de gestion (/ 4 semaines)</Label>
                <Input placeholder="Ex: 500€" value={managementFee} onChange={e => setManagementFee(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Budget publicitaire recommandé</Label>
                <Input placeholder="Ex: 300€/mois" value={recommendedBudget} onChange={e => setRecommendedBudget(e.target.value)} className="h-9" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleDownload} className="flex-1 h-11 gap-2">
          <Download className="h-4 w-4" /> Télécharger en PDF
        </Button>
        <Button variant="outline" onClick={handleSendEmail} disabled={sending || !clientEmail} className="flex-1 h-11 gap-2">
          <Send className="h-4 w-4" /> {sending ? 'Envoi...' : 'Envoyer par email'}
        </Button>
      </div>
    </div>
  );
}
