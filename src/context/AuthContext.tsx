import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  apiRequest,
  buildApiUrl,
  extractErrorMessage,
  getInMemoryAuthToken,
  parseApiResponse,
  setInMemoryAuthToken,
} from '../lib/api';
import { WorkspaceMe } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  isAuthenticated: boolean;
  workspace: WorkspaceMe | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [hasLocalSession, setHasLocalSession] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest<WorkspaceMe>('/api/me');
      setWorkspace(data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Unable to load workspace profile.'));
      setWorkspace(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setInMemoryAuthToken(null);
        setHasLocalSession(false);
        await fetchWorkspace();
      } else if (!getInMemoryAuthToken()) {
        setWorkspace(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [fetchWorkspace]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      setInMemoryAuthToken(null);
      setHasLocalSession(false);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return;
      }
      if (err?.code === 'auth/unauthorized-domain') {
        const currentHost =
          typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        const projectId = auth.app.options.projectId || 'your Firebase project';
        setError(
          `Google Sign-In is not authorized for "${currentHost}" yet. Add "${currentHost}" under Firebase Console → Authentication → Settings → Authorized domains (project: ${projectId}), or sign in with Email & Password above.`
        );
        return;
      }
      if (err?.code === 'auth/popup-blocked') {
        setError(
          'Your browser blocked the Google Sign-In popup. Please allow popups for this site or sign in with Email & Password.'
        );
        return;
      }
      setError(extractErrorMessage(err, 'Google Sign-In failed. Please try again.'));
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const res = await fetch(buildApiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await parseApiResponse<{ token?: string }>(
          res,
          'Invalid email or password.'
        );
        if (!data?.token) {
          throw new Error('Authentication server did not return a session token.');
        }
        setInMemoryAuthToken(data.token);
        setHasLocalSession(true);
        await fetchWorkspace();
      } catch (err: unknown) {
        const message = extractErrorMessage(err, 'Sign-in failed. Please try again.');
        setError(message);
        throw new Error(message);
      }
    },
    [fetchWorkspace]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      setError(null);
      try {
        const res = await fetch(buildApiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email, password, displayName }),
        });
        const data = await parseApiResponse<{ token?: string }>(
          res,
          'Account creation failed.'
        );
        if (!data?.token) {
          throw new Error('Authentication server did not return a session token.');
        }
        setInMemoryAuthToken(data.token);
        setHasLocalSession(true);
        await fetchWorkspace();
      } catch (err: unknown) {
        const message = extractErrorMessage(err, 'Account creation failed. Please try again.');
        setError(message);
        throw new Error(message);
      }
    },
    [fetchWorkspace]
  );

  const logout = useCallback(async () => {
    setInMemoryAuthToken(null);
    setHasLocalSession(false);
    if (auth.currentUser) {
      await signOut(auth);
    }
    setWorkspace(null);
  }, []);

  const isAuthenticated = Boolean((firebaseUser || hasLocalSession) && workspace);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        isAuthenticated,
        workspace,
        loading,
        error,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        logout,
        refreshWorkspace: fetchWorkspace,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
