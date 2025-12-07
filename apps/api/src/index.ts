import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';
import 'express-async-errors';

// Load environment variables
dotenv.config();

// Import routes
import healthRouter from './routes/health.js';
import generateRouter from './routes/generate.js';
import projectRouter from './routes/project.js';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Import queue worker
import { createImageToCodeWorker, closeQueues } from './queues/jobQueue.js';
import { closeRedisConnection } from './lib/redis.js';
import prisma from './lib/prisma.js';
import { initializeSocket, closeSocket } from './lib/socket.js';

// ============================================
// Application Setup
// ============================================
const app: Express = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================
// Security Middleware
// ============================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ============================================
// Body Parsing & Logging
// ============================================
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// Static Files (uploaded images)
// ============================================
const uploadsPath = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadsPath));

// ============================================
// API Routes
// ============================================
app.use('/api/health', healthRouter);
app.use('/api/generate', generateRouter);
app.use('/api/project', projectRouter);

// ============================================
// Root Endpoint
// ============================================
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'NEURON API',
    version: '1.0.0',
    description: 'Image-to-Code AI Backend Service',
    environment: NODE_ENV,
    endpoints: {
      health: 'GET /api/health',
      generate: 'POST /api/generate',
      project: 'GET /api/project/:id',
      projectList: 'GET /api/project',
      projectStatus: 'GET /api/project/:id/status',
      queueStats: 'GET /api/project/queue/stats',
    },
    documentation: '/api/docs',
  });
});

// ============================================
// Error Handling
// ============================================
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// Server Startup
// ============================================
let worker: ReturnType<typeof createImageToCodeWorker> | null = null;

const startServer = async () => {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Start the queue worker
    worker = createImageToCodeWorker();
    console.log('✅ Queue worker started');

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io
    initializeSocket(httpServer);

    // Start HTTP server
    httpServer.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🧠 NEURON API                                          ║
║   Image-to-Code AI Backend Service                       ║
║                                                          ║
║   Server:      http://localhost:${PORT}                     ║
║   WebSocket:   ws://localhost:${PORT}                       ║
║   Environment: ${NODE_ENV.padEnd(40)}║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      
      httpServer.close(async () => {
        console.log('🔌 HTTP server closed');
        
        // Close Socket.io
        await closeSocket();
        
        // Close worker
        if (worker) {
          await worker.close();
          console.log('🔌 Queue worker closed');
        }
        
        // Close queues
        await closeQueues();
        
        // Close Redis connection
        await closeRedisConnection();
        
        // Close database connection
        await prisma.$disconnect();
        console.log('🔌 Database disconnected');
        
        console.log('👋 Goodbye!');
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
