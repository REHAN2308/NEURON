import Redis from 'ioredis';

// Check if we should use mock mode (no Redis)
export const USE_MOCK_QUEUE = process.env.USE_MOCK_QUEUE === 'true' || process.env.REDIS_HOST === 'mock';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

// Connection options for BullMQ
export const redisConnection = USE_MOCK_QUEUE ? null : redisConfig;

// Create Redis connection for BullMQ
export const createRedisConnection = () => {
  if (USE_MOCK_QUEUE) {
    console.log('⚠️ Running in mock queue mode (no Redis)');
    return null;
  }
  return new Redis(redisConfig);
};

// Shared connection instance
let redisClient: Redis | null = null;

export const getRedisClient = (): Redis | null => {
  if (USE_MOCK_QUEUE) {
    return null;
  }
  
  if (!redisClient) {
    redisClient = new Redis(redisConfig);
    
    redisClient.on('connect', () => {
      console.log('📦 Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });
  }
  return redisClient;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('📦 Redis connection closed');
  }
};

export { redisConfig };
