import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { User } from '@dctwin/types';
import { JWT_SECRET } from './mock-auth';

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
    return payload as unknown as User;
  } catch {
    return null;
  }
}
