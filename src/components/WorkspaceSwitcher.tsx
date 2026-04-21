import { Check, ChevronsUpDown, Plus, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useIsAdmin } from '@/hooks/useWorkspaceFeatures';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface Props {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed }: Props) {
  const { workspaces, currentWorkspace, switchWorkspace, isLoading } = useWorkspaces();
  const { data: isAdmin = false } = useIsAdmin();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (isLoading || !currentWorkspace) {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 bg-white/5 border border-white/10 animate-pulse',
        collapsed && 'justify-center px-2'
      )}>
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        {!collapsed && <div className="h-4 flex-1 bg-white/10 rounded" />}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title={collapsed ? currentWorkspace.company_name : undefined}
          className={cn(
            'group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all',
            collapsed && 'justify-center px-2'
          )}
        >
          {currentWorkspace.logo_url ? (
            <img src={currentWorkspace.logo_url} alt="" className="h-5 w-5 rounded shrink-0 object-cover" />
          ) : (
            <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
              <Building2 className="h-3 w-3 text-primary" />
            </div>
          )}
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">{currentWorkspace.company_name || 'Espace'}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
          Mes espaces
        </div>
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {workspaces.map((w) => {
            const isCurrent = w.id === currentWorkspace.id;
            return (
              <button
                key={w.id}
                onClick={() => {
                  switchWorkspace(w.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-left',
                  isCurrent && 'bg-accent'
                )}
              >
                {w.logo_url ? (
                  <img src={w.logo_url} alt="" className="h-5 w-5 rounded shrink-0 object-cover" />
                ) : (
                  <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center shrink-0">
                    <Building2 className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{w.company_name || 'Sans nom'}</div>
                  {w.role && <div className="text-[10px] text-muted-foreground capitalize">{w.role}</div>}
                </div>
                {isCurrent && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <div className="border-t border-border/50 mt-1 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                setOpen(false);
                navigate('/settings/workspaces');
              }}
            >
              <Plus className="h-4 w-4" />
              Créer un espace
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
