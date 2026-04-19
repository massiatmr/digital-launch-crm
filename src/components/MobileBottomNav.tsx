import { NavLink, useLocation } from 'react-router-dom';
import { Kanban, Bell, MoreHorizontal, LogOut, LayoutDashboard, Package, CalendarCheck, UserCheck, MessageCircle, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import { GlobalNaturalLanguageInput } from './GlobalNaturalLanguageInput';

const mainLinks = [
  { to: '/', icon: Kanban, label: 'Pipeline' },
  { to: '/conversations', icon: MessageCircle, label: 'Chats' },
  { to: '/clients', icon: UserCheck, label: 'Clients' },
  { to: '/reminders', icon: Bell, label: 'Tâches' },
];

const moreLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/offers', icon: Package, label: 'Offres' },
  { to: '/bookings', icon: CalendarCheck, label: 'Rendez-vous' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const { signOut } = useAuth();
  const { unreadCount } = useWhatsAppInbox();

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-pb h-16">
        <div className="flex items-center justify-around px-1 py-1.5">
          {mainLinks.slice(0, 2).map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            const showBadge = to === '/conversations' && unreadCount > 0;
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] transition-colors flex-1 min-w-0',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate max-w-full">{label}</span>
                {showBadge && (
                  <span className="absolute top-0.5 right-2 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </NavLink>
            );
          })}

          {/* Bouton IA centré */}
          <button
            onClick={() => setShowAi(true)}
            className="flex flex-col items-center justify-center flex-1 min-w-0"
            aria-label="Assistant IA"
          >
            <span className="flex items-center justify-center h-11 w-11 -mt-4 rounded-full gradient-primary text-white shadow-[0_4px_16px_hsl(var(--primary)/0.45)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">IA</span>
          </button>

          {mainLinks.slice(2).map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] transition-colors flex-1 min-w-0',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate max-w-full">{label}</span>
              </NavLink>
            );
          })}

          <button
            onClick={() => setShowMore(true)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] text-muted-foreground flex-1 min-w-0'
            )}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" />
            <span>Plus</span>
          </button>
        </div>
      </nav>

      <Sheet open={showAi} onOpenChange={setShowAi}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Assistant IA
            </SheetTitle>
          </SheetHeader>
          <div className="py-2">
            <GlobalNaturalLanguageInput onDone={() => setShowAi(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showMore} onOpenChange={setShowMore}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {moreLinks.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setShowMore(false)}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/50"
              >
                <Icon className="h-5 w-5 text-primary" />
                {label}
              </NavLink>
            ))}
            <button
              onClick={() => { setShowMore(false); signOut(); }}
              className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-5 w-5" />
              Déconnexion
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
