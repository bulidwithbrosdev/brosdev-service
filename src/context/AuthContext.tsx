import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiRequest, extractErrorMessage } from '../lib/api';
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

function formatFirebaseAuthError(err: any, fallback: string): string {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    const currentHost =
      typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    const projectId = auth.app.options.projectId || 'serious-airlock-smn89';
    return `Google Sign-In is not authorized for "${currentHost}" yet. Add "${currentHost}" under Firebase Console → Authentication → Settings → Authorized domains (project: ${projectId}).`;
  }
  if (code === 'auth/operation-not-allowed') {
    const projectId = auth.app.options.projectId || 'serious-airlock-smn89';
    return `Email & Password authentication is not enabled yet in Firebase Console. Enable it under Firebase Console → Authentication → Sign-in method → Email/Password (project: ${projectId}), or continue with Google.`;
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 8 characters.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Your browser blocked the Google Sign-In popup. Please allow popups for this site and try again.';
  }
  return extractErrorMessage(err, fallback);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest<WorkspaceMe>('/api/me');
      setWorkspace(data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Unable to load workspace profile from Firestore.'));
      setWorkspace(null);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchWorkspace();
      } else {
        setWorkspace(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [fetchWorkspace]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') return;
      setError(formatFirebaseAuthError(err, 'Google Sign-In failed. Please try again.'));
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      const msg = formatFirebaseAuthError(err, 'Sign-in failed. Please try again.');
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      setError(null);
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        await fetchWorkspace();
      } catch (err: any) {
        const msg = formatFirebaseAuthError(err, 'Account creation failed. Please try again.');
        setError(msg);
        throw new Error(msg);
      }
    },
    [fetchWorkspace]
  );

  const logout = useCallback(async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
    setWorkspace(null);
  }, []);

  const isAuthenticated = Boolean(firebaseUser && workspace);

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
