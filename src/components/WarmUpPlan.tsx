import { useState } from 'react';
import { Loader2, Sparkles, ThermometerSun, Copy } from 'lucide-react';
import { DbLead } from '@/hooks/useLeadData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface WarmUpPlanProps {
  lead: DbLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WarmUpPlan({ lead, open, onOpenChange }: WarmUpPlanProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generatePlan = async () => {
    if (!lead) return;
    setLoading(true);
    setContent(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-lead-analysis', {
        body: {
          type: 'warm_up',
          lead: {
            name: lead.name,
            company_name: lead.company_name,
            message: lead.message,
            notes: lead.notes,
            status: lead.status,
            score: lead.score,
            sales_angle: lead.sales_angle,
            ai_summary: lead.ai_summary,
          },
        },
      });
      if (error) throw error;
      setContent(data?.plan || data?.answer || 'Pas de plan généré.');
    } catch {
      toast.error("Erreur lors de la génération du plan");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (isOpen && !content && !loading) {
      generatePlan();
    }
  };

  const copyToClipboard = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      toast.success('Plan copié !');
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="right" className="sm:max-w-lg w-full">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ThermometerSun className="h-4 w-4 text-lead-warm" />
            Plan de réchauffement — {lead?.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Génération du plan de réchauffement...</p>
            </div>
          ) : content ? (
            <>
              <div className="glass-card p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard} className="flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copier
                </Button>
                <Button variant="outline" size="sm" onClick={generatePlan} className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Régénérer
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <ThermometerSun className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Cliquez pour générer un plan</p>
              <Button onClick={generatePlan}>
                <Sparkles className="h-4 w-4 mr-1.5" /> Générer
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
