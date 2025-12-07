import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Configuration
// ============================================
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10); // 10MB default
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================
// Types
// ============================================
export interface UploadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  error?: string;
}

export interface ImageMetadata {
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: Date;
}

// ============================================
// Upload from Base64
// ============================================
export const uploadBase64Image = async (
  base64Data: string,
  originalName?: string
): Promise<UploadResult> => {
  try {
    // Parse base64 data
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    
    if (!matches || matches.length !== 3) {
      return { success: false, error: 'Invalid base64 image format' };
    }

    const mimeType = matches[1];
    const base64Content = matches[2];
    
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return { 
        success: false, 
        error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` 
      };
    }

    // Decode base64
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Check file size
    if (buffer.length > MAX_FILE_SIZE) {
      return { 
        success: false, 
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      };
    }

    // Generate unique filename
    const extension = getExtensionFromMimeType(mimeType);
    const fileName = `${uuidv4()}${extension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Write file
    await fs.promises.writeFile(filePath, buffer);

    return {
      success: true,
      filePath,
      fileName,
      originalName: originalName || fileName,
      mimeType,
      size: buffer.length,
    };
  } catch (error) {
    console.error('Error uploading base64 image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    };
  }
};

// ============================================
// Upload from Multer (multipart form)
// ============================================
export const processMulterUpload = async (
  file: Express.Multer.File
): Promise<UploadResult> => {
  try {
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      // Delete the uploaded file
      await deleteFile(file.path);
      return { 
        success: false, 
        error: `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` 
      };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      await deleteFile(file.path);
      return { 
        success: false, 
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
      };
    }

    return {
      success: true,
      filePath: file.path,
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  } catch (error) {
    console.error('Error processing multer upload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process upload',
    };
  }
};

// ============================================
// Delete File
// ============================================
export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

// ============================================
// Get File URL
// ============================================
export const getFileUrl = (fileName: string): string => {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  return `${baseUrl}/uploads/${fileName}`;
};

// ============================================
// Utilities
// ============================================
const getExtensionFromMimeType = (mimeType: string): string => {
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  return extensions[mimeType] || '.bin';
};

export const getImageMetadata = async (filePath: string): Promise<ImageMetadata | null> => {
  try {
    const stats = await fs.promises.stat(filePath);
    const fileName = path.basename(filePath);
    
    return {
      originalName: fileName,
      fileName,
      mimeType: getMimeTypeFromExtension(path.extname(filePath)),
      size: stats.size,
      path: filePath,
      uploadedAt: stats.birthtime,
    };
  } catch (error) {
    console.error('Error getting image metadata:', error);
    return null;
  }
};

const getMimeTypeFromExtension = (ext: string): string => {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
};

export default {
  uploadBase64Image,
  processMulterUpload,
  deleteFile,
  getFileUrl,
  getImageMetadata,
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
};
