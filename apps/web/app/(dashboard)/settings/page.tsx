import { getCurrentUser } from '@/lib/auth/session';
import { SettingsClient } from './SettingsClient';

export default async function SettingsPage() {
  const user = await getCurrentUser();

  // Middleware enforces the redirect; this is a defense-in-depth fallback
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-4xl font-bold text-[var(--crit)]">403</p>
        <p className="text-sm text-[var(--muted)]">This page is restricted to ADMIN users.</p>
      </div>
    );
  }

  return <SettingsClient />;
}
