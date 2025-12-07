import { Queue, Job, QueueEvents } from 'bullmq';
import { redisConnection, USE_MOCK_QUEUE, redisConfig } from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { 
  QUEUE_NAMES, 
  ImageToCodeJobData, 
  ImageToCodeJobResult,
  ModifyCodeJobData,
  ModifyCodeJobResult,
} from '../types/queue.js';
import { 
  emitProjectCompleted, 
  emitProjectStatus, 
  emitProjectError,
  emitProjectCodeUpdated,
} from '../lib/socket.js';

// Re-export types for convenience
export { 
  QUEUE_NAMES, 
  ImageToCodeJobData, 
  ImageToCodeJobResult,
  ModifyCodeJobData,
  ModifyCodeJobResult,
};

// ============================================
// Direct Queue Processing (No Redis Required)
// ============================================
async function processJobDirectly(data: ImageToCodeJobData): Promise<ImageToCodeJobResult> {
  const { projectId, imagePath, codeType, framework } = data;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Processing job directly (no Redis queue)`);
  console.log(`   Project ID: ${projectId}`);
  console.log(`${'='.repeat(50)}\n`);

  try {
    // Update status to PROCESSING
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });

    // Emit processing status
    emitProjectStatus(projectId, 'PROCESSING', 10);

    // Dynamically import the worker module to avoid circular dependencies
    const workerModule = await import('../workers/worker.js');
    const generateCodeFromImage = workerModule.generateCodeFromImage;
    
    if (!generateCodeFromImage) {
      throw new Error('Failed to load code generation function');
    }

    const result = await generateCodeFromImage(imagePath, codeType, framework);

    if (!result.success || !result.code) {
      throw new Error(result.error || 'Failed to generate code');
    }

    const generatedCode = result.code;

    // Update project with generated code
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        generatedCode,
        processingCompletedAt: new Date(),
      },
    });

    // Emit completion via Socket.io
    emitProjectCompleted(projectId, {
      status: 'COMPLETED',
      generatedCode,
    });

    console.log(`\n✅ Job completed successfully (direct processing)`);
    console.log(`   Code length: ${generatedCode.length} characters\n`);

    return {
      success: true,
      generatedCode,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n❌ Job failed: ${errorMessage}\n`);
    console.error('Error details:', error);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'FAILED',
        errorMessage,
        processingCompletedAt: new Date(),
      },
    });

    emitProjectError(projectId, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Direct Modify-Code Processing (No Redis Required)
// ============================================
async function processModifyCodeDirectly(data: ModifyCodeJobData): Promise<ModifyCodeJobResult> {
  const { projectId, currentCode, userMessage } = data;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🔧 Processing modify-code job directly (no Redis queue)`);
  console.log(`   Project ID: ${projectId}`);
  console.log(`   Message: ${userMessage.substring(0, 50)}...`);
  console.log(`${'='.repeat(50)}\n`);

  try {
    // Update status to PROCESSING
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });

    // Emit processing status
    emitProjectStatus(projectId, 'PROCESSING', 10);

    // Dynamically import the worker module to avoid circular dependencies
    const workerModule = await import('../workers/worker.js');
    const modifyCodeWithAI = workerModule.modifyCodeWithAI;
    
    if (!modifyCodeWithAI) {
      throw new Error('Failed to load code modification function');
    }

    const result = await modifyCodeWithAI(currentCode, userMessage, projectId);

    if (!result.success || !result.code) {
      throw new Error(result.error || 'Failed to modify code');
    }

    const modifiedCode = result.code;

    // Update project with modified code
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        generatedCode: modifiedCode,
        processingCompletedAt: new Date(),
      },
    });

    // Emit the code updated event
    emitProjectCodeUpdated(projectId, modifiedCode);

    // Emit completion via Socket.io
    emitProjectCompleted(projectId, {
      status: 'COMPLETED',
      generatedCode: modifiedCode,
    });

    console.log(`\n✅ Modify-code job completed successfully (direct processing)`);
    console.log(`   Code length: ${modifiedCode.length} characters\n`);

    return {
      success: true,
      modifiedCode,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n❌ Modify-code job failed: ${errorMessage}\n`);
    console.error('Error details:', error);

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'FAILED',
        errorMessage,
        processingCompletedAt: new Date(),
      },
    });

    emitProjectError(projectId, errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Queue and Worker Setup
// ============================================
let imageToCodeQueue: Queue<ImageToCodeJobData, ImageToCodeJobResult> | null = null;
let modifyCodeQueue: Queue<ModifyCodeJobData, ModifyCodeJobResult> | null = null;
let imageToCodeQueueEvents: QueueEvents | null = null;
let modifyCodeQueueEvents: QueueEvents | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

if (!USE_MOCK_QUEUE && redisConnection) {
  // Real queue with Redis for image-to-code
  imageToCodeQueue = new Queue<ImageToCodeJobData, ImageToCodeJobResult>(
    QUEUE_NAMES.IMAGE_TO_CODE,
    {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    }
  );

  // Real queue with Redis for modify-code
  modifyCodeQueue = new Queue<ModifyCodeJobData, ModifyCodeJobResult>(
    QUEUE_NAMES.MODIFY_CODE,
    {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 500,
        },
        removeOnComplete: {
          age: 12 * 3600,
          count: 500,
        },
        removeOnFail: {
          age: 3 * 24 * 3600,
        },
      },
    }
  );

  imageToCodeQueueEvents = new QueueEvents(
    QUEUE_NAMES.IMAGE_TO_CODE,
    { connection: redisConfig }
  );

  modifyCodeQueueEvents = new QueueEvents(
    QUEUE_NAMES.MODIFY_CODE,
    { connection: redisConfig }
  );

  imageToCodeQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
    console.log(`✅ Image-to-Code Job ${jobId} completed`);
    const projectId = jobId?.replace('img2code-', '');
    if (projectId) {
      const result = returnvalue as unknown as ImageToCodeJobResult;
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'COMPLETED',
          generatedCode: result.generatedCode,
          processingCompletedAt: new Date(),
        },
      });
    }
  });

  imageToCodeQueueEvents.on('failed', async ({ jobId, failedReason }) => {
    console.error(`❌ Image-to-Code Job ${jobId} failed: ${failedReason}`);
    const projectId = jobId?.replace('img2code-', '');
    if (projectId) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'FAILED',
          errorMessage: failedReason,
          processingCompletedAt: new Date(),
        },
      });
    }
  });

  modifyCodeQueueEvents.on('completed', async ({ jobId, returnvalue }) => {
    console.log(`✅ Modify-Code Job ${jobId} completed`);
    // Extract projectId from jobId (format: modify-{projectId}-{timestamp})
    const parts = jobId?.split('-');
    if (parts && parts.length >= 2) {
      const projectId = parts[1];
      const result = returnvalue as unknown as ModifyCodeJobResult;
      if (result.modifiedCode) {
        emitProjectCodeUpdated(projectId, result.modifiedCode);
      }
    }
  });

  modifyCodeQueueEvents.on('failed', async ({ jobId, failedReason }) => {
    console.error(`❌ Modify-Code Job ${jobId} failed: ${failedReason}`);
    const parts = jobId?.split('-');
    if (parts && parts.length >= 2) {
      const projectId = parts[1];
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'FAILED',
          errorMessage: failedReason,
          processingCompletedAt: new Date(),
        },
      });
      emitProjectError(projectId, failedReason);
    }
  });
}

// ============================================
// Add Job to Queue
// ============================================
export const addImageToCodeJob = async (
  data: ImageToCodeJobData
): Promise<Job<ImageToCodeJobData, ImageToCodeJobResult> | ImageToCodeJobResult> => {
  try {
    if (USE_MOCK_QUEUE || !imageToCodeQueue) {
      // Process directly without queue
      console.log(`📥 Processing job directly (mock mode): ${data.projectId}`);
      // Run in background with error handling
      setImmediate(() => {
        processJobDirectly(data).catch(error => {
          console.error('Direct processing error:', error);
        });
      });
      return { success: true } as ImageToCodeJobResult;
    }

    const job = await imageToCodeQueue.add('process-image', data, {
      jobId: `img2code-${data.projectId}`,
    });
    
    console.log(`📥 Job added to queue: ${job.id}`);
    return job;
  } catch (error) {
    console.error('Error adding job:', error);
    throw error;
  }
};

// ============================================
// Add Modify-Code Job to Queue
// ============================================
export const addModifyCodeJob = async (
  data: ModifyCodeJobData
): Promise<{ jobId: string; status: 'queued' | 'processing' }> => {
  try {
    const jobId = `modify-${data.projectId}-${Date.now()}`;
    
    if (USE_MOCK_QUEUE || !modifyCodeQueue) {
      // Process directly without queue
      console.log(`📥 Processing modify-code job directly (mock mode): ${data.projectId}`);
      // Run in background with error handling
      setImmediate(() => {
        processModifyCodeDirectly(data).catch(error => {
          console.error('Direct modify-code processing error:', error);
        });
      });
      return { jobId, status: 'processing' };
    }

    // Add to real BullMQ queue
    const job = await modifyCodeQueue.add('modify-code', data, {
      jobId,
    });
    
    console.log(`📥 Modify-code job added to queue: ${job.id}`);
    return { jobId: job.id || jobId, status: 'queued' };
  } catch (error) {
    console.error('Error adding modify-code job:', error);
    throw error;
  }
};

// ============================================
// Worker (processes jobs using AI)
// ============================================
export const createImageToCodeWorker = () => {
  if (USE_MOCK_QUEUE) {
    console.log('⚠️ Mock queue mode - no worker needed');
    return {
      close: async () => {},
    };
  }

  // Dynamically import the worker
  const { createWorker } = require('../workers/worker.js');
  return createWorker();
};

// ============================================
// Queue Utilities
// ============================================
export const getQueueStats = async () => {
  if (USE_MOCK_QUEUE || !imageToCodeQueue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
      mode: 'mock',
    };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    imageToCodeQueue.getWaitingCount(),
    imageToCodeQueue.getActiveCount(),
    imageToCodeQueue.getCompletedCount(),
    imageToCodeQueue.getFailedCount(),
    imageToCodeQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
    mode: 'redis',
  };
};

export const closeQueues = async () => {
  if (imageToCodeQueue) {
    await imageToCodeQueue.close();
  }
  if (modifyCodeQueue) {
    await modifyCodeQueue.close();
  }
  if (imageToCodeQueueEvents) {
    await imageToCodeQueueEvents.close();
  }
  if (modifyCodeQueueEvents) {
    await modifyCodeQueueEvents.close();
  }
  if (worker?.close) {
    await worker.close();
  }
  console.log('📦 Queues closed');
};

export { imageToCodeQueue, modifyCodeQueue, imageToCodeQueueEvents, modifyCodeQueueEvents };
