import { Sparkles, Upload, FileText, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';

export default function ImportPage() {
  const openAssistant = () => {
    // The floating AI button listens to this custom event
    window.dispatchEvent(new CustomEvent('open-ai-assistant', { detail: { mode: 'bulk' } }));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl">Import de leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Glisse n'importe quel fichier dans l'assistant IA — il s'occupe du reste.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full gradient-primary">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading text-lg">Import intelligent par IA</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              CSV, Excel, PDF, images, ou simple texte collé. L'IA détecte les colonnes,
              normalise les téléphones, repère les doublons et te montre un aperçu avant import.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
              <FileSpreadsheet className="h-3 w-3" /> CSV / Excel
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
              <FileText className="h-3 w-3" /> PDF / TXT
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
              <ImageIcon className="h-3 w-3" /> Image (OCR)
            </span>
          </div>

          <button
            onClick={openAssistant}
            className="mt-2 inline-flex items-center gap-2 rounded-lg gradient-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Upload className="h-4 w-4" />
            Ouvrir l'assistant IA
          </button>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1">💡 Comment ça marche</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Clique sur l'icône Sparkles flottante (en bas à droite) pour ouvrir l'assistant</li>
            <li>Glisse-dépose ton fichier ou clique sur le trombone 📎</li>
            <li>L'IA analyse, mappe les colonnes et détecte les doublons</li>
            <li>Tu vérifies l'aperçu, corriges si besoin, puis valides l'import</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
