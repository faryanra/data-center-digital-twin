'use client';

import { createContext, useContext } from 'react';
import type { UserRole } from '@dctwin/types';

export interface AuthUser {
  email: string;
  name: string;
  role: UserRole;
}

const UserContext = createContext<AuthUser | null>(null);

export const UserProvider = UserContext.Provider;

export function useAuth(): { user: AuthUser | null } {
  const user = useContext(UserContext);
  return { user };
}
