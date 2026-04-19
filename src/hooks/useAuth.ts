import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthError, Session, User } from '@supabase/supabase-js';

const AUTH_REQUEST_TIMEOUT_MS = 10000;
const AUTH_STORAGE_KEY = 'sb-rvangzupebrajhhhvewu-auth-token';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createTimeoutError(): AuthError {
  return {
    name: 'AuthTimeoutError',
    message: "Le service d'authentification ne répond pas pour le moment. Réessayez dans un instant.",
    status: 504,
  } as AuthError;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function clearStoredAuthSession() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.error('Unable to clear stored auth session', error);
  }
}

async function restoreSessionWithRetry() {
  try {
    return await withTimeout(supabase.auth.getSession());
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      return await withTimeout(supabase.auth.getSession());
    } catch {
      clearStoredAuthSession();
      throw error;
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    restoreSessionWithRetry()
      .then(({ data: { session: restoredSession } }) => {
        if (!mounted) return;
        setSession(restoredSession);
        setUser(restoredSession?.user ?? null);
      })
      .catch((error) => {
        console.error('Auth session restore failed', error);
        if (!mounted) return;
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await withTimeout(supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    }));
    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    clearStoredAuthSession();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signUp, signIn, signOut }),
    [user, session, loading, signUp, signIn, signOut],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}