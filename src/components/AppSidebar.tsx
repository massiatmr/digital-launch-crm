import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Kanban, Bell, PanelLeftClose, PanelLeft, LogOut, Package, CalendarCheck, UserCheck, Settings, MessageCircle, Sparkles } from 'lucide-react';
import logo from '@/assets/logo.webp';
import logoIcon from '@/assets/logo-icon.webp';
import { useSidebarState } from './AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppInbox } from '@/hooks/useWhatsAppInbox';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { GlobalNaturalLanguageInput } from './GlobalNaturalLanguageInput';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/', icon: Kanban, label: 'Pipeline' },
  { to: '/conversations', icon: MessageCircle, label: 'Conversations' },
  { to: '/clients', icon: UserCheck, label: 'Clients' },
  { to: '/reminders', icon: Bell, label: 'Tâches' },
  { to: '/offers', icon: Package, label: 'Offres' },
  { to: '/bookings', icon: CalendarCheck, label: 'Rendez-vous' },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export function AppSidebar() {
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarState();
  const { signOut } = useAuth();
  const { unreadCount } = useWhatsAppInbox();
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/50 bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{
        background: 'linear-gradient(180deg, hsl(225 15% 5%) 0%, hsl(225 15% 3%) 100%)',
      }}
    >
      <div className={cn('flex items-center border-b border-border/50 px-3 py-4', collapsed ? 'justify-center' : 'px-4')}>
        {!collapsed ? (
          <img src={logo} alt="Logo" className="h-10 w-auto" />
        ) : (
          <img src={logoIcon} alt="Logo" className="h-8 w-8" />
        )}
      </div>

      {/* Workspace switcher */}
      <div className="px-2 pt-3">
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      {/* Bouton Assistant IA */}
      <div className="px-2 pt-2">
        <button
          onClick={() => setAiOpen(true)}
          title={collapsed ? 'Assistant IA' : undefined}
          className={cn(
            'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white transition-all duration-200 gradient-primary shadow-[0_4px_16px_hsl(var(--primary)/0.35)] hover:shadow-[0_6px_24px_hsl(var(--primary)/0.5)]',
            collapsed && 'justify-center px-0'
          )}
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Assistant IA</span>}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-4">
        {links.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
              )}
              <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active && "text-primary")} />
              {!collapsed && <span className="flex-1">{label}</span>}
              {to === '/conversations' && unreadCount > 0 && (
                <span className={cn(
                  'ml-auto inline-flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground',
                  collapsed ? 'absolute top-1 right-1 h-4 w-4' : 'h-5 min-w-5 px-1.5'
                )}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border/50 p-2 space-y-0.5">
        <button
          onClick={() => signOut()}
          title={collapsed ? 'Déconnexion' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && 'Déconnexion'}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && 'Réduire'}
        </button>
      </div>

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto custom-scrollbar">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Assistant IA
            </SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <GlobalNaturalLanguageInput onDone={() => setAiOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </aside>
  );
}
