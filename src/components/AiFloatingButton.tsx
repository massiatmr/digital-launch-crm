import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { GlobalNaturalLanguageInput } from './GlobalNaturalLanguageInput';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function AiFloatingButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const content = (
    <div className="py-2">
      <GlobalNaturalLanguageInput onDone={() => setOpen(false)} />
    </div>
  );

  return (
    <>
      {/* Floating AI button */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-50 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:scale-105 active:scale-95",
          isMobile
            ? "bottom-20 right-4 h-14 w-14"
            : "bottom-6 right-6 h-12 w-12"
        )}
      >
        <Sparkles className={cn(isMobile ? "h-6 w-6" : "h-5 w-5")} />
      </button>

      {/* Mobile: Bottom sheet */}
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Assistant IA
              </SheetTitle>
            </SheetHeader>
            {content}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Assistant IA
              </DialogTitle>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
