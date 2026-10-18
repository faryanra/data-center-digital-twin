'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { UserProvider } from '@/lib/auth/context';
import { FacilitySocketProvider, useFacilitySocket } from '@/hooks/useFacilitySocket';
import type { AuthUser } from '@/lib/auth/context';
import { OnboardingTip } from '@/components/OnboardingTip';

export default function DashboardLayoutClient({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  return (
    <UserProvider value={user}>
      <FacilitySocketProvider>
        <DashboardShell user={user}>{children}</DashboardShell>
      </FacilitySocketProvider>
    </UserProvider>
  );
}

function DashboardShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { snapshot } = useFacilitySocket();
  const alarmCount = snapshot?.alarms?.active_count ?? 0;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="sidebar-nav">
        <Sidebar
          role={user.role}
          userName={user.name}
          userEmail={user.email}
          alarmCount={alarmCount}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      <div className="lg:pl-[var(--sidebar-w)] main-content">
        <Topbar
          alarmCount={alarmCount}
          userName={user.name}
          role={user.role}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="p-4 md:p-6">{children}</main>
      </div>
      <OnboardingTip />
    </div>
  );
}
