import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.webp';
import { Button } from '@/components/ui/button';
import type { AuthError, AuthResponse } from '@supabase/supabase-js';

const INVITE_STORAGE_KEY = 'pending_invite_token';

const testimonials = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "Plateforme incroyable ! L'expérience est fluide et les fonctionnalités sont exactement ce dont j'avais besoin."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/64.jpg",
    name: "Marcus Johnson",
    handle: "@marcustech",
    text: "Ce CRM a transformé ma façon de travailler. Design épuré, fonctionnalités puissantes et excellent support."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "J'ai testé beaucoup de CRM, mais celui-ci se démarque. Intuitif, fiable et vraiment utile pour la productivité."
  },
];

export default function AuthPage() {
  const { user, loading, authStatus, authError, clearAuthError, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Récupération du token invite depuis URL OU localStorage (post email-confirm)
  const urlInvite = searchParams.get('invite');
  const [inviteToken] = useState<string | null>(() => {
    if (urlInvite) {
      try { localStorage.setItem(INVITE_STORAGE_KEY, urlInvite); } catch {}
      return urlInvite;
    }
    try { return localStorage.getItem(INVITE_STORAGE_KEY); } catch { return null; }
  });

  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [isLogin, setIsLogin] = useState(!inviteToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const lastAuthErrorRef = useRef<string | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!authError || lastAuthErrorRef.current === authError) return;
    lastAuthErrorRef.current = authError;
    toast.error(authError);
  }, [authError]);

  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      const { data } = await supabase.rpc('get_invitation_by_token', { p_token: inviteToken });
      const info = data as { valid?: boolean; email?: string } | null;
      if (info?.valid && info.email) {
        setInviteValid(true);
        setInviteEmail(info.email);
        const invitedAddress = info.email;
        setEmail((prev) => prev || invitedAddress);
        setIsLogin(false);
      } else {
        setInviteValid(false);
        try { localStorage.removeItem(INVITE_STORAGE_KEY); } catch {}
      }
    })();
  }, [inviteToken]);

  // Cas : déjà connecté + invite présent → consume direct + redirect
  useEffect(() => {
    if (!user || !inviteToken || consumedRef.current) return;
    consumedRef.current = true;
    (async () => {
      const { data, error } = await (supabase.rpc as any)(
        'consume_workspace_invitation',
        { p_token: inviteToken, p_user_id: user.id }
      );
      try { localStorage.removeItem(INVITE_STORAGE_KEY); } catch {}
      if (error || !data?.success) {
        toast.error("Invitation invalide ou expirée");
      } else {
        toast.success("Tu as rejoint l'espace avec succès");
        if (data.workspace_id) {
          try { localStorage.setItem('current_workspace_id', data.workspace_id); } catch {}
        }
      }
      navigate('/', { replace: true });
    })();
  }, [user, inviteToken, navigate]);

  if (loading && authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !inviteToken) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Email et mot de passe requis');
      return;
    }
    if (!isLogin && inviteToken && inviteEmail && email.trim().toLowerCase() !== inviteEmail.toLowerCase()) {
      toast.error("L'email doit correspondre à celui de l'invitation");
      return;
    }
    setSubmitting(true);
    try {
      // Pour les signups, attache le token invite dans les metadata
      // → trigger DB auto-confirme l'email + auto-consume après confirmation
      const signUpExtra = inviteToken ? { data: { invite_token: inviteToken } } : undefined;
      const result: { error: AuthError | null; data?: AuthResponse['data'] } = isLogin
        ? await signIn(email, password)
        : await signUp(email, password, signUpExtra);
      const { error } = result;

      if (error) {
        if (error.message === 'Invalid login credentials') {
          toast.error('Email ou mot de passe incorrect');
        } else if (error.status && error.status < 500) {
          toast.error(error.message);
        }
      } else if (!isLogin) {
        const signupData = result.data;
        if (signupData?.user?.identities?.length === 0) {
          setIsLogin(true);
          setPassword('');
          setAccountNotice('Cette adresse possède déjà un compte. Utilise ton mot de passe habituel ou réinitialise-le. Le mot de passe saisi ici ne remplace pas l’ancien.');
          return;
        }
        if (!signupData?.session && !signupData?.user?.email_confirmed_at) {
          setIsLogin(true);
          setPassword('');
          setAccountNotice('Vérifie ton email pour confirmer ton compte avant de te connecter. Ton invitation est conservée.');
          return;
        }
        if (inviteToken) {
          // Invité : email auto-confirmé par trigger DB → on peut connecter direct
          const signInErr = signupData?.session ? null : (await signIn(email, password)).error;
          if (signInErr) {
            setIsLogin(true);
            setAccountNotice('Connexion impossible. Utilise ton mot de passe habituel ou réinitialise-le pour rejoindre cet espace.');
            toast.error(signInErr.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : signInErr.message);
          } else {
            // The authenticated effect consumes the invitation once.
            toast.success("Compte créé. Tu rejoins l'espace…");
          }
        } else {
          toast.success('Compte créé ! Vérifie ton email pour confirmer.');
        }
      } else if (isLogin && inviteToken) {
        // login avec invite → useEffect ci-dessus s'occupe du consume
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Email envoyé ! Vérifie ta boîte mail.');
        setResetOpen(false);
        setResetEmail('');
      }
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Left column: form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div
          className="mx-auto w-full max-w-md"
          style={{
            opacity: 0,
            filter: 'blur(10px)',
            transform: 'translateY(20px)',
            animation: 'fadeSlideIn 0.8s ease-out forwards',
          }}
        >
          <div className="mb-10">
            <img src={logo} alt="Digital Launch CRM" className="h-10 mb-6" />
            <h1 className="font-heading text-3xl tracking-tight text-foreground">
              {isLogin ? 'Bon retour parmi nous' : 'Créer un compte'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isLogin
                ? 'Accédez à votre CRM et gérez vos leads'
                : 'Rejoignez la plateforme et commencez à convertir'}
            </p>
          </div>

          {inviteToken && inviteValid === false && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              Ce lien d'invitation est invalide ou expiré. Demande un nouveau lien à ton administrateur.
            </div>
          )}
          {inviteToken && inviteValid && (
            <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
              Invitation valide pour <span className="font-semibold">{inviteEmail}</span>.
              {' '}{isLogin ? 'Connecte-toi avec ton compte pour rejoindre cet espace.' : 'Crée ton compte, ou connecte-toi si tu en as déjà un.'}
            </div>
          )}

          {accountNotice && (
            <div role="status" className="mb-4 rounded-md border border-border bg-card p-4 text-sm text-foreground">
              <p>{accountNotice}</p>
              <Button type="button" variant="link" className="mt-2 h-auto whitespace-normal px-0" onClick={() => { setResetEmail(email); setResetOpen(true); }}>
                Réinitialiser mon mot de passe
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {authError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
                {authError.includes('internet') ? 'Aucune connexion internet.' : 'Problème de connexion. Réessaie dans un instant.'}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Adresse email
              </label>
              <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-0.5">
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={e => {
                    if (authError) clearAuthError();
                    setEmail(e.target.value);
                  }}
                  placeholder="votre@email.com"
                  className="w-full rounded-[10px] bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mot de passe
              </label>
              <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-0.5">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={e => {
                      if (authError) clearAuthError();
                      setPassword(e.target.value);
                    }}
                    placeholder="••••••••"
                    className="w-full rounded-[10px] bg-transparent px-4 py-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {isLogin && (
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                  <input type="checkbox" className="rounded border-border accent-primary" />
                  Rester connecté
                </label>
                <button
                  type="button"
                  onClick={() => { setResetEmail(email); setResetOpen(true); }}
                  className="text-primary hover:underline transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Chargement...' : isLogin ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isLogin ? (
              <>
                Pas encore de compte ?{' '}
                <span className="text-foreground/70">L'inscription se fait sur invitation uniquement.</span>
              </>
            ) : (
              <>
                Déjà un compte ?{' '}
                <button
                  onClick={() => setIsLogin(true)}
                  className="text-primary hover:underline transition-colors font-medium"
                >
                  Se connecter
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Right column: hero + testimonials */}
      <div
        className="hidden lg:flex relative w-1/2 items-center justify-center overflow-hidden rounded-l-3xl"
        style={{
          opacity: 0,
          filter: 'blur(10px)',
          transform: 'translateX(30px)',
          animation: 'slideRightIn 0.8s 0.3s ease-out forwards',
        }}
      >
        <img
          src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&q=80"
          alt="Workspace"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-background/20" />

        <div className="relative z-10 flex flex-col gap-4 p-10 max-w-lg">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5"
              style={{
                opacity: 0,
                filter: 'blur(5px)',
                transform: 'translateY(15px) scale(0.98)',
                animation: `testimonialIn 0.6s ${0.6 + i * 0.15}s ease-out forwards`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <img src={t.avatarSrc} alt={t.name} className="h-10 w-10 rounded-full object-cover ring-2 ring-white/20" />
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/50">{t.handle}</p>
                </div>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reset password modal */}
      {resetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
          onClick={() => setResetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-heading text-xl mb-2">Réinitialiser le mot de passe</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Entre ton email, on t'envoie un lien pour choisir un nouveau mot de passe.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-card/50 p-0.5">
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full rounded-[10px] bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResetOpen(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {resetSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Envoyer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
