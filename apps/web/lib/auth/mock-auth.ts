import type { UserWithPassword } from '@dctwin/types';

export const MOCK_USERS: UserWithPassword[] = [
  {
    id: 'admin-01',
    name: 'Admin User',
    role: 'ADMIN',
    email: 'admin@datacenter.local',
    password: 'admin123',
  },
  {
    id: 'user-01',
    name: 'Operator',
    role: 'OPERATOR',
    email: 'operator@datacenter.local',
    password: 'operator123',
  },
];

export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-insecure-change-me';
