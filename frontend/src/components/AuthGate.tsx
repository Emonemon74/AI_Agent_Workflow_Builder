'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthProvider';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/auth/signin');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <p className="p-6 text-sm text-gray-500">Loading...</p>;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}
