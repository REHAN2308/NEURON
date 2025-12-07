'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/components/AuthProvider';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        router.push(`/login?error=${error}`);
        return;
      }

      if (token) {
        setStatus('Storing credentials...');
        // Store the token in localStorage
        localStorage.setItem('auth_token', token);
        
        setStatus('Verifying session...');
        // Wait for AuthProvider to refresh and verify the token
        await refreshUser();
        
        setStatus('Redirecting...');
        // Small delay to ensure state is propagated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Use replace to prevent back button issues
        router.replace('/');
      } else {
        router.push('/login?error=no_token');
      }
    };

    handleCallback();
  }, [searchParams, router, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center animate-fadeIn">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-white flex items-center justify-center shadow-2xl shadow-white/10">
          <span className="text-3xl font-black text-black">N</span>
        </div>
        <div className="w-8 h-8 mx-auto border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-white/60">{status}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
