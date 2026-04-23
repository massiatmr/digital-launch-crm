import logo from '@/assets/logo.webp';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { cn } from '@/lib/utils';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderMessages } from './HeaderMessages';

interface Props {
  className?: string;
}

export function WorkspaceHeader({ className }: Props) {
  const { currentWorkspace } = useWorkspaces();
  const logoUrl = currentWorkspace?.logo_url || logo;
  const name = currentWorkspace?.company_name || 'Digital Launch';

  return (
    <header
      className={cn(
        'flex items-center justify-between px-6 border-b border-border/50 backdrop-blur-sm sticky top-0 z-50',
        className
      )}
      style={{
        background: 'linear-gradient(90deg, hsl(225 15% 5%) 0%, hsl(225 15% 4%) 100%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        height: 'calc(4rem + env(safe-area-inset-top, 0px))',
      }}
    >
      <img
        src={logoUrl}
        alt={name}
        className="h-9 w-auto max-w-[180px] object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = logo;
        }}
      />
      <div className="flex items-center gap-1">
        <HeaderMessages />
        <HeaderNotifications />
      </div>
    </header>
  );
}
