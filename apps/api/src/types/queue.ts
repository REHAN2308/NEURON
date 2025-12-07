// ============================================
// Queue Names
// ============================================
export const QUEUE_NAMES = {
  IMAGE_TO_CODE: 'image-to-code',
  MODIFY_CODE: 'modify-code',
} as const;

// ============================================
// Generation Options
// ============================================
export interface GenerationOptions {
  /** Layout mode: fixed width or responsive */
  layoutMode: 'fixed' | 'responsive';
  /** Style preset: exact match, modern styling, or minimal */
  stylePreset: 'exact' | 'modern' | 'minimal';
  /** Maximum width in pixels (e.g., 960, 1200) */
  maxWidth?: number;
  /** Use compact spacing (smaller paddings and gaps) */
  compact: boolean;
  /** Include explanatory JSX comments in generated code */
  includeComments: boolean;
}

// ============================================
// Image-to-Code Job Types
// ============================================
export interface ImageToCodeJobData {
  projectId: string;
  userId: string;
  imagePath: string;
  codeType: string;
  framework: string;
  /** Optional generation options from frontend */
  generationOptions?: GenerationOptions;
  /** Optional user instructions for code generation */
  instructions?: string;
}

export interface ImageToCodeJobResult {
  success: boolean;
  generatedCode?: string;
  error?: string;
}

// ============================================
// Modify-Code Job Types
// ============================================
export interface ModifyCodeJobData {
  projectId: string;
  currentCode: string;
  userMessage: string;
  mode: 'edit' | 'refactor' | 'explain';
}

export interface ModifyCodeJobResult {
  success: boolean;
  modifiedCode?: string;
  error?: string;
}
