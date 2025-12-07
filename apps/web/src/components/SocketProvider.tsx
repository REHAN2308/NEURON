'use client';

import { useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';

/**
 * SocketProvider component that initializes the socket connection
 * and provides real-time updates for the application.
 * 
 * This component should be placed high in the component tree
 * so that socket events are handled globally.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useSocket();

  useEffect(() => {
    if (isConnected) {
      console.log('🔌 Socket provider: Connected to server');
    }
  }, [isConnected]);

  return <>{children}</>;
}

export default SocketProvider;
