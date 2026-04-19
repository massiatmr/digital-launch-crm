import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthError, Session, User } from '@supabase/supabase-js';

const AUTH_REQUEST_TIMEOUT_MS = 8000;
const AUTH_STORAGE_KEY = 'sb-rvangzupebrajhhhvewu-auth-token';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createTimeoutError(): AuthError {
  return {
    name: 'AuthTimeoutError',
    message: "Le service d'authentification ne répond pas pour le moment. Réessayez dans un instant.",
    status: 504,
  } as AuthError;
}

function createOfflineError(): AuthError {
  return {
    name: 'OfflineAuthError',
    message: 'Aucune connexion internet. Vérifiez votre réseau puis réessayez.',
    status: 0,
  } as AuthError;
}

function normalizeAuthError(error: unknown): AuthError {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return createOfflineError();
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return error as AuthError;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return createTimeoutError();
  }

  return {
    name: 'AuthUnknownError',
    message: 'Problème de connexion. Réessayez dans un instant.',
    status: 500,
  } as AuthError;
}

function isRetryableAuthError(error: AuthError) {
  return !error.status || error.status >= 500 || error.name === 'OfflineAuthError' || error.name === 'AuthTimeoutError';
}

function logAuthError(scope: string, error: unknown) {
  const normalized = normalizeAuthError(error);

  console.error(`[auth] ${scope}`, {
    status: normalized.status ?? null,
    message: normalized.message,
    error,
  });

  return normalized;
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

async function clearInvalidSession() {
  clearStoredAuthSession();

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('[auth] local session cleanup failed', error);
  }
}

async function restoreSessionWithRetry() {
  try {
    return await withTimeout(supabase.auth.getSession());
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      return await withTimeout(supabase.auth.getSession());
    } catch (retryError) {
      throw normalizeAuthError(retryError ?? error);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const authRequestInFlightRef = useRef(false);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

       if (nextSession?.user) {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }

      if (nextSession?.user) {
        setAuthError(null);
      }

      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    void supabase.auth.stopAutoRefresh();

    restoreSessionWithRetry()
      .then(({ data: { session: restoredSession } }) => {
        applySession(restoredSession);
      })
      .catch(async (error) => {
        const normalized = logAuthError('session restore failed', error);
        await clearInvalidSession();

        if (!mounted) return;

        setSession(null);
        setUser(null);
        setAuthError(normalized.message);
        setLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (authRequestInFlightRef.current) {
      return { error: normalizeAuthError(new Error('Une requête de connexion est déjà en cours.')) };
    }

    authRequestInFlightRef.current = true;
    setAuthError(null);

    try {
      const { error } = await withTimeout(supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      }));

      if (error) {
        const normalized = logAuthError('sign up failed', error);

        if (isRetryableAuthError(normalized)) {
          setAuthError(normalized.message);
        }

        return { error: normalized };
      }

      return { error: null };
    } catch (error) {
      const normalized = logAuthError('sign up failed', error);

      if (isRetryableAuthError(normalized)) {
        await clearInvalidSession();
        setSession(null);
        setUser(null);
        setAuthError(normalized.message);
      }

      setLoading(false);
      return { error: normalized };
    } finally {
      authRequestInFlightRef.current = false;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (authRequestInFlightRef.current) {
      return { error: normalizeAuthError(new Error('Une requête de connexion est déjà en cours.')) };
    }

    authRequestInFlightRef.current = true;
    setAuthError(null);

    try {
      const { error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));

      if (error) {
        const normalized = logAuthError('sign in failed', error);

        if (isRetryableAuthError(normalized)) {
          await clearInvalidSession();
          setSession(null);
          setUser(null);
          setAuthError(normalized.message);
        }

        setLoading(false);
        return { error: normalized };
      }

      return { error: null };
    } catch (error) {
      const normalized = logAuthError('sign in failed', error);

      if (isRetryableAuthError(normalized)) {
        await clearInvalidSession();
        setSession(null);
        setUser(null);
        setAuthError(normalized.message);
      }

      setLoading(false);
      return { error: normalized };
    } finally {
      authRequestInFlightRef.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    clearStoredAuthSession();

    setSession(null);
    setUser(null);
    setAuthError(null);
    setLoading(false);

    try {
      await withTimeout(supabase.auth.signOut(), 4000);
    } catch (error) {
      logAuthError('sign out failed', error);
      await clearInvalidSession();
    }
  }, []);

  const authStatus = useMemo<AuthStatus>(() => {
    if (loading) return 'loading';
    if (user) return 'authenticated';
    if (authError) return 'error';
    return 'unauthenticated';
  }, [loading, user, authError]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, authStatus, authError, signUp, signIn, signOut, clearAuthError }),
    [user, session, loading, authStatus, authError, signUp, signIn, signOut, clearAuthError],
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