'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useProjectStore } from '@/store/useProjectStore';

// ============================================
// Socket Configuration
// ============================================
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================
// Socket Event Types
// ============================================
interface ProjectCompletedEvent {
  projectId: string;
  status: 'COMPLETED' | 'FAILED';
  generatedCode?: string;
  errorMessage?: string;
  timestamp: string;
}

interface ProjectStatusEvent {
  projectId: string;
  status: string;
  progress?: number;
  timestamp: string;
}

interface ProjectErrorEvent {
  projectId: string;
  error: string;
  timestamp: string;
}

interface ProjectCodeUpdatedEvent {
  projectId: string;
  updatedCode: string;
  timestamp: string;
}

// Callback type for code update notifications
type CodeUpdateCallback = (code: string) => void;

// Store for code update callbacks - module-level to persist across hook instances
const codeUpdateCallbacks = new Map<string, Set<CodeUpdateCallback>>();

// ============================================
// useSocket Hook
// ============================================
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const projectIdRef = useRef<string | null>(null);
  const { 
    projectId, 
    setGeneratedCode, 
    setStatus, 
    setError 
  } = useProjectStore();

  // Keep projectIdRef in sync with projectId
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Initialize socket connection
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current.on('connect', () => {
        console.log('🔌 Socket connected:', socketRef.current?.id);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('🔌 Socket connection error:', error.message);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Join project room when projectId changes
  useEffect(() => {
    if (!socketRef.current || !projectId) return;

    // Join the project room
    socketRef.current.emit('join-project', projectId);
    console.log(`📁 Joined project room: project-${projectId}`);

    // Listen for project completion
    const handleProjectCompleted = (data: ProjectCompletedEvent) => {
      console.log('📤 Received project-completed event:', data);
      
      if (data.projectId === projectId) {
        if (data.status === 'COMPLETED' && data.generatedCode) {
          setGeneratedCode(data.generatedCode);
          setStatus('completed');
          console.log('✅ Code updated from socket event');
        } else if (data.status === 'FAILED') {
          setError(data.errorMessage || 'Code generation failed');
          setStatus('error');
        }
      }
    };

    // Listen for status updates
    const handleProjectStatus = (data: ProjectStatusEvent) => {
      console.log('📤 Received project-status event:', data);
      
      if (data.projectId === projectId) {
        if (data.status === 'PROCESSING') {
          setStatus('processing');
        }
      }
    };

    // Listen for errors
    const handleProjectError = (data: ProjectErrorEvent) => {
      console.log('📤 Received project-error event:', data);
      
      if (data.projectId === projectId) {
        setError(data.error);
        setStatus('error');
      }
    };

    // Listen for code updates (from modify-code jobs)
    const handleCodeUpdated = (data: ProjectCodeUpdatedEvent) => {
      console.log('\n════════════════════════════════════════════════════════');
      console.log('🔔 [SOCKET] RECEIVED project:code-updated EVENT!');
      console.log('════════════════════════════════════════════════════════');
      console.log('📋 Event data:', {
        projectId: data.projectId,
        codeLength: data.updatedCode?.length || 0,
        timestamp: data.timestamp,
      });
      // Use the ref for most current projectId value (avoids stale closure)
      const currentProjectId = projectIdRef.current || projectId;
      console.log(`📍 Current projectId (from ref): ${currentProjectId}`);
      console.log(`📍 Current projectId (from closure): ${projectId}`);
      console.log(`🎯 Match: ${data.projectId === currentProjectId}`);
      
      if (data.projectId === currentProjectId) {
        console.log('\n✅ Project ID matches! Updating state...');
        
        // Update the Zustand store - this triggers re-renders in subscribed components
        setGeneratedCode(data.updatedCode);
        setStatus('completed');
        console.log('✅ Zustand store updated with new code!');
        
        // Notify all registered callbacks for this project
        const callbacks = codeUpdateCallbacks.get(currentProjectId);
        const callbackCount = callbacks?.size || 0;
        console.log(`📢 Notifying ${callbackCount} registered callback(s)...`);
        
        if (callbacks && callbacks.size > 0) {
          let callbackIndex = 0;
          callbacks.forEach((callback) => {
            callbackIndex++;
            try {
              console.log(`   → Calling callback ${callbackIndex}/${callbackCount}...`);
              callback(data.updatedCode);
              console.log(`   ✅ Callback ${callbackIndex} executed successfully`);
            } catch (err) {
              console.error(`   ❌ Callback ${callbackIndex} error:`, err);
            }
          });
        }
        
        console.log('════════════════════════════════════════════════════════');
        console.log('✅ LIVE PREVIEW SHOULD NOW UPDATE!');
        console.log('════════════════════════════════════════════════════════\n');
      } else {
        console.log('\n⚠️ Project ID mismatch - ignoring event');
        console.log(`   Expected: ${currentProjectId}`);
        console.log(`   Received: ${data.projectId}\n`);
      }
    };

    socketRef.current.on('project-completed', handleProjectCompleted);
    socketRef.current.on('project-status', handleProjectStatus);
    socketRef.current.on('project-error', handleProjectError);
    socketRef.current.on('project:code-updated', handleCodeUpdated);

    return () => {
      if (socketRef.current) {
        socketRef.current.off('project-completed', handleProjectCompleted);
        socketRef.current.off('project-status', handleProjectStatus);
        socketRef.current.off('project-error', handleProjectError);
        socketRef.current.off('project:code-updated', handleCodeUpdated);
        socketRef.current.emit('leave-project', projectId);
        console.log(`📁 Left project room: project-${projectId}`);
      }
    };
  }, [projectId, setGeneratedCode, setStatus, setError]);

  // Manual join project function
  const joinProject = useCallback((projectId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join-project', projectId);
      console.log(`📁 Manually joined project room: project-${projectId}`);
    }
  }, []);

  // Manual leave project function
  const leaveProject = useCallback((projectId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('leave-project', projectId);
      console.log(`📁 Manually left project room: project-${projectId}`);
    }
  }, []);

  // Register a callback to be notified when code is updated via socket
  const onCodeUpdate = useCallback((projectIdToWatch: string, callback: CodeUpdateCallback) => {
    console.log(`\n📝 [useSocket] Registering code update callback for project: ${projectIdToWatch}`);
    
    if (!codeUpdateCallbacks.has(projectIdToWatch)) {
      codeUpdateCallbacks.set(projectIdToWatch, new Set());
    }
    codeUpdateCallbacks.get(projectIdToWatch)!.add(callback);
    
    const currentCount = codeUpdateCallbacks.get(projectIdToWatch)!.size;
    console.log(`   ✅ Callback registered. Total callbacks for this project: ${currentCount}`);
    
    // Return cleanup function
    return () => {
      console.log(`\n🧹 [useSocket] Cleaning up code update callback for project: ${projectIdToWatch}`);
      const callbacks = codeUpdateCallbacks.get(projectIdToWatch);
      if (callbacks) {
        callbacks.delete(callback);
        console.log(`   ✅ Callback removed. Remaining callbacks: ${callbacks.size}`);
        if (callbacks.size === 0) {
          codeUpdateCallbacks.delete(projectIdToWatch);
          console.log(`   🗑️ No more callbacks - removed project from map`);
        }
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    joinProject,
    leaveProject,
    onCodeUpdate,
    isConnected: socketRef.current?.connected ?? false,
  };
}

export default useSocket;
