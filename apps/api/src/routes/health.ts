import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { getQueueStats } from '../queues/jobQueue.js';
import { getRedisClient } from '../lib/redis.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Check database connection
  let dbStatus = 'healthy';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'unhealthy';
  }

  // Check Redis connection
  let redisStatus = 'healthy';
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
    } else {
      redisStatus = 'unavailable';
    }
  } catch {
    redisStatus = 'unhealthy';
  }

  // Get queue stats
  let queueStats = null;
  try {
    queueStats = await getQueueStats();
  } catch {
    // Queue stats unavailable
  }

  res.json({
    status: dbStatus === 'healthy' && redisStatus === 'healthy' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTime: `${Date.now() - startTime}ms`,
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
    queue: queueStats,
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    },
  });
});

export default router;
