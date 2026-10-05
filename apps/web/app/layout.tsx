import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { PwaInit } from '@/components/pwa-init';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#0F1117',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: 'DC-NORTH-01 Digital Twin',
    template: '%s | DC-NORTH-01',
  },
  description: 'Real-time data center monitoring and control platform',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/brand-icon.svg',
    apple: '/icons/brand-icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Runs synchronously before any CSS — prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('dc-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();` }} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/brand-icon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="DC-NORTH-01" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <PwaInit />
      </body>
    </html>
  );
}
