import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import logo from '@/assets/logo.webp';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

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
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lastAuthErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authError || lastAuthErrorRef.current === authError) return;
    lastAuthErrorRef.current = authError;
    toast.error(authError);
  }, [authError]);

  if (loading && authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Email et mot de passe requis');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = isLogin
        ? await signIn(email, password)
        : await signUp(email, password);

      if (error) {
        if (error.message === 'Invalid login credentials') {
          toast.error('Email ou mot de passe incorrect');
        } else if (error.status && error.status < 500) {
          toast.error(error.message);
        }
      } else if (!isLogin) {
        toast.success('Compte créé ! Vérifiez votre email pour confirmer.');
      }
    } finally {
      setSubmitting(false);
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

          <form onSubmit={handleSubmit} className="space-y-5">
            {authError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
                {authError.includes('internet') ? 'Aucune connexion internet.' : 'Problème de connexion. Réessaie dans un instant.'}
              </div>
            ) : null}

            {/* Email */}
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

            {/* Password */}
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

            {/* Remember + Reset */}
            {isLogin && (
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                  <input type="checkbox" className="rounded border-border accent-primary" />
                  Rester connecté
                </label>
                <button
                  type="button"
                  className="text-primary hover:underline transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {submitting ? 'Chargement...' : isLogin ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-xs text-muted-foreground">Ou continuer avec</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          {/* Google */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm px-4 py-3 text-sm font-medium text-foreground hover:bg-card transition-all"
          >
            <GoogleIcon />
            Continuer avec Google
          </button>

          {/* Toggle */}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {isLogin ? "Pas encore de compte ?" : 'Déjà un compte ?'}{' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline transition-colors font-medium"
            >
              {isLogin ? "Créer un compte" : 'Se connecter'}
            </button>
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

        {/* Testimonials */}
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
    </div>
  );
}
