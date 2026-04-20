import { Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { NoWorkspaceState } from './NoWorkspaceState';

export function OnboardingGuard() {
  const { workspaces, isLoading: wsLoading } = useWorkspaces();

  if (wsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Onboarding wizard désactivé : si aucun workspace, afficher l'état d'attente.
  // Seuls les admins peuvent créer un workspace (via Paramètres).
  if (!workspaces || workspaces.length === 0) {
    return <NoWorkspaceState />;
  }

  return <Outlet />;
}
