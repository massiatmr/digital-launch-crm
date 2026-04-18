import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, Save } from 'lucide-react';
import type { StepConfig } from './StepCard';
import type { WhatsAppTemplate } from '@/hooks/useWhatsAppTemplates';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  step: StepConfig | null;
  templates: WhatsAppTemplate[];
  currentTemplateId: string | null;
  currentDelay: number;
  onSave: (patch: { templateId: string | null; delay: number }) => void;
}

export function StepEditorSheet({ open, onOpenChange, step, templates, currentTemplateId, currentDelay, onSave }: Props) {
  const [tplId, setTplId] = useState<string | null>(currentTemplateId);
  const [delay, setDelay] = useState<number>(currentDelay);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setTplId(currentTemplateId);
    setDelay(currentDelay);
    setPreview(null);
  }, [currentTemplateId, currentDelay, open]);

  if (!step) return null;
  const selectedTpl = templates.find((t) => t.id === tplId) || null;

  const generatePreview = async () => {
    if (!selectedTpl) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      // Récupérer un lead réel de l'utilisateur pour preview, sinon fallback fictif
      const { data: leads } = await supabase
        .from('leads').select('*').limit(1).order('created_at', { ascending: false });
      const lead = leads?.[0] || { name: 'Marie Dupont', company_name: 'Acme', message: 'Je voudrais un site', notes: '' };

      if (selectedTpl.variables_count === 0) {
        setPreview(selectedTpl.body_text);
      } else {
        const { data, error } = await supabase.functions.invoke('preview-template-message', {
          body: { template_id: selectedTpl.id, lead_id: (lead as any).id || null, fallback_lead: lead },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setPreview((data as any).preview);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erreur preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const save = () => {
    onSave({ templateId: tplId, delay });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{step.label}</SheetTitle>
          <SheetDescription>{step.description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div>
            <Label>Délai après l'étape précédente</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={delay}
                onChange={(e) => setDelay(parseInt(e.target.value) || 0)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">{step.delayUnit === 'min' ? 'minutes' : 'heures'}</span>
            </div>
          </div>

          <div>
            <Label>Template WhatsApp à envoyer</Label>
            <Select value={tplId || 'none'} onValueChange={(v) => { setTplId(v === 'none' ? null : v); setPreview(null); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun (IA texte libre)</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.language}) {t.variables_count > 0 && `· ${t.variables_count} var.`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!tplId && (
              <p className="text-xs text-yellow-400 mt-1.5">
                ⚠️ Sans template, l'envoi ne fonctionnera que si le lead a répondu dans les 24h.
              </p>
            )}
          </div>

          {selectedTpl && (
            <div className="rounded-lg border border-border bg-background/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">Texte du template</div>
              <p className="text-sm whitespace-pre-wrap">{selectedTpl.body_text}</p>
            </div>
          )}

          {selectedTpl && (
            <div>
              <Button variant="outline" size="sm" onClick={generatePreview} disabled={previewLoading} className="w-full">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Aperçu avec un vrai lead
              </Button>
              {preview && (
                <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="text-xs text-primary mb-1.5 font-medium">📱 Message qui sera envoyé</div>
                  <p className="text-sm whitespace-pre-wrap">{preview}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button className="flex-1" onClick={save}>
              <Save className="h-4 w-4 mr-1" /> Appliquer
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
