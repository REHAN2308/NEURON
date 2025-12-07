import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

// ============================================
// Socket.io Server Instance
// ============================================
let io: Server | null = null;

// ============================================
// Initialize Socket.io
// ============================================
export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join a project room
    socket.on('join-project', (projectId: string) => {
      const room = `project-${projectId}`;
      socket.join(room);
      console.log(`📁 Socket ${socket.id} joined room: ${room}`);
      
      // Log total clients in this room
      const roomSockets = io?.sockets.adapter.rooms.get(room);
      console.log(`   👥 Clients in room ${room}: ${roomSockets?.size || 0}`);
    });

    // Leave a project room
    socket.on('leave-project', (projectId: string) => {
      const room = `project-${projectId}`;
      socket.leave(room);
      console.log(`📁 Socket ${socket.id} left room: ${room}`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('✅ Socket.io initialized');
  return io;
}

// ============================================
// Get Socket.io Instance
// ============================================
export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

// ============================================
// Check if Socket.io is ready
// ============================================
export function isSocketReady(): boolean {
  return io !== null;
}

// ============================================
// Get room info
// ============================================
export function getRoomInfo(projectId: string): { exists: boolean; clientCount: number } {
  if (!io) {
    return { exists: false, clientCount: 0 };
  }
  const room = `project-${projectId}`;
  const roomSockets = io.sockets.adapter.rooms.get(room);
  return {
    exists: !!roomSockets,
    clientCount: roomSockets?.size || 0,
  };
}

// ============================================
// Emit Events
// ============================================

/**
 * Emit project completed event to a specific project room
 */
export function emitProjectCompleted(
  projectId: string, 
  data: {
    status: string;
    generatedCode?: string;
    errorMessage?: string;
  }
): void {
  if (!io) {
    console.warn('⚠️ Socket.io not initialized, skipping emitProjectCompleted');
    return;
  }

  const room = `project-${projectId}`;
  const roomInfo = getRoomInfo(projectId);
  
  io.to(room).emit('project-completed', {
    projectId,
    ...data,
    timestamp: new Date().toISOString(),
  });
  
  console.log(`📤 Emitted 'project-completed' to room: ${room} (${roomInfo.clientCount} clients)`);
}

/**
 * Emit project status update to a specific project room
 */
export function emitProjectStatus(
  projectId: string,
  status: string,
  progress?: number
): void {
  if (!io) {
    console.warn('⚠️ Socket.io not initialized, skipping emitProjectStatus');
    return;
  }

  const room = `project-${projectId}`;
  io.to(room).emit('project-status', {
    projectId,
    status,
    progress,
    timestamp: new Date().toISOString(),
  });
  
  // Only log every 25% to reduce noise
  if (!progress || progress % 25 === 0 || progress >= 95) {
    console.log(`📤 Emitted 'project-status' (${status} ${progress || 0}%) to room: ${room}`);
  }
}

/**
 * Emit project error to a specific project room
 */
export function emitProjectError(
  projectId: string,
  error: string
): void {
  if (!io) {
    console.warn('⚠️ Socket.io not initialized, skipping emitProjectError');
    return;
  }

  const room = `project-${projectId}`;
  const roomInfo = getRoomInfo(projectId);
  
  io.to(room).emit('project-error', {
    projectId,
    error,
    timestamp: new Date().toISOString(),
  });
  
  console.log(`📤 Emitted 'project-error' to room: ${room} (${roomInfo.clientCount} clients)`);
}

/**
 * Emit project code updated event (for modify-code jobs)
 * THIS IS THE CRITICAL EVENT FOR LIVE PREVIEW UPDATES
 */
export function emitProjectCodeUpdated(
  projectId: string,
  updatedCode: string
): void {
  console.log(`\n🔔 [SOCKET] emitProjectCodeUpdated called for project: ${projectId}`);
  console.log(`   📊 Socket.io instance ready: ${io !== null}`);
  
  if (!io) {
    console.warn('⚠️ [SOCKET] Socket.io NOT initialized - cannot emit project:code-updated!');
    console.warn('   This means the live preview will NOT update automatically.');
    console.warn('   The user will need to refresh or poll the API.');
    return;
  }

  const room = `project-${projectId}`;
  const roomInfo = getRoomInfo(projectId);
  
  console.log(`   📍 Target room: ${room}`);
  console.log(`   👥 Clients in room: ${roomInfo.clientCount}`);
  console.log(`   📄 Code size: ${updatedCode.length} characters`);
  
  if (roomInfo.clientCount === 0) {
    console.warn(`   ⚠️ No clients in room ${room}! Event will be sent but no one will receive it.`);
  }

  const payload = {
    projectId,
    updatedCode,
    timestamp: new Date().toISOString(),
  };

  io.to(room).emit('project:code-updated', payload);
  
  console.log(`   ✅ 'project:code-updated' emitted successfully!`);
  console.log(`   📦 Payload: { projectId: "${projectId}", updatedCode: ${updatedCode.length} chars, timestamp: "${payload.timestamp}" }\n`);
}

// ============================================
// Close Socket.io
// ============================================
export async function closeSocket(): Promise<void> {
  if (io) {
    io.close();
    io = null;
    console.log('🔌 Socket.io closed');
  }
}
