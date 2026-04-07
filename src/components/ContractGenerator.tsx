import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Send } from 'lucide-react';
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

  useEffect(() => {
    fetch(logoUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      });
  }, []);

  // Auto-save billing info on changes (debounced)
  const saveBillingInfo = useCallback(() => {
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
  }, [clientCompanyField, clientRepresentant, clientAddress, clientSiret, setupFee, managementFee, recommendedBudget, onBillingInfoChange, billingInfo]);

  useEffect(() => {
    const timer = setTimeout(saveBillingInfo, 1500);
    return () => clearTimeout(timer);
  }, [saveBillingInfo]);

  const buildData = (): ContractData => ({
    clientCompany: clientCompanyField,
    clientRepresentant,
    clientAddress,
    clientEmail: clientEmailField,
    clientPhone: clientPhoneField,
    serviceType,
    setupFee,
    managementFee,
    recommendedBudget,
    contractDate,
  });

  const handleDownload = () => {
    const pdf = generateContractPDF(buildData(), logoBase64);
    pdf.save(`Contrat_${serviceType === 'ads' ? 'MetaAds' : 'SiteWeb'}_${clientCompanyField || clientName}.pdf`);
    toast.success('Contrat téléchargé !');
  };

  const handleSendEmail = async () => {
    if (!clientEmail) {
      toast.error("Pas d'email client renseigné");
      return;
    }
    setSending(true);
    try {
      const pdf = generateContractPDF(buildData(), logoBase64);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const docName = `Contrat_${serviceType === 'ads' ? 'MetaAds' : 'SiteWeb'}_${clientCompanyField || clientName}.pdf`;

      const { error } = await supabase.functions.invoke('send-document-email', {
        body: {
          recipientEmail: clientEmail,
          recipientName: clientName,
          subject: `Contrat ${serviceType === 'ads' ? 'Meta Ads' : 'Site Web'} - Digital Launch`,
          documentBase64: pdfBase64,
          documentName: docName,
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>📝</span> Générer un contrat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Type de prestation</Label>
          <Select value={serviceType} onValueChange={v => setServiceType(v as 'website' | 'ads')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="website">Site Web</SelectItem>
              <SelectItem value="ads">Meta Ads</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Entreprise cliente</Label>
            <Input value={clientCompanyField} onChange={e => setClientCompanyField(e.target.value)} />
          </div>
          <div>
            <Label>Représentant</Label>
            <Input value={clientRepresentant} onChange={e => setClientRepresentant(e.target.value)} />
          </div>
          <div>
            <Label>Adresse</Label>
            <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
          </div>
          <div>
            <Label>SIRET</Label>
            <Input value={clientSiret} onChange={e => setClientSiret(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={clientEmailField} onChange={e => setClientEmailField(e.target.value)} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={clientPhoneField} onChange={e => setClientPhoneField(e.target.value)} />
          </div>
          <div>
            <Label>Date du contrat</Label>
            <Input value={contractDate} onChange={e => setContractDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{serviceType === 'ads' ? 'Frais de configuration initiale' : 'Prix total'}</Label>
            <Input placeholder="Ex: 500€" value={setupFee} onChange={e => setSetupFee(e.target.value)} />
          </div>
          {serviceType === 'ads' && (
            <>
              <div>
                <Label>Honoraires de gestion (/ 4 semaines)</Label>
                <Input placeholder="Ex: 500€" value={managementFee} onChange={e => setManagementFee(e.target.value)} />
              </div>
              <div>
                <Label>Budget publicitaire recommandé</Label>
                <Input placeholder="Ex: 300€/mois" value={recommendedBudget} onChange={e => setRecommendedBudget(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleDownload} className="flex-1">
            <Download className="h-4 w-4 mr-2" /> Télécharger en PDF
          </Button>
          <Button variant="outline" onClick={handleSendEmail} disabled={sending || !clientEmail} className="flex-1">
            <Send className="h-4 w-4 mr-2" /> {sending ? 'Envoi...' : 'Envoyer par email'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
