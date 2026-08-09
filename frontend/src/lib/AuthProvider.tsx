'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { nhost } from './nhostClient';
import { extractErrorMessage } from './errors';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  accessToken: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function stateFromSession(): AuthState {
  const session = nhost.getUserSession();
  return {
    isLoading: false,
    isAuthenticated: Boolean(session),
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    accessToken: session?.accessToken ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    userId: null,
    email: null,
    accessToken: null,
  });

  const refresh = useCallback(() => {
    setState(stateFromSession());
  }, []);

  useEffect(() => {
    // Validate/refresh the persisted session (if any) once on mount.
    nhost.refreshSession(60).finally(() => refresh());
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await nhost.auth.signInEmailPassword({ email, password });
        if (res.body?.session) {
          refresh();
          return { error: null };
        }
        if (res.body?.mfa) {
          return { error: 'MFA is not supported in this demo' };
        }
        return { error: 'Sign in failed' };
      } catch (err: unknown) {
        return { error: extractErrorMessage(err, 'Sign in failed') };
      }
    },
    [refresh],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await nhost.auth.signUpEmailPassword({ email, password });
        if (res.body?.session) {
          refresh();
        }
        return { error: null }; // verification-required path: no session yet, not an error
      } catch (err: unknown) {
        return { error: extractErrorMessage(err, 'Sign up failed') };
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    const session = nhost.getUserSession();
    if (session?.refreshTokenId) {
      await nhost.auth.signOut({ refreshToken: session.refreshTokenId }).catch(() => {});
    }
    nhost.clearSession();
    refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signUp, signOut, refresh }),
    [state, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
