import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { addImageToCodeJob } from '../queues/jobQueue.js';
import { 
  uploadBase64Image, 
  processMulterUpload, 
  getFileUrl,
  UPLOAD_DIR 
} from '../services/uploadService.js';
const router = Router();

// ============================================
// Multer Configuration
// ============================================
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

// ============================================
// Validation Schemas
// ============================================

// Shared generation options schema
const generationOptionsSchema = z.object({
  layoutMode: z.enum(['fixed', 'responsive']).optional().default('responsive'),
  stylePreset: z.enum(['exact', 'modern', 'minimal']).optional().default('modern'),
  maxWidth: z.number().min(320).max(2560).optional(),
  compact: z.boolean().optional().default(false),
  includeComments: z.boolean().optional().default(false),
});

const generateBase64Schema = z.object({
  image: z.string().min(1, 'Image is required'),
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().optional(),
  description: z.string().optional(),
  codeType: z.enum(['HTML', 'REACT', 'VUE', 'SVELTE']).optional().default('HTML'),
  framework: z.enum(['VANILLA', 'TAILWIND', 'BOOTSTRAP', 'MATERIAL_UI']).optional().default('TAILWIND'),
  // User instructions for code generation
  instructions: z.string().optional().default(''),
  // New generation options
  layoutMode: generationOptionsSchema.shape.layoutMode,
  stylePreset: generationOptionsSchema.shape.stylePreset,
  maxWidth: generationOptionsSchema.shape.maxWidth,
  compact: generationOptionsSchema.shape.compact,
  includeComments: generationOptionsSchema.shape.includeComments,
});

const generateMultipartSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().optional(),
  description: z.string().optional(),
  codeType: z.enum(['HTML', 'REACT', 'VUE', 'SVELTE']).optional(),
  framework: z.enum(['VANILLA', 'TAILWIND', 'BOOTSTRAP', 'MATERIAL_UI']).optional(),
  // User instructions for code generation
  instructions: z.string().optional(),
  // New generation options (as strings from form data, will be parsed)
  layoutMode: z.enum(['fixed', 'responsive']).optional(),
  stylePreset: z.enum(['exact', 'modern', 'minimal']).optional(),
  maxWidth: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  compact: z.string().optional().transform((val) => val === 'true'),
  includeComments: z.string().optional().transform((val) => val === 'true'),
});

const modifyCodeSchema = z.object({
  currentCode: z.string().min(1, 'Current code is required'),
  instruction: z.string().min(1, 'Instruction is required'),
  image: z.string().optional(),
  codeType: z.enum(['HTML', 'REACT', 'VUE', 'SVELTE']).optional().default('HTML'),
});

// ============================================
// POST /modify - Modify existing code
// ============================================
router.post('/modify', async (req: Request, res: Response) => {
  console.log('\n🔵 Received modify request');
  
  try {
    const validatedBody = modifyCodeSchema.parse(req.body);
    const { currentCode, instruction, codeType } = validatedBody;

    console.log('Code type:', codeType);
    console.log('Instruction:', instruction);
    console.log('Current code length:', currentCode.length);

    // Call AI service to modify code
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `You are an expert frontend developer. You have the following code:

\`\`\`${codeType.toLowerCase()}
${currentCode}
\`\`\`

The user wants to make this modification: "${instruction}"

Please provide ONLY the modified code without any explanations, markdown formatting, or additional text. Just return the pure code that implements the requested change.`;

      console.log('🤖 Calling Gemini API for code modification...');
      const result = await model.generateContent(prompt);
      const response = result.response;
      let modifiedCode = response.text();

      // Clean up the response - remove markdown code blocks if present
      modifiedCode = modifiedCode
        .replace(/```[a-z]*\n?/g, '')
        .replace(/```$/g, '')
        .trim();

      console.log('✅ Code modified by AI');
      console.log('Modified code length:', modifiedCode.length);

      return res.status(200).json({
        success: true,
        modifiedCode,
        message: 'Code modified successfully by AI',
      });
    } catch (aiError) {
      console.warn('⚠️ AI service failed, using fallback:', aiError);
      
      // Fallback: Add comment to indicate the change was requested
      const modifiedCode = currentCode.replace(
        /(<body[^>]*>)/i,
        `$1\n    <!-- AI Modification Request: ${instruction} -->\n    <!-- Note: AI service unavailable, manual implementation needed -->`
      );

      return res.status(200).json({
        success: true,
        modifiedCode,
        message: 'Code modification request noted (AI service temporarily unavailable)',
      });
    }
  } catch (error) {
    console.error('Error in /modify:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// POST / - Generate code from image
// ============================================
router.post('/', upload.single('image'), async (req: Request, res: Response) => {
  console.log('\n🔵 Received generate request');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Body keys:', Object.keys(req.body));
  console.log('Has file:', !!req.file);
  
  try {
    let imagePath: string;
    let imageMetadata: Record<string, unknown> = {};
    let userId: string;
    let name: string | undefined;
    let description: string | undefined;
    let codeType: string = 'HTML';
    let framework: string = 'TAILWIND';
    
    // User instructions for code generation
    let instructions: string = '';
    
    // New generation options with defaults
    let layoutMode: 'fixed' | 'responsive' = 'responsive';
    let stylePreset: 'exact' | 'modern' | 'minimal' = 'modern';
    let maxWidth: number | undefined = undefined;
    let compact: boolean = false;
    let includeComments: boolean = false;

    // Check if it's a multipart upload or base64
    if (req.file) {
      // Multipart form upload
      const validatedBody = generateMultipartSchema.parse(req.body);
      userId = validatedBody.userId;
      name = validatedBody.name;
      description = validatedBody.description;
      codeType = validatedBody.codeType || 'HTML';
      framework = validatedBody.framework || 'TAILWIND';
      instructions = validatedBody.instructions || '';
      
      // Extract new generation options
      layoutMode = validatedBody.layoutMode || 'responsive';
      stylePreset = validatedBody.stylePreset || 'modern';
      maxWidth = validatedBody.maxWidth;
      compact = validatedBody.compact || false;
      includeComments = validatedBody.includeComments || false;

      const uploadResult = await processMulterUpload(req.file);
      
      if (!uploadResult.success) {
        return res.status(400).json({ 
          error: 'Upload failed', 
          message: uploadResult.error 
        });
      }

      imagePath = uploadResult.filePath!;
      imageMetadata = {
        originalName: uploadResult.originalName,
        fileName: uploadResult.fileName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        url: getFileUrl(uploadResult.fileName!),
      };
    } else if (req.body.image) {
      // Base64 upload
      const validatedBody = generateBase64Schema.parse(req.body);
      userId = validatedBody.userId;
      name = validatedBody.name;
      description = validatedBody.description;
      codeType = validatedBody.codeType;
      framework = validatedBody.framework;
      instructions = validatedBody.instructions || '';
      
      // Extract new generation options
      layoutMode = validatedBody.layoutMode;
      stylePreset = validatedBody.stylePreset;
      maxWidth = validatedBody.maxWidth;
      compact = validatedBody.compact;
      includeComments = validatedBody.includeComments;

      const uploadResult = await uploadBase64Image(validatedBody.image);
      
      if (!uploadResult.success) {
        return res.status(400).json({ 
          error: 'Upload failed', 
          message: uploadResult.error 
        });
      }

      imagePath = uploadResult.filePath!;
      imageMetadata = {
        originalName: uploadResult.originalName,
        fileName: uploadResult.fileName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
        url: getFileUrl(uploadResult.fileName!),
      };
    } else {
      return res.status(400).json({ 
        error: 'No image provided',
        message: 'Please provide an image either as a file upload or base64 string'
      });
    }

    // Verify user exists (or create if needed for demo)
    let user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      // For demo purposes, create a user if not found
      // In production, you'd want to verify authentication
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@demo.neuron.ai`,
          name: 'Demo User',
        },
      });
    }

    // Create project record
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: name || 'Untitled Project',
        description,
        originalImage: imagePath,
        imageMetadata: JSON.stringify(imageMetadata),
        codeType,
        framework,
        instructions: instructions || null,
        status: 'PENDING',
      },
    });

    // Add job to queue with generation options
    const job = await addImageToCodeJob({
      projectId: project.id,
      userId: user.id,
      imagePath,
      codeType,
      framework,
      // User instructions
      instructions: instructions || undefined,
      // New generation options
      generationOptions: {
        layoutMode,
        stylePreset,
        maxWidth,
        compact,
        includeComments,
      },
    });

    // Update project with job ID (only if it's a real job with an ID)
    const jobId = 'id' in job ? job.id : project.id;
    await prisma.project.update({
      where: { id: project.id },
      data: { jobId },
    });

    return res.status(201).json({
      success: true,
      message: 'Image uploaded and processing started',
      data: {
        projectId: project.id,
        jobId,
        status: project.status,
        imageUrl: imageMetadata.url,
        estimatedTime: '30-60 seconds',
      },
    });
  } catch (error) {
    console.error('Error in /generate:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
