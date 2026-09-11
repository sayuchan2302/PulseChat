import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { dbService } from '../services/dbService';
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
  const sessionUserIdRef = useRef<number | null>(null);

  const clearPrivateCache = useCallback(() => {
    const userId = sessionUserIdRef.current;
    sessionUserIdRef.current = null;
    dbService.setActiveUser(null);
    if (userId !== null) void dbService.clearUser(userId);
  }, []);

  useEffect(() => {
    let active = true;
    const clearLocalSession = () => {
      clearAuthSession();
      clearPrivateCache();
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

      sessionUserIdRef.current = session?.user.id ?? null;
      dbService.setActiveUser(sessionUserIdRef.current);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [clearPrivateCache]);

  const completeLogin = useCallback((response: { token: string; user: User }) => {
    clearPrivateCache();
    storeAuthSession(response);
    sessionUserIdRef.current = response.user.id;
    dbService.setActiveUser(response.user.id);
    setUser(response.user);
    setIsLoading(false);
  }, [clearPrivateCache]);

  const updateCurrentUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      clearAuthSession();
      clearPrivateCache();
      setUser(null);
      setIsLoading(false);
    }
  }, [clearPrivateCache]);

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
