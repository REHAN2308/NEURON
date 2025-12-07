'use client';

import { useAuth } from '@/components/AuthProvider';
import { logout } from '@/lib/auth';
import { LogOut, User as UserIcon } from 'lucide-react';

export default function UserMenu() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      {/* User Avatar */}
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user.name}
          className="w-8 h-8 rounded-full border-2 border-white/20 object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
          <UserIcon className="w-4 h-4 text-white/70" />
        </div>
      )}
      
      {/* User Name (hidden on mobile) */}
      <span className="hidden md:block text-sm text-white/80 max-w-[120px] truncate">
        {user.name}
      </span>
      
      {/* Logout Button */}
      <button
        onClick={logout}
        className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
        title="Logout"
      >
        <LogOut className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
      </button>
    </div>
  );
}
