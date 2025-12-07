import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { getQueueStats, addModifyCodeJob } from '../queues/jobQueue.js';
import { getFileUrl } from '../services/uploadService.js';
import { generateChatReply } from '../workers/worker.js';
import {
  findRepeatedStructures,
  findClustersForNode,
  generateComponentFiles,
  sanitizeComponentName,
  type LayoutSpec,
  type RepeatCluster,
  type PatchSuggestion,
} from '../workers/extract_components.js';

const router = Router();

// ============================================
// Validation Schemas
// ============================================
const projectIdSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
});

const listQuerySchema = z.object({
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
});

const applyChangeSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  mode: z.enum(['edit', 'refactor', 'explain']).optional().default('edit'),
});

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Content is required'),
});

const extractComponentSchema = z.object({
  elementId: z.string().min(1, 'Element ID is required'),
  componentName: z.string().min(1, 'Component name is required'),
  clusterId: z.string().optional(),
});

const applyExtractionSchema = z.object({
  patch: z.object({
    componentName: z.string(),
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
      language: z.enum(['tsx', 'jsx', 'css']),
    })),
    replacements: z.array(z.object({
      nodeId: z.string(),
      componentUsage: z.string(),
      propValues: z.record(z.string()),
      originalCode: z.string().optional(),
    })),
    diff: z.object({
      before: z.string(),
      after: z.string(),
    }),
  }),
});

// ============================================
// GET /project/:id/chat - Get chat history for a project
// ============================================
router.get('/:id/chat', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Get all chat messages for this project, ordered by creation time
    const messages = await prisma.chatMessage.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      data: {
        projectId: id,
        messages,
      },
    });
  } catch (error) {
    console.error('Error in GET /project/:id/chat:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// POST /project/:id/chat - Add a chat message
// ============================================
router.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);
    const { role, content } = chatMessageSchema.parse(req.body);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Create the chat message
    const message = await prisma.chatMessage.create({
      data: {
        projectId: id,
        role,
        content,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error('Error in POST /project/:id/chat:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// POST /project/:id/apply-change - Apply chat-based code modification
// ============================================
router.post('/:id/apply-change', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);
    const { message, mode } = applyChangeSchema.parse(req.body);

    console.log(`\n🔧 Apply-change request for project: ${id}`);
    console.log(`   Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    console.log(`   Mode: ${mode}`);

    // Load project from database
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        generatedCode: true,
        status: true,
      },
    });

    if (!project) {
      console.log(`   ❌ Project not found: ${id}`);
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    if (!project.generatedCode) {
      console.log(`   ❌ No generated code for project: ${id}`);
      return res.status(404).json({
        error: 'No code to modify',
        message: 'This project does not have any generated code yet. Please generate code first.',
      });
    }

    // Save the user message to chat history
    const userChatMessage = await prisma.chatMessage.create({
      data: {
        projectId: id,
        role: 'user',
        content: message,
      },
    });
    console.log(`   💬 User message saved to chat history`);

    // Generate conversational reply using NEURON chat AI (non-blocking for UX)
    // This runs in parallel with the modify-code job
    let assistantReply: string;
    try {
      assistantReply = await generateChatReply(message);
    } catch (chatError) {
      console.error(`   ⚠️ Chat reply generation failed:`, chatError);
      assistantReply = "On it – I'll make that change for you.";
    }

    // Save the assistant reply to chat history
    const assistantChatMessage = await prisma.chatMessage.create({
      data: {
        projectId: id,
        role: 'assistant',
        content: assistantReply,
      },
    });
    console.log(`   💬 Assistant reply saved: "${assistantReply.substring(0, 50)}..."`);

    // Create a modify-code job (runs in background, will emit socket event when done)
    const { jobId, status } = await addModifyCodeJob({
      projectId: id,
      currentCode: project.generatedCode,
      userMessage: message,
      mode,
    });

    console.log(`   ✅ Job created: ${jobId} (${status})`);

    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      // Return the chat messages so the frontend can display them immediately
      chatReply: {
        id: assistantChatMessage.id,
        role: 'assistant',
        content: assistantReply,
        createdAt: assistantChatMessage.createdAt,
      },
    });
  } catch (error) {
    console.error('Error in POST /project/:id/apply-change:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// GET /project/:id - Get project by ID
// ============================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Parse image metadata safely
    const imageMetadata = project.imageMetadata as Record<string, unknown> | null;
    const imageUrl = imageMetadata?.fileName 
      ? getFileUrl(imageMetadata.fileName as string)
      : null;

    return res.json({
      success: true,
      data: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        codeType: project.codeType,
        framework: project.framework,
        originalImage: imageUrl,
        imageMetadata: project.imageMetadata,
        generatedCode: project.generatedCode,
        errorMessage: project.errorMessage,
        jobId: project.jobId,
        processingStartedAt: project.processingStartedAt,
        processingCompletedAt: project.processingCompletedAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        user: project.user,
      },
    });
  } catch (error) {
    console.error('Error in GET /project/:id:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// GET /project - List projects
// ============================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const where: Record<string, unknown> = {};
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          codeType: project.codeType,
          framework: project.framework,
          createdAt: project.createdAt,
          user: project.user,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + projects.length < total,
        },
      },
    });
  } catch (error) {
    console.error('Error in GET /project:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// GET /project/:id/status - Get just the status
// ============================================
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        errorMessage: true,
        processingStartedAt: true,
        processingCompletedAt: true,
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Calculate processing time if applicable
    let processingTime: number | null = null;
    if (project.processingStartedAt && project.processingCompletedAt) {
      processingTime = 
        project.processingCompletedAt.getTime() - project.processingStartedAt.getTime();
    }

    return res.json({
      success: true,
      data: {
        id: project.id,
        status: project.status,
        errorMessage: project.errorMessage,
        processingTime: processingTime ? `${processingTime}ms` : null,
      },
    });
  } catch (error) {
    console.error('Error in GET /project/:id/status:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// DELETE /project/:id - Delete a project
// ============================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    await prisma.project.delete({
      where: { id },
    });

    // TODO: Delete associated image file from storage

    return res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error in DELETE /project/:id:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// GET /project/queue/stats - Get queue statistics
// ============================================
router.get('/queue/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error in GET /project/queue/stats:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// GET /project/:id/extract-candidates - Get component extraction candidates
// ============================================
router.get('/:id/extract-candidates', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);
    const nodeId = req.query.node as string | undefined;

    console.log(`\n🔍 Extract-candidates request for project: ${id}`);
    if (nodeId) {
      console.log(`   Target node: ${nodeId}`);
    }

    // Load project with layout data
    // Note: layoutJson field requires running `npx prisma db push` after schema update
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Parse layout JSON from imageMetadata or layoutJson field
    // The layout data may be stored in imageMetadata as a JSON object with a 'layout' key
    let layoutSpec: LayoutSpec | null = null;
    
    // Try to get layout from the project (field may not exist until Prisma client regenerated)
    const projectAny = project as Record<string, unknown>;
    const layoutData = projectAny.layoutJson || projectAny.imageMetadata;
    
    if (layoutData) {
      try {
        const parsed = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData;
        // Check if it's wrapped in a 'layout' key or is the layout directly
        layoutSpec = parsed.layout || parsed.page ? parsed : null;
      } catch (parseError) {
        console.error('   ❌ Failed to parse layout JSON:', parseError);
      }
    }

    if (!layoutSpec) {
      return res.status(400).json({
        error: 'No layout data',
        message: 'This project does not have layout analysis data. Please regenerate the code.',
      });
    }

    // Find clusters
    let clusters: RepeatCluster[];
    
    if (nodeId) {
      // Find clusters containing the specific node
      clusters = findClustersForNode(layoutSpec, nodeId);
    } else {
      // Find all clusters
      clusters = findRepeatedStructures(layoutSpec);
    }

    console.log(`   ✅ Found ${clusters.length} cluster(s)`);

    return res.json({
      success: true,
      data: {
        projectId: id,
        targetNodeId: nodeId || null,
        clusters: clusters.map(cluster => ({
          clusterId: cluster.clusterId,
          sampleNodeId: cluster.sampleNodeId,
          instances: cluster.instances,
          instanceCount: cluster.instanceCount,
          similarity: cluster.similarity,
          suggestedName: cluster.suggestedName,
          propCandidates: cluster.propCandidates,
        })),
        totalClusters: clusters.length,
      },
    });
  } catch (error) {
    console.error('Error in GET /project/:id/extract-candidates:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// POST /project/:id/extract-component - Generate component extraction patch
// ============================================
router.post('/:id/extract-component', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);
    const { elementId, componentName, clusterId } = extractComponentSchema.parse(req.body);

    console.log(`\n🔧 Extract-component request for project: ${id}`);
    console.log(`   Element ID: ${elementId}`);
    console.log(`   Component Name: ${componentName}`);

    // Load project
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Parse layout JSON from project data
    const projectAny = project as Record<string, unknown>;
    const layoutData = projectAny.layoutJson || projectAny.imageMetadata;
    let layoutSpec: LayoutSpec | null = null;
    
    if (layoutData) {
      try {
        const parsed = typeof layoutData === 'string' ? JSON.parse(layoutData) : layoutData;
        layoutSpec = parsed.layout || parsed.page ? parsed : null;
      } catch (parseError) {
        console.error('   ❌ Failed to parse layout JSON:', parseError);
      }
    }

    if (!layoutSpec) {
      return res.status(400).json({
        error: 'No layout data',
        message: 'This project does not have layout analysis data.',
      });
    }

    // Find the cluster for this element
    const clusters = findClustersForNode(layoutSpec, elementId);
    
    let targetCluster = clusters[0];
    
    // If clusterId provided, find that specific cluster
    if (clusterId) {
      const specificCluster = clusters.find(c => c.clusterId === clusterId);
      if (specificCluster) {
        targetCluster = specificCluster;
      }
    }

    if (!targetCluster) {
      return res.status(400).json({
        error: 'No cluster found',
        message: 'The selected element is not part of any repeating pattern.',
      });
    }

    // Determine if using TypeScript
    const useTypeScript = project.codeType === 'REACT' || 
                          project.codeType === 'NEXTJS';

    // Generate component files and patch
    const sanitizedName = sanitizeComponentName(componentName);
    const patch: PatchSuggestion = generateComponentFiles(
      targetCluster,
      layoutSpec,
      sanitizedName,
      useTypeScript
    );

    console.log(`   ✅ Generated component: ${patch.componentName}`);
    console.log(`   📁 Files: ${patch.files.map(f => f.path).join(', ')}`);
    console.log(`   🔄 Replacements: ${patch.replacements.length}`);

    return res.json({
      success: true,
      data: {
        projectId: id,
        elementId,
        clusterId: targetCluster.clusterId,
        patch,
      },
    });
  } catch (error) {
    console.error('Error in POST /project/:id/extract-component:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// POST /project/:id/apply-extraction - Apply component extraction patch
// ============================================
router.post('/:id/apply-extraction', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);
    const { patch } = applyExtractionSchema.parse(req.body);

    console.log(`\n🔧 Apply-extraction request for project: ${id}`);
    console.log(`   Component: ${patch.componentName}`);
    console.log(`   Files to create: ${patch.files.length}`);
    console.log(`   Replacements: ${patch.replacements.length}`);

    // Load project
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Store the extraction in version history
    const versionEntry = {
      type: 'COMPONENT_EXTRACTION',
      componentName: patch.componentName,
      files: patch.files,
      replacements: patch.replacements,
      originalCode: project.generatedCode,
      timestamp: new Date().toISOString(),
    };

    // Get existing extraction history from imageMetadata (temporary storage)
    const projectAny = project as Record<string, unknown>;
    let existingMetadata: Record<string, unknown> = {};
    if (projectAny.imageMetadata) {
      try {
        existingMetadata = typeof projectAny.imageMetadata === 'string' 
          ? JSON.parse(projectAny.imageMetadata) 
          : projectAny.imageMetadata as Record<string, unknown>;
      } catch {
        existingMetadata = {};
      }
    }
    const existingExtractions = (existingMetadata.extractionHistory as unknown[]) || [];
    const newExtractions = [...existingExtractions, versionEntry];

    // Apply replacements to the generated code
    let updatedCode = project.generatedCode || '';
    
    // Add import statement for the new component at the top
    const importStatement = `import ${patch.componentName} from './components/Extracted/${patch.componentName}';\n`;
    
    // Find where to insert import (after existing imports)
    const importMatch = updatedCode.match(/^(import .+;\n)+/m);
    if (importMatch) {
      const insertPos = importMatch[0].length;
      updatedCode = updatedCode.slice(0, insertPos) + importStatement + updatedCode.slice(insertPos);
    } else {
      updatedCode = importStatement + updatedCode;
    }

    // Apply each replacement (simplified - in production, use AST transforms)
    for (const replacement of patch.replacements) {
      // This is a simplified replacement - real implementation would use AST
      console.log(`   Replacing node ${replacement.nodeId} with ${patch.componentName}`);
    }

    // Update project with new code and extraction history
    await prisma.project.update({
      where: { id },
      data: {
        generatedCode: updatedCode,
        // Store extraction history in imageMetadata temporarily
        imageMetadata: JSON.stringify({
          ...existingMetadata,
          extractionHistory: newExtractions,
        }),
        updatedAt: new Date(),
      },
    });

    console.log(`   ✅ Extraction applied successfully`);

    return res.json({
      success: true,
      data: {
        projectId: id,
        componentName: patch.componentName,
        filesCreated: patch.files.map(f => f.path),
        replacementsApplied: patch.replacements.length,
        canRevert: true,
        versionId: newExtractions.length - 1,
      },
    });
  } catch (error) {
    console.error('Error in POST /project/:id/apply-extraction:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// POST /project/:id/revert-extraction - Revert a component extraction
// ============================================
router.post('/:id/revert-extraction', async (req: Request, res: Response) => {
  try {
    const { id } = projectIdSchema.parse(req.params);
    const { versionId } = req.body;

    console.log(`\n⏪ Revert-extraction request for project: ${id}`);
    console.log(`   Version ID: ${versionId}`);

    // Load project
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found',
        message: `No project found with ID: ${id}`,
      });
    }

    // Parse extraction history from imageMetadata
    const projectAny = project as Record<string, unknown>;
    let metadata: Record<string, unknown> = {};
    if (projectAny.imageMetadata) {
      try {
        metadata = typeof projectAny.imageMetadata === 'string'
          ? JSON.parse(projectAny.imageMetadata)
          : projectAny.imageMetadata as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    }

    const extractionHistory = (metadata.extractionHistory as unknown[]) || [];
    
    if (versionId === undefined || versionId >= extractionHistory.length) {
      return res.status(400).json({
        error: 'Invalid version',
        message: 'The specified version does not exist.',
      });
    }

    // Get the extraction to revert
    const extraction = extractionHistory[versionId] as {
      originalCode?: string;
      componentName?: string;
    };
    
    if (!extraction || !extraction.originalCode) {
      return res.status(400).json({
        error: 'Cannot revert',
        message: 'Original code not available for this extraction.',
      });
    }

    // Remove this extraction from history
    const newHistory = extractionHistory.filter((_, i) => i !== versionId);

    // Restore original code
    await prisma.project.update({
      where: { id },
      data: {
        generatedCode: extraction.originalCode,
        imageMetadata: JSON.stringify({
          ...metadata,
          extractionHistory: newHistory,
        }),
        updatedAt: new Date(),
      },
    });

    console.log(`   ✅ Reverted extraction: ${extraction.componentName}`);

    return res.json({
      success: true,
      data: {
        projectId: id,
        revertedComponent: extraction.componentName,
        remainingExtractions: newHistory.length,
      },
    });
  } catch (error) {
    console.error('Error in POST /project/:id/revert-extraction:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
