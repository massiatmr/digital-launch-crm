import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useState } from 'react';
import { toast } from 'sonner';

export function NoWorkspaceState() {
  const { user, signOut } = useAuth();
  const { refetch, switchWorkspace } = useWorkspaces();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const createDefault = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const { data: ws, error } = await (supabase as any)
        .from('workspaces')
        .insert({ company_name: 'Mon espace', created_by: user.id, email: user.email })
        .select('id')
        .single();
      if (error) throw error;
      const { error: mErr } = await (supabase as any)
        .from('workspace_members')
        .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' });
      if (mErr) throw mErr;
      toast.success('Espace créé');
      await refetch();
      switchWorkspace(ws.id);
      navigate('/');
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Aucun espace de travail</h1>
          <p className="text-sm text-muted-foreground">
            Tu n'es membre d'aucun espace pour le moment. Crée-en un pour démarrer,
            ou demande à un administrateur de t'inviter.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={createDefault} disabled={creating} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            {creating ? 'Création...' : 'Créer mon espace'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
