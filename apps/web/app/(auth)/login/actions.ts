'use server';

import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { MOCK_USERS, JWT_SECRET } from '@/lib/auth/mock-auth';

export async function loginAction(formData: FormData): Promise<{ error: string } | void> {
  const email = (formData.get('email') as string | null)?.trim();
  const password = formData.get('password') as string | null;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const user = MOCK_USERS.find((u) => u.email === email && u.password === password);
  if (!user) {
    return { error: 'Invalid email or password.' };
  }

  const token = await new SignJWT({ id: user.id, name: user.name, role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(JWT_SECRET));

  const cookieStore = await cookies();
  cookieStore.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 28800,
    path: '/',
  });

  redirect('/dashboard');
}
