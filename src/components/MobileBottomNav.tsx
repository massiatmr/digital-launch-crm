import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Kanban, Bell, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MessageSquare, Phone } from 'lucide-react';

const mainLinks = [
  { to: '/', icon: Kanban, label: 'Pipeline' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/reminders', icon: Bell, label: 'Rappels' },
];

const moreLinks = [
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/scripts', icon: Phone, label: 'Scripts' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-pb h-16">
        <div className="flex items-center justify-around px-2 py-1.5">
          {mainLinks.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </NavLink>
            );
          })}
          <button
            onClick={() => setShowMore(true)}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] text-muted-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Plus</span>
          </button>
        </div>
      </nav>

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
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
