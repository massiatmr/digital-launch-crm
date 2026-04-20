import logo from '@/assets/logo.webp';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

/**
 * Header séparé affiché au-dessus de la sidebar.
 * Affiche le logo du workspace actif. Si aucun logo défini → logo Digital Launch par défaut.
 */
export function WorkspaceHeader({ className }: Props) {
  const { currentWorkspace } = useWorkspaces();
  const logoUrl = currentWorkspace?.logo_url || logo;
  const name = currentWorkspace?.company_name || 'Digital Launch';

  return (
    <header
      className={cn(
        'h-16 flex items-center px-6 border-b border-border/50 bg-sidebar/80 backdrop-blur-sm sticky top-0 z-40',
        className
      )}
      style={{
        background: 'linear-gradient(90deg, hsl(225 15% 5%) 0%, hsl(225 15% 4%) 100%)',
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
    </header>
  );
}
