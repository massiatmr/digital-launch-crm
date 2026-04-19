import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useOwnerProfile } from '@/hooks/useOwnerProfile';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';

export function OnboardingGuard() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useOwnerProfile();
  const { workspaces, loading: wsLoading } = useWorkspaces();

  if (isLoading || wsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Si l'utilisateur appartient à AU MOINS un workspace qu'il n'a PAS créé
  // (= invité dans un workspace existant), bypass le wizard.
  const isInvitedMember = workspaces?.some(
    (w: any) => w.created_by && w.created_by !== user?.id
  );

  if (isInvitedMember) {
    return <Outlet />;
  }

  if (!profile?.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
