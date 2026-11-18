import { NavLink, useLocation } from 'react-router-dom';
import { Kanban, Bell, MoreHorizontal, LogOut, LayoutDashboard, Package, CalendarCheck, UserCheck, MessageCircle, Settings, Sparkles, Building2, Check } from 'lucide-react';
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
import { useWorkspaceFeatures, type FeatureKey } from '@/hooks/useWorkspaceFeatures';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useMyPermissions, permForPath } from '@/hooks/useMemberPermissions';
import { GlobalNaturalLanguageInput } from './GlobalNaturalLanguageInput';

type NavItem = { to: string; icon: any; label: string; feature?: FeatureKey };

const mainLinksAll: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/', icon: Kanban, label: 'Pipeline' },
  { to: '/conversations', icon: MessageCircle, label: 'Chats', feature: 'conversations' },
  { to: '/reminders', icon: Bell, label: 'Tâches' },
];

const moreLinksAll: NavItem[] = [
  { to: '/clients', icon: UserCheck, label: 'Clients', feature: 'clients' },
  { to: '/offers', icon: Package, label: 'Offres', feature: 'offers' },
  { to: '/bookings', icon: CalendarCheck, label: 'Rendez-vous', feature: 'bookings' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showWs, setShowWs] = useState(false);
  const { signOut } = useAuth();
  const { unreadCount } = useWhatsAppInbox();
  const { isEnabled } = useWorkspaceFeatures();
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspaces();
  const { can } = useMyPermissions();
  const mainLinks = mainLinksAll.filter((l) => (!l.feature || isEnabled(l.feature)) && can(permForPath(l.to)));
  const moreLinks = moreLinksAll.filter((l) => (!l.feature || isEnabled(l.feature)) && can(permForPath(l.to)));

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-pb h-16">
        <div className="flex items-center justify-around px-1 py-1.5">
          {mainLinks.map(({ to, icon: Icon, label }) => {
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
            {workspaces.length > 0 && (
              <button
                onClick={() => { setShowMore(false); setShowWs(true); }}
                className="col-span-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/10"
              >
                {currentWorkspace?.logo_url ? (
                  <img src={currentWorkspace.logo_url} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                ) : (
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                )}
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Espace actif</div>
                  <div className="truncate text-sm font-semibold">{currentWorkspace?.company_name || 'Aucun'}</div>
                </div>
                <span className="text-[11px] text-primary shrink-0">Changer</span>
              </button>
            )}
            <button
              onClick={() => { setShowMore(false); setShowAi(true); }}
              className="col-span-2 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white gradient-primary shadow-[0_4px_16px_hsl(var(--primary)/0.35)]"
            >
              <Sparkles className="h-5 w-5" />
              Assistant IA
            </button>
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

      <Sheet open={showWs} onOpenChange={setShowWs}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Mes espaces
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-1.5 py-3">
            {workspaces.map((w) => {
              const isCurrent = w.id === currentWorkspace?.id;
              return (
                <button
                  key={w.id}
                  onClick={() => { switchWorkspace(w.id); setShowWs(false); }}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                    isCurrent ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted/30 hover:bg-accent/50'
                  )}
                >
                  {w.logo_url ? (
                    <img src={w.logo_url} alt="" className="h-8 w-8 rounded-md object-cover shrink-0" />
                  ) : (
                    <div className="h-8 w-8 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{w.company_name || 'Sans nom'}</div>
                    {w.role && <div className="text-[10px] text-muted-foreground capitalize">{w.role}</div>}
                  </div>
                  {isCurrent && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
            <NavLink
              to="/settings/workspaces"
              onClick={() => setShowWs(false)}
              className="block w-full text-center text-xs text-primary hover:underline pt-2"
            >
              Gérer les espaces →
            </NavLink>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
