import { Building2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function NoWorkspaceState() {
  const { user, signOut } = useAuth();
  const { refetch, switchWorkspace } = useWorkspaces();
  const [creating, setCreating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase.rpc as any)('has_role', {
        _user_id: user.id,
        _role: 'admin',
      });
      setIsAdmin(!!data);
    })();
  }, [user]);

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
          {isAdmin ? <Building2 className="h-8 w-8 text-primary" /> : <Mail className="h-8 w-8 text-primary" />}
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            {isAdmin ? 'Aucun espace de travail' : 'En attente d\'invitation'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? 'Crée un espace pour démarrer.'
              : 'Ton compte est créé. Un administrateur doit t\'inviter dans un espace pour accéder à la plateforme.'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {isAdmin && (
            <Button onClick={createDefault} disabled={creating} className="w-full gap-2">
              {creating ? 'Création...' : 'Créer un espace'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
