import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
import type { Role, AuthState } from '@/context/AuthContext';

export type { Role, AuthState };

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
