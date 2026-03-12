import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, Kanban, MessageSquare, Phone, Bell, PanelLeftClose, PanelLeft, Upload, LogOut } from 'lucide-react';
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
  { to: '/import', icon: Upload, label: 'Import CSV' },
];

export function AppSidebar() {
  const location = useLocation();
  const { collapsed, setCollapsed } = useSidebarState();
  const { signOut } = useAuth();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className={cn('flex items-center border-b border-border px-3 py-4', collapsed ? 'justify-center' : 'px-4')}>
        {!collapsed ? (
          <img src={logo} alt="Logo" className="h-10 w-auto" />
        ) : (
          <img src={logoIcon} alt="Logo" className="h-8 w-8" />
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {links.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border p-2 space-y-1">
        <button
          onClick={() => signOut()}
          title={collapsed ? 'Déconnexion' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Déconnexion'}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && 'Réduire'}
        </button>
      </div>
    </aside>
  );
}
