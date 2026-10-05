'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Map,
  Server,
  Bell,
  Zap,
  FileBarChart,
  Settings,
  Activity,
  X,
  LogOut,
  SlidersHorizontal,
  TestTube2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from './AppLogo';
import type { UserRole } from '@dctwin/types';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
}

interface NavSection {
  label: string;
  adminOnly?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'MONITOR',
    items: [
      { href: '/dashboard',    label: 'Overview',  icon: LayoutDashboard },
      { href: '/facility-map', label: 'Topology',  icon: Map },
      { href: '/alarms',       label: 'Alarms',    icon: Bell, badge: true },
    ],
  },
  {
    label: 'ASSETS',
    items: [
      { href: '/equipment', label: 'Equipment', icon: Server },
      { href: '/sensors',   label: 'Sensors',   icon: Activity },
    ],
  },
  {
    label: 'ANALYZE',
    items: [
      { href: '/energy',  label: 'Energy',  icon: Zap },
      { href: '/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  {
    label: 'OPERATE',
    adminOnly: true,
    items: [
      { href: '/controls',   label: 'Controls',   icon: SlidersHorizontal },
      { href: '/simulation', label: 'Simulation', icon: TestTube2 },
    ],
  },
  {
    label: 'ADMIN',
    adminOnly: true,
    items: [
      { href: '/admin/users', label: 'Users',    icon: Users },
      { href: '/settings',   label: 'Settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  role: UserRole;
  userName: string;
  userEmail: string;
  alarmCount: number;
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ role, userName, userEmail, alarmCount, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login');
  }

  const visibleSections = NAV_SECTIONS.filter(s => !s.adminOnly || role === 'ADMIN');

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[var(--sidebar-w)] flex-col border-r border-[var(--border)] bg-[var(--surface)]',
          'transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-[var(--border)]">
          <AppLogo />
          <button
            onClick={onClose}
            className="lg:hidden text-[var(--muted)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-3">
          {visibleSections.map((section) => (
            <div key={section.label}>
              {/* Section header */}
              <div className="px-1 pb-1 pt-5">
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  color: 'var(--muted)', textTransform: 'uppercase',
                }}>
                  {section.label}
                </span>
              </div>

              {/* Section items */}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-sm px-3 py-2 text-[14px] font-medium transition-colors',
                        active
                          ? 'border-l-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] pl-[10px]'
                          : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && alarmCount > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--crit)] text-white leading-none">
                          {alarmCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User chip + sign out */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--accent)' }}
            >
              {userName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text)]">{userEmail}</p>
              <span className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
                role === 'ADMIN' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--muted)]'
              )}>
                {role}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="shrink-0 text-[var(--muted)] hover:text-[var(--crit)] transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
