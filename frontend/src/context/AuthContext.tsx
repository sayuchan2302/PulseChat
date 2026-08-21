import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types';
import { AuthContext } from './auth-context';
import {
  apiClient,
  clearAuthSession,
  onAuthSessionInvalidated,
  refreshAuthSession,
  storeAuthSession,
} from '../services/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const clearLocalSession = () => {
      clearAuthSession();
      if (active) {
        setUser(null);
        setIsLoading(false);
      }
    };
    const unsubscribe = onAuthSessionInvalidated(clearLocalSession);

    void refreshAuthSession().then((session) => {
      if (!active) {
        return;
      }

      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const completeLogin = useCallback((response: { token: string; user: User }) => {
    storeAuthSession(response);
    setUser(response.user);
    setIsLoading(false);
  }, []);

  const updateCurrentUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearAuthSession();
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        completeLogin,
        updateCurrentUser,
        logout,
        isAuthenticated: user !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
