'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { redirectToLogin } from '@/lib/auth';
import { Zap } from 'lucide-react';
import initLandingBackground from '@/utils/landing-init';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Initialize animated background
  useEffect(() => {
    return initLandingBackground();
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div id="login" className="min-h-screen flex flex-col relative overflow-hidden">
      {/* REMOVED: Decorative circles/geometric elements - replaced with CSS animated background */}

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <div className="max-w-md w-full text-center animate-fadeIn">
          {/* Logo */}
          <div className="mb-8 animate-scaleIn">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-white flex items-center justify-center shadow-2xl shadow-white/10">
              <span className="text-4xl font-black text-black">N</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-white animate-slideUp">
            NEURON
          </h1>
          <p className="text-lg text-white/70 mb-2 animate-slideUp animation-delay-100">
            AI-Powered Development Platform
          </p>
          <p className="text-sm text-white/50 mb-10 max-w-sm mx-auto animate-slideUp animation-delay-200">
            Transform your ideas into production-ready code with the power of AI
          </p>

          {/* Login Button */}
          <button
            onClick={redirectToLogin}
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-black rounded-xl font-semibold text-base transition-all hover:scale-105 hover:shadow-2xl hover:shadow-white/20 active:scale-100 animate-slideUp animation-delay-300"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" className="flex-shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Features */}
          <div className="flex flex-wrap justify-center gap-6 mt-12 animate-slideUp animation-delay-400">
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
                <Zap className="w-3 h-3 text-white" />
              </div>
              <span>Lightning Fast</span>
            </div>
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-xs">🎯</span>
              </div>
              <span>Pixel Perfect</span>
            </div>
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-xs">🔒</span>
              </div>
              <span>Secure</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs text-white/30 relative z-10">
        Powered by NEURON AI • Made with ♥
      </footer>
    </div>
  );
}
