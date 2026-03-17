import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, Kanban, MessageSquare, Phone, Bell, PanelLeftClose, PanelLeft, Upload, LogOut, Zap } from 'lucide-react';
import logo from '@/assets/logo.webp';
import logoIcon from '@/assets/logo-icon.webp';
import { useSidebarState } from './AppLayout';
import { useAuth } from '@/hooks/useAuth';

const links = [
  { to: '/', icon: Kanban, label: 'Pipeline' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/scripts', icon: Phone, label: 'Scripts' },
  { to: '/reminders', icon: Bell, label: 'Rappels' },
  { to: '/sequences', icon: Zap, label: 'Séquences' },
  { to: '/import', icon: Upload, label: 'Import CSV' },
];

export function AppSidebar() {
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarState();
  const { signOut } = useAuth();

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
              {/* Active indicator bar */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
              )}
              <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active && "text-primary")} />
              {!collapsed && <span>{label}</span>}
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
    </aside>
  );
}
