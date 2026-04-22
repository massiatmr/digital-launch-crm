import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, Copy, MessageSquareText, Send, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  useFollowupScripts,
  PHASE_LABELS,
  PHASE_ORDER,
  FollowupScriptPhase,
} from '@/hooks/useFollowupScripts';
import { cn } from '@/lib/utils';

interface Props {
  leadName?: string;
  onInsert?: (text: string) => void;
}

function renderTemplate(content: string, leadName?: string) {
  const first = (leadName || '').trim().split(/\s+/)[0] || '';
  return content.replace(/\{\{\s*name\s*\}\}/gi, first);
}

export function FollowupScriptsPicker({ leadName, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [openPhase, setOpenPhase] = useState<FollowupScriptPhase | null>(null);
  const { data: scripts = [], isLoading } = useFollowupScripts();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scripts.filter((s) => s.is_enabled && (!q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)));
  }, [scripts, query]);

  const grouped = PHASE_ORDER.map((p) => ({
    phase: p,
    items: filtered.filter((s) => s.phase === p),
  })).filter((g) => g.items.length > 0);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copié dans le presse-papiers');
    } catch {
      toast.error('Impossible de copier');
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="icon" variant="ghost" title="Scripts de relance" className="shrink-0">
          <MessageSquareText className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-base">Scripts de relance</SheetTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher..."
              className="pl-8 h-9"
            />
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {isLoading ? (
              <p className="text-center text-sm text-muted-foreground py-8">Chargement…</p>
            ) : grouped.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Aucun script. Crée-en dans Paramètres → Scripts de relance.
              </p>
            ) : (
              grouped.map((g) => {
                const isOpen = openPhase === g.phase || query.trim().length > 0;
                return (
                  <div key={g.phase} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setOpenPhase(openPhase === g.phase ? null : g.phase)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 text-left"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="text-sm font-medium flex-1">{PHASE_LABELS[g.phase]}</span>
                      <span className="text-xs text-muted-foreground">{g.items.length}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border divide-y divide-border">
                        {g.items.map((s) => {
                          const rendered = renderTemplate(s.content, leadName);
                          return (
                            <div key={s.id} className="p-3 space-y-2">
                              <p className="text-sm font-medium">{s.title}</p>
                              <p className="text-xs whitespace-pre-line text-muted-foreground bg-muted/30 rounded-md p-2 max-h-40 overflow-y-auto">
                                {rendered}
                              </p>
                              <div className="flex items-center justify-end gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => handleCopy(rendered)} className="h-7 text-xs">
                                  <Copy className="h-3 w-3 mr-1" /> Copier
                                </Button>
                                {onInsert && (
                                  <Button size="sm" onClick={() => { onInsert(rendered); setOpen(false); }} className="h-7 text-xs">
                                    <Send className="h-3 w-3 mr-1" /> Insérer
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
