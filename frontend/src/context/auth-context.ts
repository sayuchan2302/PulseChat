import { createContext } from 'react';
import type { User } from '../types';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  completeLogin: (response: { token: string; user: User }) => void;
  updateCurrentUser: (user: User) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
