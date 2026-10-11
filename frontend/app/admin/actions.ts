'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, keyMatches, newSession } from '@/lib/admin';

export async function signIn(form: FormData) {
  const given = String(form.get('key') ?? '');
  if (!keyMatches(given)) {
    // A wrong key waits, so guessing is slow as well as hopeless.
    await new Promise(r => setTimeout(r, 1500));
    redirect('/admin?denied=1');
  }
  (await cookies()).set(SESSION_COOKIE, newSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/admin');
}

export async function signOut() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/admin' });
  redirect('/admin');
}
