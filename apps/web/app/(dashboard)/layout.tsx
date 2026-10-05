export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import DashboardLayoutClient from './DashboardLayoutClient';
import type { AuthUser } from '@/lib/auth/context';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const authUser: AuthUser = {
    name: user.name ?? user.email,
    email: user.email,
    role: user.role,
  };

  return <DashboardLayoutClient user={authUser}>{children}</DashboardLayoutClient>;
}
