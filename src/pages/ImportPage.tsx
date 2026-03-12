import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type ParsedLead = {
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  company_name: string;
};

function parseCSV(text: string): ParsedLead[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const nameIdx = headers.findIndex(h => ['nom', 'name', 'nom complet', 'full name'].includes(h));
  const emailIdx = headers.findIndex(h => ['email', 'e-mail', 'mail'].includes(h));
  const phoneIdx = headers.findIndex(h => ['phone', 'téléphone', 'telephone', 'tel', 'tél'].includes(h));
  const messageIdx = headers.findIndex(h => ['message', 'besoin', 'need', 'description'].includes(h));
  const sourceIdx = headers.findIndex(h => ['source', 'origine'].includes(h));
  const companyIdx = headers.findIndex(h => ['entreprise', 'company', 'société', 'societe', 'company_name'].includes(h));

  if (nameIdx === -1) return [];

  return lines.slice(1).map(line => {
    const cols = line.split(/[;,]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    return {
      name: cols[nameIdx] || '',
      email: emailIdx >= 0 ? cols[emailIdx] || '' : '',
      phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
      message: messageIdx >= 0 ? cols[messageIdx] || '' : '',
      source: sourceIdx >= 0 ? cols[sourceIdx] || 'manual' : 'manual',
      company_name: companyIdx >= 0 ? cols[companyIdx] || '' : '',
    };
  }).filter(l => l.name.trim());
}

export default function ImportPage() {
  const [leads, setLeads] = useState<ParsedLead[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setLeads(parsed);
      if (parsed.length === 0) {
        toast.error('Aucun lead trouvé. Vérifiez que le fichier contient une colonne "Nom".');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (leads.length === 0) return;
    setImporting(true);

    try {
      const validSources = ['facebook', 'website', 'google_sheets', 'manual', 'other'];
      const rows = leads.map(l => ({
        name: l.name,
        email: l.email || '',
        phone: l.phone || '',
        message: l.message || '',
        source: validSources.includes(l.source) ? l.source : 'manual',
        company_name: l.company_name || '',
      }));

      const { error } = await supabase.from('leads').insert(rows as any);
      if (error) throw error;

      toast.success(`${leads.length} leads importés !`);
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      toast.error("Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl">Import CSV</h1>
        <p className="mt-1 text-sm text-muted-foreground">Importez vos leads depuis un fichier CSV</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFile}
            className="hidden"
          />
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Colonnes supportées : <span className="text-foreground">Nom</span>, Email, Téléphone, Message, Source, Entreprise
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Choisir un fichier CSV
          </button>
          {fileName && (
            <p className="mt-2 text-xs text-muted-foreground">{fileName}</p>
          )}
        </div>

        {leads.length > 0 && !done && (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                Aperçu ({leads.length} leads)
              </div>
              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {leads.slice(0, 10).map((l, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="font-medium">{l.name}</span>
                      {l.company_name && <span className="ml-2 text-xs text-muted-foreground">· {l.company_name}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {l.email && <span>{l.email}</span>}
                      {l.phone && <span>{l.phone}</span>}
                    </div>
                  </div>
                ))}
                {leads.length > 10 && (
                  <div className="px-4 py-2 text-xs text-muted-foreground">
                    ... et {leads.length - 10} autres
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-lead-warm shrink-0" />
              <p className="text-xs text-muted-foreground">
                Les leads seront importés sans analyse IA. Vous pourrez les analyser individuellement après.
              </p>
            </div>

            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? 'Import en cours...' : `Importer ${leads.length} leads`}
            </button>
          </>
        )}

        {done && (
          <div className="flex items-center gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
            <Check className="h-5 w-5 text-primary" />
            <p className="text-sm text-foreground">{leads.length} leads importés avec succès !</p>
          </div>
        )}
      </div>
    </div>
  );
}
