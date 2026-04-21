import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.webp';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase écrit la session via le hash #access_token=...&type=recovery
    // onAuthStateChange capture l'événement PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });
    // Fallback : si déjà connecté (token déjà parsé)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }

      // Si l'utilisateur a une invitation en attente (ex: arrivé ici via un lien d'invitation
      // qui a déclenché un flux recovery), on la consomme automatiquement pour le rattacher
      // à son workspace — sinon il resterait bloqué sur "En attente d'invitation".
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const storedToken = (() => {
          try { return localStorage.getItem('pending_invite_token'); } catch { return null; }
        })();

        let consumed = false;
        if (user && storedToken) {
          const { data } = await (supabase.rpc as any)('consume_workspace_invitation', {
            p_token: storedToken,
            p_user_id: user.id,
          });
          if (data?.success) {
            consumed = true;
            if (data.workspace_id) {
              try { localStorage.setItem('current_workspace_id', data.workspace_id); } catch {}
            }
          }
          try { localStorage.removeItem('pending_invite_token'); } catch {}
        }

        // Fallback : chercher une invitation en attente pour l'email de l'utilisateur
        if (user && !consumed) {
          const { data: inv } = await (supabase as any)
            .from('invitations')
            .select('token')
            .ilike('email', user.email || '')
            .is('used_at', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (inv?.token) {
            const { data } = await (supabase.rpc as any)('consume_workspace_invitation', {
              p_token: inv.token,
              p_user_id: user.id,
            });
            if (data?.success && data.workspace_id) {
              try { localStorage.setItem('current_workspace_id', data.workspace_id); } catch {}
            }
          }
        }
      } catch (err) {
        console.warn('[reset-password] invitation auto-consume skipped', err);
      }

      toast.success('Mot de passe mis à jour');
      // Reload pour forcer le refresh des workspaces avec le nouveau membership
      window.location.replace('/');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={logo} alt="Digital Launch CRM" className="mx-auto h-10 mb-6" />
          <h1 className="font-heading text-2xl tracking-tight text-foreground">
            Nouveau mot de passe
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choisis un nouveau mot de passe sécurisé.
          </p>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nouveau mot de passe
              </label>
              <div className="relative rounded-xl border border-border/50 bg-card/50 p-0.5">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-[10px] bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confirmer
              </label>
              <div className="rounded-xl border border-border/50 bg-card/50 p-0.5">
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-[10px] bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
