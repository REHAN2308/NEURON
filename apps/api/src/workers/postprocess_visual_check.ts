/**
 * NEURON Visual Fidelity - Postprocess Visual Check
 * ==================================================
 * 
 * This module integrates with the worker pipeline to:
 * 1. Capture screenshots of generated code using headless Chromium
 * 2. Normalize both reference and generated screenshots
 * 3. Apply color transfer to match tones
 * 4. Compute SSIM for similarity measurement
 * 5. Generate CSS patch suggestions if SSIM < threshold
 * 6. Produce detailed JSON reports
 * 
 * @module postprocess_visual_check
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Types
export interface VisualCheckOptions {
  /** Path to reference screenshot */
  referencePath: string;
  /** Path to generated screenshot */
  generatedPath: string;
  /** Job ID for reporting */
  jobId: string;
  /** Output directory for artifacts */
  outputDir?: string;
  /** SSIM threshold for passing (default: 0.94) */
  ssimThreshold?: number;
  /** Whether to attempt auto-patching */
  autoPatching?: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PatchSuggestion {
  type: 'filter' | 'title' | 'container' | 'spacing';
  description: string;
  currentValue?: string;
  suggestedValue: string;
  cssProperty?: string;
  tailwindClass?: string;
}

export interface VisualCheckResult {
  success: boolean;
  ssim: number;
  passed: boolean;
  timestamp: string;
  jobId: string;
  paths: {
    reference: string;
    generated: string;
    referenceNormalized?: string;
    generatedNormalized?: string;
    colorMatched?: string;
  };
  colorShift?: {
    brightness_change: string;
    warmth_change: string;
    L_shift: number;
    a_shift: number;
    b_shift: number;
  };
  patchSuggestions?: PatchSuggestion[];
  diffRegions?: BoundingBox[];
  retryResult?: {
    ssim: number;
    improved: boolean;
    improvementPercent: number;
  };
  error?: string;
}

// Configuration
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || 'python';
const TOOLS_DIR = path.resolve(__dirname, '../../../../tools');
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../../../../artifacts/visual-check');
const DEFAULT_SSIM_THRESHOLD = 0.94;

/**
 * Execute a Python script and return parsed JSON result
 */
async function executePythonScript(
  scriptPath: string,
  args: string[]
): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const fullArgs = [scriptPath, ...args, '--json'];
    
    console.log(`[VISUAL-CHECK] Executing: ${PYTHON_EXECUTABLE} ${fullArgs.join(' ')}`);
    
    const proc = spawn(PYTHON_EXECUTABLE, fullArgs, {
      cwd: TOOLS_DIR,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[VISUAL-CHECK] Python script failed with code ${code}`);
        console.error(`[VISUAL-CHECK] stderr: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code ${code}` });
        return;
      }

      try {
        const data = JSON.parse(stdout.trim());
        resolve({ success: true, data });
      } catch (e) {
        console.error(`[VISUAL-CHECK] Failed to parse JSON output: ${stdout}`);
        resolve({ success: false, error: `JSON parse error: ${stdout}` });
      }
    });

    proc.on('error', (err) => {
      console.error(`[VISUAL-CHECK] Failed to spawn Python: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Normalize an image using the preprocessing pipeline
 */
async function normalizeImage(
  inputPath: string,
  outputPath: string,
  width: number = 1200
): Promise<{ success: boolean; path?: string; error?: string }> {
  const result = await executePythonScript(
    path.join(TOOLS_DIR, 'image_preprocess.py'),
    ['--input', inputPath, '--output', outputPath, '--width', String(width)]
  );

  if (result.success && result.data?.success) {
    return { success: true, path: result.data.output };
  }
  return { success: false, error: result.error || result.data?.error };
}

/**
 * Apply Reinhard color transfer
 */
async function applyColorTransfer(
  sourcePath: string,
  targetPath: string,
  outputPath: string
): Promise<{ success: boolean; path?: string; colorShift?: any; error?: string }> {
  const result = await executePythonScript(
    path.join(TOOLS_DIR, 'color_transfer.py'),
    ['transfer', '--source', sourcePath, '--target', targetPath, '--output', outputPath]
  );

  if (result.success && result.data?.success) {
    return {
      success: true,
      path: result.data.output,
      colorShift: result.data.color_shift,
    };
  }
  return { success: false, error: result.error || result.data?.error };
}

/**
 * Compute SSIM between two images
 */
async function computeSSIM(
  refPath: string,
  genPath: string
): Promise<{ success: boolean; ssim?: number; passed?: boolean; diffRegions?: BoundingBox[]; error?: string }> {
  const result = await executePythonScript(
    path.join(TOOLS_DIR, 'color_transfer.py'),
    ['ssim', '--ref', refPath, '--gen', genPath]
  );

  if (result.success && result.data?.success) {
    return {
      success: true,
      ssim: result.data.ssim,
      passed: result.data.passed,
      diffRegions: result.data.difference_regions?.map((r: any) => r.bbox),
    };
  }
  return { success: false, error: result.error || result.data?.error };
}

/**
 * Extract color palette from an image
 * @internal Reserved for future use
 */
// @ts-ignore: Reserved for future use
async function extractPalette(
  imagePath: string,
  k: number = 6
): Promise<{ success: boolean; palette?: any; error?: string }> {
  const result = await executePythonScript(
    path.join(TOOLS_DIR, 'color_transfer.py'),
    ['palette', '--image', imagePath, '--k', String(k)]
  );

  if (result.success && result.data?.success) {
    return { success: true, palette: result.data };
  }
  return { success: false, error: result.error || result.data?.error };
}

/**
 * Get suggested filter adjustments
 */
async function getSuggestedFilters(
  refPath: string,
  genPath: string
): Promise<{ success: boolean; filters?: any; error?: string }> {
  const result = await executePythonScript(
    path.join(TOOLS_DIR, 'color_transfer.py'),
    ['suggest', '--ref', refPath, '--gen', genPath]
  );

  if (result.success && result.data?.success) {
    return { success: true, filters: result.data };
  }
  return { success: false, error: result.error || result.data?.error };
}

/**
 * Generate patch suggestions based on visual differences
 */
function generatePatchSuggestions(
  ssimResult: { ssim: number; diffRegions?: BoundingBox[] },
  filterSuggestions: any,
  colorShift: any
): PatchSuggestion[] {
  const suggestions: PatchSuggestion[] = [];

  // Filter adjustments
  if (filterSuggestions?.suggested_filters) {
    const { brightness, contrast, saturate } = filterSuggestions.suggested_filters;
    
    if (Math.abs(brightness - 1.0) > 0.05) {
      suggestions.push({
        type: 'filter',
        description: `Adjust brightness to match reference (${colorShift?.brightness_change || 'needed'})`,
        currentValue: '1.0',
        suggestedValue: String(brightness),
        cssProperty: 'filter',
      });
    }
    
    if (Math.abs(contrast - 1.0) > 0.05) {
      suggestions.push({
        type: 'filter',
        description: 'Adjust contrast to match reference',
        currentValue: '1.0',
        suggestedValue: String(contrast),
        cssProperty: 'filter',
      });
    }
    
    if (Math.abs(saturate - 1.0) > 0.1) {
      suggestions.push({
        type: 'filter',
        description: 'Adjust saturation to match reference',
        currentValue: '1.0',
        suggestedValue: String(saturate),
        cssProperty: 'filter',
      });
    }

    // Combined filter suggestion
    if (suggestions.filter(s => s.type === 'filter').length > 0) {
      suggestions.push({
        type: 'filter',
        description: 'Apply combined CSS filter to root element',
        suggestedValue: filterSuggestions.css_filter,
        cssProperty: 'filter',
      });
    }
  }

  // Title size adjustment (if large difference regions at top)
  const topDiffs = (ssimResult.diffRegions || []).filter(r => r.y < 200);
  if (topDiffs.length > 0) {
    suggestions.push({
      type: 'title',
      description: 'Title/heading region has visual differences - consider adjusting size',
      currentValue: 'text-5xl',
      suggestedValue: 'text-6xl',
      tailwindClass: 'text-6xl',
    });
  }

  // Container width (if differences span wide area)
  const wideDiffs = (ssimResult.diffRegions || []).filter(r => r.w > 400);
  if (wideDiffs.length > 0) {
    suggestions.push({
      type: 'container',
      description: 'Container width may need adjustment',
      currentValue: 'md:w-2/3',
      suggestedValue: 'md:w-3/4',
      tailwindClass: 'md:w-3/4',
    });
  }

  return suggestions;
}

/**
 * Save visual check report to JSON file
 */
async function saveReport(
  result: VisualCheckResult,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });

  const reportPath = path.join(outputDir, `${result.jobId}.report.json`);
  await fs.promises.writeFile(reportPath, JSON.stringify(result, null, 2));
  
  console.log(`[VISUAL-CHECK] Report saved: ${reportPath}`);
  return reportPath;
}

/**
 * Save patch suggestion file
 */
async function savePatchSuggestion(
  jobId: string,
  suggestions: PatchSuggestion[],
  outputDir: string
): Promise<string> {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const patchPath = path.join(outputDir, `${jobId}.patch-suggestion.json`);
  
  const patchContent = {
    jobId,
    timestamp: new Date().toISOString(),
    suggestions,
    applyInstructions: [
      'To apply filter suggestions, add the CSS filter to the root <main> element:',
      '  style={{ filter: "brightness(...) contrast(...) saturate(...)" }}',
      '',
      'To apply Tailwind class changes, update the corresponding className attributes.',
      '',
      'After applying changes, re-run visual-check to verify improvement.',
    ],
  };

  await fs.promises.writeFile(patchPath, JSON.stringify(patchContent, null, 2));
  
  console.log(`[VISUAL-CHECK] Patch suggestion saved: ${patchPath}`);
  return patchPath;
}

/**
 * Main visual check function
 */
export async function runVisualCheck(options: VisualCheckOptions): Promise<VisualCheckResult> {
  const {
    referencePath,
    generatedPath,
    jobId,
    outputDir = DEFAULT_OUTPUT_DIR,
    ssimThreshold = DEFAULT_SSIM_THRESHOLD,
    autoPatching = true,
  } = options;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[VISUAL-CHECK] Starting visual fidelity check`);
  console.log(`   Job ID: ${jobId}`);
  console.log(`   Reference: ${referencePath}`);
  console.log(`   Generated: ${generatedPath}`);
  console.log(`   Threshold: ${ssimThreshold}`);
  console.log(`${'═'.repeat(60)}\n`);

  const result: VisualCheckResult = {
    success: false,
    ssim: 0,
    passed: false,
    timestamp: new Date().toISOString(),
    jobId,
    paths: {
      reference: referencePath,
      generated: generatedPath,
    },
  };

  try {
    // Verify input files exist
    if (!fs.existsSync(referencePath)) {
      throw new Error(`Reference image not found: ${referencePath}`);
    }
    if (!fs.existsSync(generatedPath)) {
      throw new Error(`Generated image not found: ${generatedPath}`);
    }

    // Create output directory
    const jobOutputDir = path.join(outputDir, jobId);
    await fs.promises.mkdir(jobOutputDir, { recursive: true });

    // Step 1: Normalize images
    console.log('[VISUAL-CHECK] Step 1: Normalizing images...');
    
    const refNormPath = path.join(jobOutputDir, 'ref_normalized.png');
    const genNormPath = path.join(jobOutputDir, 'gen_normalized.png');

    const refNorm = await normalizeImage(referencePath, refNormPath);
    if (!refNorm.success) {
      throw new Error(`Failed to normalize reference: ${refNorm.error}`);
    }
    result.paths.referenceNormalized = refNorm.path;

    const genNorm = await normalizeImage(generatedPath, genNormPath);
    if (!genNorm.success) {
      throw new Error(`Failed to normalize generated: ${genNorm.error}`);
    }
    result.paths.generatedNormalized = genNorm.path;

    console.log('[VISUAL-CHECK] ✓ Images normalized');

    // Step 2: Apply color transfer
    console.log('[VISUAL-CHECK] Step 2: Applying color transfer...');
    
    const matchedPath = path.join(jobOutputDir, 'gen_matched.png');
    const colorResult = await applyColorTransfer(genNormPath, refNormPath, matchedPath);
    
    if (colorResult.success) {
      result.paths.colorMatched = colorResult.path;
      result.colorShift = colorResult.colorShift;
      console.log(`[VISUAL-CHECK] ✓ Color transfer applied (${colorResult.colorShift?.brightness_change})`);
    } else {
      console.log(`[VISUAL-CHECK] ⚠ Color transfer failed: ${colorResult.error}`);
    }

    // Step 3: Compute SSIM
    console.log('[VISUAL-CHECK] Step 3: Computing SSIM...');
    
    const ssimImagePath = colorResult.success ? matchedPath : genNormPath;
    const ssimResult = await computeSSIM(refNormPath, ssimImagePath);
    
    if (!ssimResult.success) {
      throw new Error(`Failed to compute SSIM: ${ssimResult.error}`);
    }

    result.ssim = ssimResult.ssim!;
    result.passed = result.ssim >= ssimThreshold;
    result.diffRegions = ssimResult.diffRegions;

    console.log(`[VISUAL-CHECK] ✓ SSIM: ${result.ssim.toFixed(4)} (threshold: ${ssimThreshold})`);
    console.log(`[VISUAL-CHECK] ${result.passed ? '✓ PASSED' : '✗ FAILED'}`);

    // Step 4: Generate suggestions if failed
    if (!result.passed && autoPatching) {
      console.log('[VISUAL-CHECK] Step 4: Generating patch suggestions...');

      const filterResult = await getSuggestedFilters(refNormPath, genNormPath);
      
      if (filterResult.success) {
        result.patchSuggestions = generatePatchSuggestions(
          { ssim: result.ssim, diffRegions: result.diffRegions },
          filterResult.filters,
          result.colorShift
        );

        if (result.patchSuggestions.length > 0) {
          await savePatchSuggestion(jobId, result.patchSuggestions, jobOutputDir);
          console.log(`[VISUAL-CHECK] ✓ Generated ${result.patchSuggestions.length} patch suggestions`);
        }
      }
    }

    result.success = true;

    // Save report
    await saveReport(result, jobOutputDir);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[VISUAL-CHECK] ❌ Error: ${errorMessage}`);
    result.error = errorMessage;
    result.success = false;
  }

  console.log(`\n[VISUAL-CHECK] Completed. Success: ${result.success}, SSIM: ${result.ssim.toFixed(4)}\n`);

  return result;
}

/**
 * Run visual check from CLI arguments (for dev script)
 */
export async function runFromCLI(args: string[]): Promise<void> {
  const refIndex = args.indexOf('--ref');
  const genIndex = args.indexOf('--gen');
  const jobIndex = args.indexOf('--job');
  const outputIndex = args.indexOf('--output');

  if (refIndex === -1 || genIndex === -1) {
    console.error('Usage: --ref <reference.png> --gen <generated.png> [--job <jobId>] [--output <dir>]');
    process.exit(1);
  }

  const options: VisualCheckOptions = {
    referencePath: args[refIndex + 1],
    generatedPath: args[genIndex + 1],
    jobId: jobIndex !== -1 ? args[jobIndex + 1] : `cli-${Date.now()}`,
    outputDir: outputIndex !== -1 ? args[outputIndex + 1] : undefined,
  };

  const result = await runVisualCheck(options);
  
  // Output result for CLI consumption
  console.log('\n' + '─'.repeat(60));
  console.log('VISUAL CHECK RESULT:');
  console.log(JSON.stringify(result, null, 2));
  
  process.exit(result.passed ? 0 : 1);
}

// CLI entry point
if (require.main === module) {
  runFromCLI(process.argv.slice(2));
}

export default runVisualCheck;
