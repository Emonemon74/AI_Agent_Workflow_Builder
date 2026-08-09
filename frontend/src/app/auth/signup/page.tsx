'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthProvider';

export default function SignUpPage() {
  const { signUp, isAuthenticated } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signUp(email, password);
    setSubmitting(false);
    if (error) setError(error);
    else setDone(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Create account</h1>
      {done ? (
        <p className="text-sm text-gray-700">
          Account created. Ask an org owner to add you as a member, then{' '}
          <Link href="/auth/signin" className="underline">
            sign in
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
          <input
            type="password"
            required
            minLength={9}
            placeholder="Password (min 9 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Sign up'}
          </button>
        </form>
      )}
      <p className="text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/auth/signin" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
