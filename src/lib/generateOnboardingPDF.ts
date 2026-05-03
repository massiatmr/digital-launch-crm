import jsPDF from 'jspdf';
import { logoBase64 } from './logoBase64';

export type OnboardingFormType = 'website' | 'ads';

interface FieldLabel {
  id: string;
  label: string;
}

interface StepLabel {
  title: string;
  fields: FieldLabel[];
}

interface GenerateParams {
  formType: OnboardingFormType;
  steps: StepLabel[];
  responses: Record<string, any>;
  clientName?: string;
  companyName?: string;
  completedAt?: string;
}

function formatValue(val: any): string {
  if (val == null || val === '') return '—';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    if (Array.isArray(val.files) && val.files.length > 0) {
      return val.files.map((f: any) => `• ${f.name || f.url}\n  ${f.url}`).join('\n');
    }
    if (val.url) return `${val.name ? val.name + ' — ' : ''}${val.url}`;
    return JSON.stringify(val);
  }
  return String(val);
}

export function generateOnboardingPDF({
  formType,
  steps,
  responses,
  clientName,
  companyName,
  completedAt,
}: GenerateParams): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header avec logo
  try {
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', margin, y, 50, 10);
    }
  } catch {}
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 30);
  const title =
    formType === 'website' ? 'Onboarding — Site Web' : 'Onboarding — Campagnes Publicitaires';
  doc.text(title, margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 120);
  if (companyName || clientName) {
    doc.text(`Client : ${companyName || clientName || ''}`, margin, y);
    y += 5;
  }
  if (completedAt) {
    doc.text(`Complété le : ${completedAt}`, margin, y);
    y += 5;
  }
  y += 4;

  doc.setDrawColor(220, 220, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const skipped = (responses?._skippedSteps || {}) as Record<string, boolean>;

  steps.forEach((step, stepIdx) => {
    // Step title
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(124, 58, 237); // primary purple
    doc.text(`${stepIdx + 1}. ${step.title}`, margin, y);
    y += 6;

    if (skipped[stepIdx]) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 130);
      doc.text('Section ignorée — accès déjà partagés.', margin, y);
      y += 8;
      return;
    }

    let any = false;
    step.fields.forEach((field) => {
      const key = `step${stepIdx}_${field.id}`;
      const val = responses?.[key];
      const empty =
        val == null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && !Array.isArray(val) &&
          !val.url && !(Array.isArray(val.files) && val.files.length > 0));
      if (empty) return;
      any = true;

      const text = formatValue(val);
      const lines = doc.splitTextToSize(text, contentWidth - 4);

      ensureSpace(8 + lines.length * 4.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 60);
      doc.text(field.label, margin, y);
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 40);
      doc.text(lines, margin + 2, y);
      y += lines.length * 4.5 + 3;
    });

    if (!any) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(160, 160, 170);
      doc.text('Aucune réponse fournie.', margin, y);
      y += 6;
    }

    y += 3;
  });

  // Footer pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 170);
    doc.text(
      `Digital Launch — Onboarding ${formType === 'website' ? 'Site Web' : 'Ads'} • Page ${i}/${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  return doc;
}
