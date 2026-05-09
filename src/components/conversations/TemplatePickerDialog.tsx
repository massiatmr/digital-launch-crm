import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, FileText } from 'lucide-react';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function TemplatePickerDialog({
  open,
  onOpenChange,
  leadId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  onSent?: () => void;
}) {
  const { data: templates = [], isLoading } = useWhatsAppTemplates();
  const approved = useMemo(
    () => templates.filter((t) => (t.status || '').toUpperCase() === 'APPROVED' || t.is_synced),
    [templates],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = approved.find((t) => t.id === selectedId) || null;
  const [vars, setVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) { setSelectedId(null); setVars([]); }
  }, [open]);

  useEffect(() => {
    if (selected) setVars(Array.from({ length: selected.variables_count || 0 }, () => ''));
  }, [selected?.id]);

  const preview = useMemo(() => {
    if (!selected) return '';
    let out = selected.body_text;
    vars.forEach((v, i) => {
      out = out.split(`{{${i + 1}}}`).join(v || `{{${i + 1}}}`);
    });
    return out;
  }, [selected, vars]);

  const send = async () => {
    if (!selected) return;
    if (vars.some((v) => !v.trim()) && (selected.variables_count || 0) > 0) {
      toast.error('Remplis toutes les variables');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: {
          lead_id: leadId,
          template: {
            name: selected.name,
            language: selected.language,
            variables: vars,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error && !(data as any)?.success) throw new Error((data as any).error);
      toast.success((data as any)?.dry_run ? 'Template simulé (dry-run)' : 'Template envoyé');
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Échec envoi template');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Envoyer un template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : approved.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun template approuvé. Crée et fais approuver un template depuis Réglages → WhatsApp.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                {approved.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg border transition-colors',
                      selectedId === t.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{t.name}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{t.language}</Badge>
                      {t.variables_count > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">{t.variables_count} var.</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.body_text}</p>
                  </button>
                ))}
              </div>

              {selected && selected.variables_count > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">Remplis les variables :</p>
                  {vars.map((v, i) => (
                    <Input
                      key={i}
                      value={v}
                      onChange={(e) => setVars((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={`Variable {{${i + 1}}}`}
                    />
                  ))}
                </div>
              )}

              {selected && (
                <div className="rounded-lg bg-muted/30 border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Aperçu</p>
                  <p className="whitespace-pre-line text-sm">{preview}</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={send} disabled={!selected || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Envoyer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
