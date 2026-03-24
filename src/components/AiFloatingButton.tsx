import { Sparkles, X } from 'lucide-react';
import { GlobalNaturalLanguageInput } from './GlobalNaturalLanguageInput';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';

export function AiFloatingButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const content = (
    <div className="py-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
      <GlobalNaturalLanguageInput onDone={() => setOpen(false)} />
    </div>
  );

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          "fixed z-50 flex items-center justify-center rounded-full gradient-primary text-white shadow-lg",
          "shadow-[0_4px_24px_hsl(var(--primary)/0.35)]",
          isMobile
            ? "bottom-20 right-4 h-14 w-14"
            : "bottom-6 right-6 h-12 w-12"
        )}
      >
        <Sparkles className={cn(isMobile ? "h-6 w-6" : "h-5 w-5")} />
      </motion.button>

      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
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
          <DialogContent className="sm:max-w-2xl lg:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
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
