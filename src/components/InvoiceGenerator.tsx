import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import { generateInvoicePDF, type InvoiceLine, type InvoiceData } from '@/lib/generateInvoicePDF';
import { supabase } from '@/integrations/supabase/client';
import logoUrl from '@/assets/logo.webp';

export interface BillingInfo {
  clientCompany?: string;
  clientRepresentant?: string;
  clientAddress?: string;
  clientSiret?: string;
  invoiceNumber?: string;
  serviceType?: 'website' | 'ads' | 'custom';
  lines?: InvoiceLine[];
  prestationDetails?: string;
  paymentTerms?: string;
  setupFee?: string;
  managementFee?: string;
  recommendedBudget?: string;
}

interface Props {
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  offerName?: string;
  billingInfo?: BillingInfo;
  onBillingInfoChange?: (info: BillingInfo) => void;
}

const DEFAULT_WEBSITE_DETAILS = [
  "Création d'un site web vitrine",
  "Création de Logo et charte graphique jusqu'à 3 propositions",
  "Site 100 % responsive (adapté à tous les écrans)",
  "Rédaction et adaptation des contenus",
  "Haute performance et optimisation de l'expérience utilisateur",
  "Système de gestion et Formation à l'utilisation du site",
  "Jusqu'à 2 retours de modifications inclus à la livraison",
];

const DEFAULT_ADS_DETAILS = [
  "Stratégie publicitaire Meta Ads",
  "Création de la landing page",
  "Mise en place du CRM de gestion des leads",
  "Gestion et optimisation des campagnes (4 semaines)",
];

const PAYMENT_TERMS: Record<string, string> = {
  website: "Paiement en deux virements :\n- 50 % à la commande\n- 50 % à la livraison",
  ads: "Premier mois payé d'avance, puis toutes les 4 semaines.",
  custom: '',
};

export default function InvoiceGenerator({ clientName, clientCompany, clientEmail, clientPhone, offerName, billingInfo, onBillingInfoChange }: Props) {
  const defaultServiceType = offerName?.toLowerCase().includes('ads') || offerName?.toLowerCase().includes('pub') ? 'ads' : 'website';

  const [invoiceNumber, setInvoiceNumber] = useState(billingInfo?.invoiceNumber || 'DL-001');
  const [date, setDate] = useState(new Date().toLocaleDateString('fr-FR'));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString('fr-FR');
  });
  const [clientCompanyField, setClientCompanyField] = useState(billingInfo?.clientCompany || clientCompany);
  const [clientRepresentant, setClientRepresentant] = useState(billingInfo?.clientRepresentant || clientName);
  const [clientAddress, setClientAddress] = useState(billingInfo?.clientAddress || '');
  const [clientSiret, setClientSiret] = useState(billingInfo?.clientSiret || '');
  const [serviceType, setServiceType] = useState<'website' | 'ads' | 'custom'>(billingInfo?.serviceType || defaultServiceType);
  const [lines, setLines] = useState<InvoiceLine[]>(
    billingInfo?.lines?.length ? billingInfo.lines :
    [{ description: defaultServiceType === 'ads' ? 'Gestion campagnes Meta Ads' : 'Conception et Développement Site Web', unitPrice: 650, quantity: 1 }]
  );
  const [prestationDetails, setPrestationDetails] = useState<string>(
    billingInfo?.prestationDetails ||
    (defaultServiceType === 'ads' ? DEFAULT_ADS_DETAILS : DEFAULT_WEBSITE_DETAILS).join('\n')
  );
  const [paymentTerms, setPaymentTerms] = useState(billingInfo?.paymentTerms || PAYMENT_TERMS[defaultServiceType]);
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
      invoiceNumber,
      serviceType,
      lines,
      prestationDetails,
      paymentTerms,
    });
  }, [clientCompanyField, clientRepresentant, clientAddress, clientSiret, invoiceNumber, serviceType, lines, prestationDetails, paymentTerms, onBillingInfoChange, billingInfo]);

  useEffect(() => {
    const timer = setTimeout(saveBillingInfo, 1500);
    return () => clearTimeout(timer);
  }, [saveBillingInfo]);

  const handleServiceTypeChange = (value: string) => {
    const v = value as 'website' | 'ads' | 'custom';
    setServiceType(v);
    setPaymentTerms(PAYMENT_TERMS[v]);
    if (v === 'website') {
      setPrestationDetails(DEFAULT_WEBSITE_DETAILS.join('\n'));
      setLines([{ description: 'Conception et Développement Site Web', unitPrice: 650, quantity: 1 }]);
    } else if (v === 'ads') {
      setPrestationDetails(DEFAULT_ADS_DETAILS.join('\n'));
      setLines([{ description: 'Gestion campagnes Meta Ads', unitPrice: 500, quantity: 1 }]);
    }
  };

  const addLine = () => setLines([...lines, { description: '', unitPrice: 0, quantity: 1 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof InvoiceLine, value: string | number) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    setLines(updated);
  };

  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const buildData = (): InvoiceData => ({
    invoiceNumber,
    date,
    dueDate,
    clientName,
    clientCompany: clientCompanyField,
    clientRepresentant,
    clientAddress,
    clientSiret,
    lines,
    prestationDetails: prestationDetails.split('\n').filter(Boolean),
    paymentTerms,
    serviceType,
  });

  const handleDownload = () => {
    const pdf = generateInvoicePDF(buildData(), logoBase64);
    pdf.save(`Facture_${invoiceNumber}.pdf`);
    toast.success('Facture téléchargée !');
  };

  const handleSendEmail = async () => {
    if (!clientEmail) {
      toast.error("Pas d'email client renseigné");
      return;
    }
    setSending(true);
    try {
      const pdf = generateInvoicePDF(buildData(), logoBase64);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];

      const { error } = await supabase.functions.invoke('send-document-email', {
        body: {
          recipientEmail: clientEmail,
          recipientName: clientName,
          subject: `Facture ${invoiceNumber} - Digital Launch`,
          documentBase64: pdfBase64,
          documentName: `Facture_${invoiceNumber}.pdf`,
          message: `Bonjour ${clientName},\n\nVeuillez trouver ci-joint votre facture n° ${invoiceNumber}.\n\nCordialement,\nDigital Launch`,
        },
      });

      if (error) throw error;
      toast.success('Facture envoyée par email !');
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
          <span>📄</span> Générer une facture
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>N° Facture</Label>
            <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Échéance</Label>
            <Input value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
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
        </div>

        <div>
          <Label>Type de service</Label>
          <Select value={serviceType} onValueChange={handleServiceTypeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="website">Site Web</SelectItem>
              <SelectItem value="ads">Meta Ads</SelectItem>
              <SelectItem value="custom">Personnalisé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lines */}
        <div className="space-y-2">
          <Label>Lignes de facturation</Label>
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Input placeholder="Description" value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} />
              </div>
              <div className="w-28">
                <Input type="number" placeholder="Prix" value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="w-16">
                <Input type="number" placeholder="Qté" value={line.quantity} onChange={e => updateLine(i, 'quantity', parseInt(e.target.value) || 1)} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-3 w-3 mr-1" /> Ajouter une ligne
          </Button>
        </div>

        <div className="text-right font-bold text-lg">
          Total : {total.toFixed(2)}€
        </div>

        <div>
          <Label>Détails de la prestation</Label>
          <Textarea value={prestationDetails} onChange={e => setPrestationDetails(e.target.value)} rows={5} className="text-sm" />
        </div>

        <div>
          <Label>Modalités de paiement</Label>
          <Textarea value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} rows={3} className="text-sm" />
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
