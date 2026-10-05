'use client';

import { Bell, Sun, Moon, Menu, LogOut } from 'lucide-react';
import { useTheme } from './theme-provider';
import { Button } from './ui/button';
import { AppLogo } from './AppLogo';
import type { UserRole } from '@dctwin/types';

interface TopbarProps {
  alarmCount: number;
  userName: string;
  role: UserRole;
  onMenuClick: () => void;
}

export function Topbar({ alarmCount, userName, role: _role, onMenuClick }: TopbarProps) {
  const { theme, toggle } = useTheme();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-[var(--muted)] hover:text-[var(--text)]"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile logo (hidden on lg where sidebar is visible) */}
      <div className="lg:hidden">
        <AppLogo />
      </div>

      {/* Facility selector (desktop) */}
      <div className="hidden lg:flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--ok)]" />
        <span className="text-sm text-[var(--text)]">DC-NORTH-01</span>
      </div>

      <div className="flex-1" />

      {/* Alarm bell */}
      <button className="relative text-[var(--muted)] hover:text-[var(--text)]">
        <Bell className="h-5 w-5" />
        {alarmCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--warn)] text-[12px] font-bold text-black">
            {alarmCount}
          </span>
        )}
      </button>

      {/* Theme toggle */}
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* User avatar + logout */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-sm font-bold text-white select-none">
          {userName[0].toUpperCase()}
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
