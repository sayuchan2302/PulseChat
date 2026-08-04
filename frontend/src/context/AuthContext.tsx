import { useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';
import { AuthContext } from './auth-context';
import { clearAuthSession } from '../services/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const refreshToken = localStorage.getItem('refreshToken');

    if (storedUser && refreshToken) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (userData: User, token: string, refreshToken: string) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    setUser(userData);
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
