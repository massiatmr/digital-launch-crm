import jsPDF from 'jspdf';

export interface InvoiceLine {
  description: string;
  unitPrice: number;
  quantity: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  clientName: string;
  clientCompany: string;
  clientAddress: string;
  clientSiret: string;
  clientRepresentant: string;
  lines: InvoiceLine[];
  prestationDetails: string[];
  paymentTerms: string;
  serviceType: 'website' | 'ads' | 'custom';
}

const EMITTER = {
  name: 'DIGITAL LAUNCH LLC',
  address1: '75 E 3RD ST',
  address2: 'Sheridan, Wyoming 82801',
  country: 'États-Unis',
  email: 'contact@digitallaunch-llc.com',
  ein: '98-1872816',
  iban: 'BE14 9056 0242 6183',
  swift: 'TRWIBEB1XXX',
  bank: 'Wise',
  bankAddress: 'Rue du Trône 100, 3rd floor 1050 Brussels Belgium',
  accountName: 'Digital Launch LLC',
};

export function generateInvoicePDF(data: InvoiceData, logoBase64?: string): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', margin, y, 35, 14);
    } catch {
      // fallback: no logo
    }
  }

  // Title
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURE', pageWidth - margin, y + 10, { align: 'right' });

  y += 30;

  // Invoice info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Facture n° ${data.invoiceNumber}`, pageWidth - margin, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`DATE : ${data.date}`, pageWidth - margin, y, { align: 'right' });
  y += 5;
  doc.text(`ÉCHÉANCE : ${data.dueDate}`, pageWidth - margin, y, { align: 'right' });

  y += 10;

  // Emitter
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ÉMETTEUR :', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(EMITTER.name, margin, y); y += 4;
  doc.text(EMITTER.address1, margin, y); y += 4;
  doc.text(EMITTER.address2, margin, y); y += 4;
  doc.text(EMITTER.country, margin, y); y += 4;
  doc.text(`Email : ${EMITTER.email}`, margin, y); y += 4;
  doc.text(`EIN : ${EMITTER.ein}`, margin, y); y += 8;

  // Recipient
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESTINATAIRE :', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (data.clientCompany) { doc.text(data.clientCompany, margin, y); y += 4; }
  if (data.clientRepresentant) { doc.text(`Représentant ${data.clientRepresentant}`, margin, y); y += 4; }
  if (data.clientAddress) {
    const addrLines = doc.splitTextToSize(data.clientAddress, contentWidth);
    addrLines.forEach((line: string) => { doc.text(line, margin, y); y += 4; });
  }
  if (data.clientSiret) { doc.text(`SIRET : ${data.clientSiret}`, margin, y); y += 4; }

  y += 8;

  // Table header
  const colX = [margin, margin + 90, margin + 125, margin + 150];
  const colW = [90, 35, 25, contentWidth - 150];
  doc.setFillColor(51, 51, 51);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', colX[0] + 2, y + 5.5);
  doc.text('Prix Unitaire', colX[1] + 2, y + 5.5);
  doc.text('Qté', colX[2] + 2, y + 5.5);
  doc.text('Total', colX[3] + 2, y + 5.5);
  y += 8;
  doc.setTextColor(0, 0, 0);

  // Table rows
  doc.setFont('helvetica', 'normal');
  data.lines.forEach((line, i) => {
    const bgColor = i % 2 === 0 ? 245 : 255;
    doc.setFillColor(bgColor, bgColor, bgColor);
    doc.rect(margin, y, contentWidth, 7, 'F');
    const desc = doc.splitTextToSize(line.description, 86);
    const rowH = Math.max(7, desc.length * 4 + 3);
    doc.text(desc, colX[0] + 2, y + 4.5);
    doc.text(`${line.unitPrice.toFixed(2)}€`, colX[1] + 2, y + 4.5);
    doc.text(`${line.quantity}`, colX[2] + 2, y + 4.5);
    doc.text(`${(line.unitPrice * line.quantity).toFixed(2)}€`, colX[3] + 2, y + 4.5);
    y += rowH;
  });

  y += 6;

  // Prestation details
  if (data.prestationDetails.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('La prestation comprend :', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    data.prestationDetails.forEach(detail => {
      doc.text(`• ${detail}`, margin + 3, y);
      y += 4;
    });
    y += 4;
  }

  // Totals
  const totalHT = data.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RÈGLEMENT :', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Par virement bancaire :', margin, y);

  // Totals box on the right
  const boxX = pageWidth - margin - 60;
  doc.setFontSize(9);
  doc.text(`TOTAL HT : ${totalHT.toFixed(2)}€`, boxX, y); y += 5;
  doc.text(`TVA : 0,00€`, boxX, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL TTC : ${totalHT.toFixed(2)}€`, boxX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Nom du compte : ${EMITTER.accountName}`, margin, y); y += 4;
  doc.text(`IBAN : ${EMITTER.iban}`, margin, y); y += 4;
  doc.text(`SWIFT / BIC : ${EMITTER.swift}`, margin, y); y += 4;
  doc.text(`Banque : ${EMITTER.bank}`, margin, y); y += 4;
  doc.text(EMITTER.bankAddress, margin, y); y += 8;

  // Payment terms
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Modalités de paiement :', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  doc.text('TVA non applicable – prestation fournie par une société hors Union', margin, y); y += 4;
  doc.text('Européenne (article 259 B du CGI)', margin, y); y += 6;

  const termsLines = doc.splitTextToSize(data.paymentTerms, contentWidth);
  termsLines.forEach((line: string) => {
    doc.text(line, margin, y);
    y += 4;
  });

  y += 4;
  doc.setFontSize(7);
  doc.text('En cas de retard de paiement, et conformément au code de commerce, une indemnité calculée à trois fois le taux', margin, y); y += 3;
  doc.text("d'intérêt légal ainsi qu'un frais de recouvrement de 40 euros sont exigibles.", margin, y);

  return doc;
}
