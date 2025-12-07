#!/usr/bin/env node
/**
 * NEURON Visual Check CLI
 * =======================
 * 
 * Development CLI tool for running visual fidelity checks between
 * a reference image and a generated preview.
 * 
 * Usage:
 *   npm run visual-check -- --ref <reference.png> --gen <generated.png>
 *   npm run visual-check -- --ref ./ref.png --gen ./gen.png --job my-test-job
 *   npm run visual-check -- --ref ./ref.png --gen ./gen.png --output ./my-artifacts
 * 
 * Options:
 *   --ref <path>     Path to reference screenshot (required)
 *   --gen <path>     Path to generated screenshot (required)
 *   --job <id>       Job ID for report naming (default: cli-<timestamp>)
 *   --output <dir>   Output directory for artifacts (default: ./artifacts/visual-check)
 *   --threshold <n>  SSIM threshold for passing (default: 0.94)
 *   --help           Show this help message
 * 
 * Output:
 *   - JSON report at <output>/<jobId>/<jobId>.report.json
 *   - Patch suggestions at <output>/<jobId>/<jobId>.patch-suggestion.json (if SSIM < threshold)
 *   - Normalized images in the output directory
 * 
 * Exit codes:
 *   0 - Visual check passed (SSIM >= threshold)
 *   1 - Visual check failed (SSIM < threshold) or error occurred
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
function parseArgs(args) {
  const parsed = {
    ref: null,
    gen: null,
    job: `cli-${Date.now()}`,
    output: path.resolve(__dirname, '../artifacts/visual-check'),
    threshold: 0.94,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--ref':
      case '-r':
        parsed.ref = args[++i];
        break;
      case '--gen':
      case '-g':
        parsed.gen = args[++i];
        break;
      case '--job':
      case '-j':
        parsed.job = args[++i];
        break;
      case '--output':
      case '-o':
        parsed.output = args[++i];
        break;
      case '--threshold':
      case '-t':
        parsed.threshold = parseFloat(args[++i]);
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

// Show help message
function showHelp() {
  console.log(`
NEURON Visual Check CLI
=======================

Compare a reference screenshot with a generated preview and compute
visual similarity metrics.

Usage:
  npm run visual-check -- --ref <reference.png> --gen <generated.png>

Options:
  --ref, -r <path>      Path to reference screenshot (required)
  --gen, -g <path>      Path to generated screenshot (required)
  --job, -j <id>        Job ID for report naming (default: cli-<timestamp>)
  --output, -o <dir>    Output directory (default: ./artifacts/visual-check)
  --threshold, -t <n>   SSIM threshold for passing (default: 0.94)
  --help, -h            Show this help message

Example:
  npm run visual-check -- --ref ./screenshots/ref.png --gen ./screenshots/gen.png

Output Files:
  - <jobId>.report.json          Full visual check report
  - <jobId>.patch-suggestion.json  CSS patch suggestions (if SSIM < threshold)
  - ref_normalized.png           Preprocessed reference image
  - gen_normalized.png           Preprocessed generated image
  - gen_matched.png              Color-matched generated image
`);
}

// Check Python dependencies
async function checkPythonDeps() {
  return new Promise((resolve) => {
    const proc = spawn('python', ['--version'], { shell: true });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

// Run the visual check using the TypeScript module
async function runVisualCheck(options) {
  const toolsDir = path.resolve(__dirname, '../tools');
  const outputDir = path.resolve(options.output, options.job);
  
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const results = {
    success: false,
    ssim: 0,
    passed: false,
    jobId: options.job,
    paths: {
      reference: path.resolve(options.ref),
      generated: path.resolve(options.gen),
    },
    steps: [],
    error: null,
  };

  console.log('\n' + '═'.repeat(60));
  console.log('NEURON Visual Fidelity Check');
  console.log('═'.repeat(60));
  console.log(`Reference: ${options.ref}`);
  console.log(`Generated: ${options.gen}`);
  console.log(`Threshold: ${options.threshold}`);
  console.log(`Output: ${outputDir}`);
  console.log('═'.repeat(60) + '\n');

  // Step 1: Normalize reference image
  console.log('[1/4] Normalizing reference image...');
  const refNormResult = await runPython(toolsDir, [
    'image_preprocess.py',
    '--input', path.resolve(options.ref),
    '--output', path.join(outputDir, 'ref_normalized.png'),
    '--json'
  ]);
  
  if (!refNormResult.success) {
    results.error = `Failed to normalize reference: ${refNormResult.error}`;
    return results;
  }
  results.paths.referenceNormalized = refNormResult.data.output;
  results.steps.push({ step: 'normalize_ref', success: true });
  console.log('      ✓ Reference normalized');

  // Step 2: Normalize generated image
  console.log('[2/4] Normalizing generated image...');
  const genNormResult = await runPython(toolsDir, [
    'image_preprocess.py',
    '--input', path.resolve(options.gen),
    '--output', path.join(outputDir, 'gen_normalized.png'),
    '--json'
  ]);
  
  if (!genNormResult.success) {
    results.error = `Failed to normalize generated: ${genNormResult.error}`;
    return results;
  }
  results.paths.generatedNormalized = genNormResult.data.output;
  results.steps.push({ step: 'normalize_gen', success: true });
  console.log('      ✓ Generated normalized');

  // Step 3: Apply color transfer
  console.log('[3/4] Applying color transfer...');
  const colorResult = await runPython(toolsDir, [
    'color_transfer.py',
    'transfer',
    '--source', results.paths.generatedNormalized,
    '--target', results.paths.referenceNormalized,
    '--output', path.join(outputDir, 'gen_matched.png')
  ]);
  
  if (colorResult.success && colorResult.data?.success) {
    results.paths.colorMatched = colorResult.data.output;
    results.colorShift = colorResult.data.color_shift;
    results.steps.push({ step: 'color_transfer', success: true });
    console.log(`      ✓ Color transfer applied (${results.colorShift?.brightness_change || 'adjusted'})`);
  } else {
    console.log('      ⚠ Color transfer skipped');
    results.steps.push({ step: 'color_transfer', success: false, error: colorResult.error });
  }

  // Step 4: Compute SSIM
  console.log('[4/4] Computing SSIM...');
  const ssimImagePath = results.paths.colorMatched || results.paths.generatedNormalized;
  const ssimResult = await runPython(toolsDir, [
    'color_transfer.py',
    'ssim',
    '--ref', results.paths.referenceNormalized,
    '--gen', ssimImagePath
  ]);
  
  if (!ssimResult.success || !ssimResult.data?.success) {
    results.error = `Failed to compute SSIM: ${ssimResult.error || ssimResult.data?.error}`;
    return results;
  }
  
  results.ssim = ssimResult.data.ssim;
  results.passed = results.ssim >= options.threshold;
  results.diffRegions = ssimResult.data.difference_regions;
  results.steps.push({ step: 'ssim', success: true, value: results.ssim });
  
  console.log(`      ✓ SSIM: ${results.ssim.toFixed(4)}`);

  // Generate patch suggestions if failed
  if (!results.passed) {
    console.log('\n[*] Generating patch suggestions...');
    const suggestResult = await runPython(toolsDir, [
      'color_transfer.py',
      'suggest',
      '--ref', results.paths.referenceNormalized,
      '--gen', results.paths.generatedNormalized
    ]);
    
    if (suggestResult.success && suggestResult.data?.success) {
      results.suggestions = suggestResult.data;
      
      // Save patch suggestion file
      const patchPath = path.join(outputDir, `${options.job}.patch-suggestion.json`);
      fs.writeFileSync(patchPath, JSON.stringify({
        jobId: options.job,
        timestamp: new Date().toISOString(),
        ssim: results.ssim,
        filters: suggestResult.data.suggested_filters,
        css: suggestResult.data.css_filter,
        tone: suggestResult.data.tone_suggestion,
      }, null, 2));
      
      console.log(`      ✓ Patch suggestions saved to: ${patchPath}`);
    }
  }

  // Save full report
  results.success = true;
  results.timestamp = new Date().toISOString();
  
  const reportPath = path.join(outputDir, `${options.job}.report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Report saved to: ${reportPath}`);

  return results;
}

// Run a Python script and parse JSON output
function runPython(cwd, args) {
  return new Promise((resolve) => {
    const proc = spawn('python', args, { cwd, shell: true });
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
        resolve({ success: false, error: stderr || `Exit code ${code}` });
        return;
      }

      try {
        const data = JSON.parse(stdout.trim());
        resolve({ success: true, data });
      } catch (e) {
        resolve({ success: false, error: `JSON parse error: ${stdout}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

// Main entry point
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.ref || !args.gen) {
    console.error('Error: --ref and --gen arguments are required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Validate input files exist
  if (!fs.existsSync(args.ref)) {
    console.error(`Error: Reference file not found: ${args.ref}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.gen)) {
    console.error(`Error: Generated file not found: ${args.gen}`);
    process.exit(1);
  }

  // Check Python is available
  const hasPython = await checkPythonDeps();
  if (!hasPython) {
    console.error('Error: Python is required but not found in PATH');
    console.error('Please install Python and the required packages:');
    console.error('  pip install pillow opencv-python numpy scikit-learn scikit-image');
    process.exit(1);
  }

  // Run visual check
  const result = await runVisualCheck(args);

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('RESULT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`SSIM Score: ${result.ssim?.toFixed(4) || 'N/A'}`);
  console.log(`Threshold:  ${args.threshold}`);
  console.log(`Status:     ${result.passed ? '✓ PASSED' : '✗ FAILED'}`);
  
  if (result.colorShift) {
    console.log(`\nColor Analysis:`);
    console.log(`  Brightness: ${result.colorShift.brightness_change}`);
    console.log(`  Warmth: ${result.colorShift.warmth_change}`);
  }

  if (result.suggestions?.suggested_filters) {
    console.log(`\nSuggested Filters:`);
    console.log(`  ${result.suggestions.css_filter}`);
  }

  if (result.error) {
    console.error(`\nError: ${result.error}`);
  }

  console.log('═'.repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
