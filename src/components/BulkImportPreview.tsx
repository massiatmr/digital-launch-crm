import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, AlertTriangle, CheckCircle2, Copy as CopyIcon, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentWorkspaceId } from '@/hooks/useWorkspaces';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export type MappedRow = {
  index: number;
  name: string;
  email: string;
  phone: string;
  company_name: string;
  message: string;
  notes: string;
  source: string;
  score: string;
  status: string;
  errors: string[];
  duplicate_of: string | null;
  duplicate_field: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: MappedRow[];
  stats: { total: number; valid: number; duplicates: number; errors: number } | null;
  onImported?: () => void;
};

const FIELDS: { key: keyof MappedRow; label: string; width: string }[] = [
  { key: 'name', label: 'Nom', width: 'min-w-[140px]' },
  { key: 'email', label: 'Email', width: 'min-w-[180px]' },
  { key: 'phone', label: 'Téléphone', width: 'min-w-[140px]' },
  { key: 'company_name', label: 'Entreprise', width: 'min-w-[140px]' },
  { key: 'source', label: 'Source', width: 'min-w-[120px]' },
  { key: 'score', label: 'Score', width: 'min-w-[80px]' },
  { key: 'status', label: 'Statut', width: 'min-w-[100px]' },
  { key: 'message', label: 'Message', width: 'min-w-[180px]' },
  { key: 'notes', label: 'Notes', width: 'min-w-[180px]' },
];

export function BulkImportPreview({ open, onOpenChange, rows: initialRows, stats, onImported }: Props) {
  const [rows, setRows] = useState<MappedRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<number>>(() => {
    const s = new Set<number>();
    initialRows.forEach((r) => {
      if (r.errors.length === 0 && !r.duplicate_of) s.add(r.index);
    });
    return s;
  });
  const [importing, setImporting] = useState(false);
  const { user } = useAuth();
  const wsId = useCurrentWorkspaceId();
  const queryClient = useQueryClient();

  // Sync if a new file is loaded
  useMemo(() => {
    setRows(initialRows);
    const s = new Set<number>();
    initialRows.forEach((r) => {
      if (r.errors.length === 0 && !r.duplicate_of) s.add(r.index);
    });
    setSelected(s);
  }, [initialRows]);

  const updateCell = (idx: number, key: keyof MappedRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.index === idx ? { ...r, [key]: value } : r)));
  };

  const toggleRow = (idx: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.index)));
  };

  const handleImport = async () => {
    if (!user?.id) {
      toast.error('Non authentifié');
      return;
    }
    const toInsert = rows
      .filter((r) => selected.has(r.index) && r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        email: r.email || null,
        phone: r.phone || null,
        message: r.message || null,
        company_name: r.company_name || null,
        notes: r.notes || null,
        source: r.source as any,
        score: r.score as any,
        status: r.status as any,
        owner_id: user.id,
        workspace_id: wsId || null,
      }));

    if (toInsert.length === 0) {
      toast.error('Aucune ligne sélectionnée');
      return;
    }

    setImporting(true);
    try {
      // Insert in chunks of 100 to be safe
      const chunkSize = 100;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('leads').insert(chunk as any);
        if (error) throw error;
        inserted += chunk.length;
      }
      toast.success(`${inserted} lead${inserted > 1 ? 's' : ''} importé${inserted > 1 ? 's' : ''} avec succès !`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'import : " + ((e as Error).message || 'inconnue'));
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const dupCount = rows.filter((r) => r.duplicate_of).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[100vw] md:max-w-[95vw] lg:max-w-[90vw] p-0 flex flex-col">
        <SheetHeader className="p-6 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Aperçu de l'import — {rows.length} ligne{rows.length > 1 ? 's' : ''}
          </SheetTitle>
          <SheetDescription>
            Vérifie chaque ligne, modifie les valeurs si besoin, puis valide l'import.
          </SheetDescription>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> {validCount} valides
            </Badge>
            {dupCount > 0 && (
              <Badge variant="outline" className="gap-1 border-lead-warm/40 text-lead-warm">
                <CopyIcon className="h-3 w-3" /> {dupCount} doublons détectés
              </Badge>
            )}
            {stats && stats.errors > 0 && (
              <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                <AlertTriangle className="h-3 w-3" /> {stats.errors} erreurs
              </Badge>
            )}
            <Badge variant="outline">{selected.size} sélectionnés</Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-background border-b border-border">
              <tr>
                <th className="p-2 w-10">
                  <Checkbox
                    checked={selected.size === rows.length && rows.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-2 text-left text-muted-foreground font-medium w-20">État</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className={`p-2 text-left text-muted-foreground font-medium ${f.width}`}>
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hasErr = r.errors.length > 0;
                const isDup = !!r.duplicate_of;
                const isSel = selected.has(r.index);
                return (
                  <tr
                    key={r.index}
                    className={`border-b border-border/50 hover:bg-muted/30 ${
                      hasErr ? 'bg-destructive/5' : isDup ? 'bg-lead-warm/5' : ''
                    } ${!isSel ? 'opacity-50' : ''}`}
                  >
                    <td className="p-2">
                      <Checkbox checked={isSel} onCheckedChange={() => toggleRow(r.index)} />
                    </td>
                    <td className="p-2">
                      {hasErr ? (
                        <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5" /> Erreur
                        </Badge>
                      ) : isDup ? (
                        <Badge variant="outline" className="gap-1 border-lead-warm/40 text-lead-warm text-[10px]">
                          <CopyIcon className="h-2.5 w-2.5" /> Doublon
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-primary/40 text-primary text-[10px]">
                          <CheckCircle2 className="h-2.5 w-2.5" /> OK
                        </Badge>
                      )}
                    </td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className={`p-1 ${f.width}`}>
                        <input
                          type="text"
                          value={(r[f.key] as string) || ''}
                          onChange={(e) => updateCell(r.index, f.key, e.target.value)}
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-1.5 py-1 text-xs focus:outline-none transition-colors"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border p-4 flex items-center justify-between gap-3 bg-background">
          <p className="text-xs text-muted-foreground">
            Les lignes en erreur ou doublons sont décochées par défaut. Coche celles que tu veux importer.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importing}>
              Annuler
            </Button>
            <Button onClick={handleImport} disabled={importing || selected.size === 0} className="gradient-primary text-white">
              {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Importer {selected.size} lead{selected.size > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
