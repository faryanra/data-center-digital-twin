import { Suspense } from 'react';
import { UsersClient } from './UsersClient';

export const dynamic = 'force-dynamic';

export default function UsersPage() {
  return (
    <Suspense fallback={
      <div className="page-content">
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Loading users…
        </div>
      </div>
    }>
      <UsersClient />
    </Suspense>
  );
}
