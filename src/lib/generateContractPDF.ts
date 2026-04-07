import jsPDF from 'jspdf';

export interface ContractData {
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
}

const EMITTER = {
  name: 'DIGITAL LAUNCH LLC',
  address1: '75 E 3RD ST',
  address2: 'Sheridan, Wyoming 82801',
  country: 'États-Unis',
  email: 'contact@digitallaunch-llc.com',
  ein: '98-1872816',
  representative: 'Arezki Massinissa Ait Amara',
};

const ADS_ARTICLES = [
  {
    title: 'Article 1 — Objet',
    content: "Mise en place d'une stratégie de génération de leads via Meta Ads incluant une landing page et un CRM de gestion des leads. L'objectif est de générer des prospects qualifiés pour l'entreprise cliente. Les résultats peuvent varier selon le marché, la concurrence, la saison, le budget et l'offre.",
  },
  {
    title: 'Article 2 — Prestations',
    content: 'Stratégie publicitaire, création de la landing page, mise en place du CRM, gestion et optimisation des campagnes Meta Ads.',
  },
  {
    title: 'Article 3 — Délai de mise en place',
    content: '7 à 10 jours de préparation avant lancement. Les 4 semaines de gestion commencent à partir du lancement officiel des campagnes.',
  },
  {
    title: 'Article 4 — Obligations du client',
    content: "Fournir les informations, les accès, les éléments de l'offre, répondre aux leads et payer le budget publicitaire.",
  },
  {
    title: 'Article 5 — Budget publicitaire Meta Ads',
    content: 'Budget payé directement à Meta par le client. Budget recommandé : {budget}',
  },
  {
    title: 'Article 6 — Tarifs',
    content: 'Frais de configuration initiale : {setupFee}\nHonoraires de gestion des campagnes : {managementFee} toutes les 4 semaines\nPaiement à l\'avance.',
  },
  {
    title: 'Article 7 — Responsabilité',
    content: "Le prestataire s'engage à mettre en place et optimiser les campagnes de manière professionnelle. Les résultats dépendent du marché, du budget, de l'offre et de la réactivité commerciale du client. Le client reste responsable de la conversion des prospects en clients.",
  },
  {
    title: 'Article 8 — Durée et résiliation',
    content: 'Contrat de 4 semaines renouvelables automatiquement. Résiliation possible avec 7 jours de préavis avant la fin de la période.',
  },
  {
    title: 'Article 9 — Droit applicable',
    content: 'Cadre juridique international applicable aux prestations de services en ligne. Solution amiable privilégiée en cas de litige.',
  },
];

const WEBSITE_ARTICLES = [
  {
    title: 'Article 1 — Objet',
    content: "Conception et développement d'un site web professionnel pour l'entreprise cliente, incluant le design, l'intégration du contenu et la mise en ligne.",
  },
  {
    title: 'Article 2 — Prestations',
    content: "Création d'un site web vitrine, création de logo et charte graphique (jusqu'à 3 propositions), site 100% responsive, rédaction et adaptation des contenus, haute performance et optimisation UX, système de gestion et formation à l'utilisation du site, jusqu'à 2 retours de modifications inclus.",
  },
  {
    title: 'Article 3 — Délai de livraison',
    content: "7 à 14 jours ouvrables après réception de l'ensemble des éléments nécessaires (contenus, images, accès).",
  },
  {
    title: 'Article 4 — Obligations du client',
    content: "Fournir les contenus, images, accès hébergement/domaine, et valider les étapes intermédiaires dans un délai raisonnable.",
  },
  {
    title: 'Article 5 — Tarifs',
    content: 'Frais de conception et développement : {setupFee}\nPaiement en deux virements :\n- 50% à la commande\n- 50% à la livraison',
  },
  {
    title: 'Article 6 — Propriété intellectuelle',
    content: "Le client devient propriétaire du site web et de ses contenus après paiement intégral. Le prestataire conserve le droit de mentionner le projet dans son portfolio.",
  },
  {
    title: 'Article 7 — Responsabilité',
    content: "Le prestataire s'engage à livrer un site conforme aux spécifications convenues. Le client est responsable de la fourniture des contenus et de leur conformité légale.",
  },
  {
    title: 'Article 8 — Résiliation',
    content: "En cas de résiliation avant livraison, les sommes versées restent acquises au prestataire au prorata du travail effectué.",
  },
  {
    title: 'Article 9 — Droit applicable',
    content: 'Cadre juridique international applicable aux prestations de services en ligne. Solution amiable privilégiée en cas de litige.',
  },
];

export function generateContractPDF(data: ContractData, logoBase64?: string): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const title = data.serviceType === 'ads'
    ? 'Contrat de prestation Meta Ads - Génération de Leads'
    : 'Contrat de prestation Site Web';

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'WEBP', margin, y, 50, 20);
    } catch { /* no logo fallback */ }
  }

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title, contentWidth - 60);
  doc.text(titleLines, pageWidth - margin, y + 10, { align: 'right' });
  y += 35;

  // Prestataire
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Prestataire', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(EMITTER.name, margin, y); y += 4;
  doc.text(EMITTER.address1, margin, y); y += 4;
  doc.text(EMITTER.address2, margin, y); y += 4;
  doc.text(EMITTER.country, margin, y); y += 4;
  doc.text(`Email : ${EMITTER.email}`, margin, y); y += 4;
  doc.text(`EIN : ${EMITTER.ein}`, margin, y); y += 4;
  doc.text(`Représenté par : ${EMITTER.representative}`, margin, y); y += 8;

  // Client
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Entreprise cliente', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nom de l'entreprise : ${data.clientCompany || '[Non renseigné]'}`, margin, y); y += 4;
  doc.text(`Représentant : ${data.clientRepresentant || '[Non renseigné]'}`, margin, y); y += 4;
  doc.text(`Adresse : ${data.clientAddress || '[Non renseigné]'}`, margin, y); y += 4;
  doc.text(`Email : ${data.clientEmail || '[Non renseigné]'}`, margin, y); y += 4;
  doc.text(`Téléphone : ${data.clientPhone || '[Non renseigné]'}`, margin, y); y += 10;

  // Articles
  const articles = data.serviceType === 'ads' ? ADS_ARTICLES : WEBSITE_ARTICLES;

  articles.forEach(article => {
    let content = article.content
      .replace('{budget}', data.recommendedBudget || '[Budget publicitaire]')
      .replace('{setupFee}', data.setupFee || '[Montant €]')
      .replace('{managementFee}', data.managementFee || '[Montant €]');

    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(article.title, margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(content, contentWidth);
    lines.forEach((line: string) => {
      if (y > 275) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 4;
    });
    y += 4;
  });

  // Signatures
  if (y > 230) { doc.addPage(); y = 20; }
  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fait le : ${data.contractDate}`, margin, y); y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text(`Prestataire : ${EMITTER.representative}`, margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text(EMITTER.name, margin, y); y += 6;
  doc.text('Signature : ___________________________', margin, y); y += 15;

  doc.setFont('helvetica', 'bold');
  doc.text(`Entreprise cliente : ${data.clientRepresentant || '___________________________'}`, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('Signature : ___________________________', margin, y);

  return doc;
}
