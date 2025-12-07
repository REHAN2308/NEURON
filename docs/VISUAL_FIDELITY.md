# NEURON Visual Fidelity Enhancement Pipeline

This document describes the visual fidelity enhancement system for NEURON's Image→Code product. The goal is to make generated UI output match reference screenshots more closely in terms of lighting, color palette, spacing, and element size/position.

## Overview

The pipeline consists of:

1. **Image Preprocessing** - Normalizes screenshots for consistent comparison
2. **Color Transfer** - Matches generated preview tones to reference using Reinhard algorithm
3. **Enhanced Layout Analysis** - Stage-1 prompt returns numeric layout hints (bbox, typography, colorHints)
4. **Deterministic Code Generation** - Stage-2 prompt maps numeric hints to Tailwind classes
5. **Postprocess Visual Check** - Computes SSIM and generates CSS patch suggestions
6. **Dev CLI Tool** - Manual testing of visual similarity

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       NEURON Pipeline                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ Reference │───▶│ Stage 1:     │───▶│ Stage 2:     │               │
│  │ Screenshot│    │ Layout       │    │ Code         │               │
│  └──────────┘    │ Analyzer     │    │ Generator    │               │
│                  │ (+ visualHints)│   │ (+ mappings) │               │
│                  └──────────────┘    └──────────────┘               │
│                                             │                        │
│                                             ▼                        │
│                  ┌──────────────┐    ┌──────────────┐               │
│                  │ Postprocess  │◀───│ Generated    │               │
│                  │ Visual Check │    │ Code         │               │
│                  └──────────────┘    └──────────────┘               │
│                         │                                            │
│                         ▼                                            │
│               ┌────────────────────┐                                 │
│               │ SSIM >= 0.94?      │                                 │
│               └────────────────────┘                                 │
│                    │          │                                      │
│                   YES         NO                                     │
│                    │          │                                      │
│                    ▼          ▼                                      │
│               ┌────────┐  ┌────────────────┐                        │
│               │ Done   │  │ Generate Patch │                        │
│               └────────┘  │ Suggestions    │                        │
│                           └────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
NEURON/
├── tools/
│   ├── image_preprocess.py    # Image normalization utilities
│   └── color_transfer.py      # Reinhard color transfer & palette
├── scripts/
│   └── run_visual_check.js    # Dev CLI tool
├── apps/api/src/workers/
│   ├── worker.ts              # Main worker (updated prompts)
│   └── postprocess_visual_check.ts  # Visual check integration
├── artifacts/visual-check/    # Output directory for reports
│   └── <jobId>/
│       ├── ref_normalized.png
│       ├── gen_normalized.png
│       ├── gen_matched.png
│       ├── <jobId>.report.json
│       └── <jobId>.patch-suggestion.json
└── docs/
    └── VISUAL_FIDELITY.md     # This file
```

## Mapping Tables

### Width Mapping (w_norm → Tailwind)

| w_norm Range | Tailwind Class |
|-------------|----------------|
| >= 0.95     | `w-full`       |
| >= 0.80     | `md:w-4/5`     |
| >= 0.66     | `md:w-2/3`     |
| >= 0.50     | `md:w-1/2`     |
| >= 0.33     | `md:w-1/3`     |
| >= 0.25     | `md:w-1/4`     |
| < 0.25      | `w-auto`       |

### Title Size Mapping (px → Tailwind)

| titleSizePx | Tailwind Class |
|-------------|----------------|
| <= 14       | `text-xs`      |
| <= 16       | `text-sm`      |
| <= 20       | `text-base`    |
| <= 24       | `text-lg`      |
| <= 30       | `text-xl`      |
| <= 36       | `text-2xl`     |
| <= 48       | `text-3xl`     |
| <= 60       | `text-4xl`     |
| <= 72       | `text-5xl`     |
| <= 96       | `text-6xl`     |
| > 96        | `text-7xl`     |

### Body Size Mapping (px → Tailwind)

| bodySizePx | Tailwind Class |
|------------|----------------|
| <= 12      | `text-xs`      |
| <= 14      | `text-sm`      |
| <= 16      | `text-base`    |
| <= 18      | `text-lg`      |
| > 18       | `text-xl`      |

### Spacing Mapping (y_norm gap → Tailwind)

| Gap (y_norm) | Tailwind Class |
|-------------|----------------|
| < 0.02      | `p-2` / `gap-2`|
| < 0.04      | `p-4` / `gap-4`|
| < 0.06      | `p-6` / `gap-6`|
| >= 0.06     | `p-8` / `gap-8`|

## Visual Hints JSON Schema

The layout analyzer now returns a `visualHints` object:

```json
{
  "visualHints": {
    "nodes": [
      {
        "id": "hero-section",
        "tag": "section",
        "bbox": {
          "x_norm": 0.05,
          "y_norm": 0.15,
          "w_norm": 0.90,
          "h_norm": 0.40
        },
        "typography": {
          "titleSizePx": 48,
          "bodySizePx": 16
        },
        "colorHints": {
          "bg": "#0a0a0a",
          "accent": "#3b82f6"
        },
        "vignette": true,
        "tone": "darker",
        "suggestedFilters": {
          "brightness": 0.95,
          "contrast": 1.05,
          "saturate": 1.1
        }
      }
    ]
  }
}
```

## Usage

### Running Visual Check (Dev CLI)

```bash
# Basic usage
npm run visual-check -- --ref ./screenshots/reference.png --gen ./screenshots/generated.png

# With custom job ID and output directory
npm run visual-check -- --ref ./ref.png --gen ./gen.png --job my-test --output ./my-artifacts

# With custom SSIM threshold
npm run visual-check -- --ref ./ref.png --gen ./gen.png --threshold 0.90
```

### CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--ref` | `-r` | Reference screenshot path | (required) |
| `--gen` | `-g` | Generated screenshot path | (required) |
| `--job` | `-j` | Job ID for report naming | `cli-<timestamp>` |
| `--output` | `-o` | Output directory | `./artifacts/visual-check` |
| `--threshold` | `-t` | SSIM threshold for passing | `0.94` |
| `--help` | `-h` | Show help message | |

### Output Files

After running visual check, you'll find:

1. **`<jobId>.report.json`** - Full visual check report including:
   - SSIM score
   - Pass/fail status
   - Color shift analysis
   - Difference regions
   - All file paths

2. **`<jobId>.patch-suggestion.json`** - CSS patch suggestions (if SSIM < threshold):
   - Filter adjustments (brightness, contrast, saturate)
   - CSS filter string to apply
   - Tone suggestion (warmer/cooler/darker/lighter)

3. **Normalized images**:
   - `ref_normalized.png` - Preprocessed reference
   - `gen_normalized.png` - Preprocessed generated
   - `gen_matched.png` - Color-matched generated

## Verification Checklist

### Pre-flight Checks

- [ ] Python 3.8+ installed
- [ ] Required Python packages installed:
  ```bash
  pip install pillow opencv-python numpy scikit-learn scikit-image
  ```
- [ ] Reference and generated images exist and are accessible

### Worker Integration Verification

1. Check worker logs for postprocess step:
   ```
   [VISUAL-CHECK] Running visual fidelity check for project <id>...
   [VISUAL-CHECK] Completed: SSIM=0.XXXX, Passed=true/false
   ```

2. Verify artifacts directory created:
   ```bash
   ls ./artifacts/visual-check/<projectId>/
   ```

### CLI Tool Verification

1. Run with test images:
   ```bash
   npm run visual-check -- --ref ./test/ref.png --gen ./test/gen.png
   ```

2. Expected output:
   ```
   ═══════════════════════════════════════════════════════════════
   RESULT SUMMARY
   ═══════════════════════════════════════════════════════════════
   SSIM Score: 0.9234
   Threshold:  0.94
   Status:     ✗ FAILED
   
   Color Analysis:
     Brightness: darker
     Warmth: cooler
   
   Suggested Filters:
     filter: brightness(0.95) contrast(1.02) saturate(1.08);
   ═══════════════════════════════════════════════════════════════
   ```

### Stage-1 Verification (Layout Analyzer)

Check that the layout JSON includes `visualHints`:

```json
{
  "page": { ... },
  "metadata": { ... },
  "visualHints": {
    "nodes": [
      {
        "id": "main-hero",
        "bbox": { "x_norm": 0.1, "y_norm": 0.2, "w_norm": 0.8, "h_norm": 0.5 },
        "typography": { "titleSizePx": 48 },
        ...
      }
    ]
  }
}
```

### Stage-2 Verification (Code Generator)

Check generated code for:

1. **Tailwind classes matching mappings**:
   ```jsx
   <h1 className="text-5xl">  // For titleSizePx ~48
   <div className="md:w-2/3"> // For w_norm ~0.66
   ```

2. **Filter styles when suggestedFilters provided**:
   ```jsx
   <main style={{ filter: 'brightness(0.95) contrast(1.05) saturate(1.1)' }}>
   ```

3. **Vignette overlay when vignette: true**:
   ```jsx
   <main className="relative after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(...)]">
   ```

## Sample Patch Application

When a patch suggestion is generated, apply it like this:

### Before (original generated code)
```jsx
export default function GeneratedUI() {
  return (
    <main className="min-h-screen bg-[#050505]">
      <h1 className="text-5xl">Title</h1>
      <div className="md:w-2/3">Content</div>
    </main>
  );
}
```

### After (with patch applied)
```jsx
export default function GeneratedUI() {
  return (
    <main 
      className="min-h-screen bg-[#050505]"
      style={{ filter: 'brightness(0.95) contrast(1.02) saturate(1.08)' }}
    >
      <h1 className="text-6xl">Title</h1>
      <div className="md:w-3/4">Content</div>
    </main>
  );
}
```

### Sample Frontend Patch Payload

When the frontend persists an edit patch:

```json
{
  "type": "VISUAL_FIDELITY_PATCH",
  "projectId": "proj_abc123",
  "timestamp": "2025-12-04T10:30:00Z",
  "patches": [
    {
      "type": "filter",
      "target": "root",
      "value": "brightness(0.95) contrast(1.02) saturate(1.08)"
    },
    {
      "type": "class",
      "selector": "h1.title",
      "remove": "text-5xl",
      "add": "text-6xl"
    },
    {
      "type": "class",
      "selector": "div.container",
      "remove": "md:w-2/3",
      "add": "md:w-3/4"
    }
  ],
  "ssimBefore": 0.8934,
  "ssimAfter": 0.9512,
  "improvement": 0.0578
}
```

## Troubleshooting

### Python Not Found

```
Error: Python is required but not found in PATH
```

Solution: Install Python 3.8+ and ensure it's in your PATH.

### Missing Python Dependencies

```
{"success": false, "error": "Missing dependency: No module named 'cv2'"}
```

Solution:
```bash
pip install pillow opencv-python numpy scikit-learn scikit-image
```

### SSIM Computation Fails

```
{"success": false, "error": "scikit-image not installed"}
```

Solution:
```bash
pip install scikit-image
```

### Low SSIM Despite Visual Similarity

This can happen due to:
- Different image dimensions (check normalization)
- Color space differences
- Minor positioning shifts

Try:
1. Use `--threshold 0.85` for more lenient checking
2. Inspect normalized images to ensure proper cropping
3. Check color transfer output for over-correction

## Dependencies

### Python (tools/)

```
pillow>=9.0.0
opencv-python>=4.5.0
numpy>=1.21.0
scikit-learn>=1.0.0
scikit-image>=0.19.0
```

### Node.js (scripts/)

No additional dependencies - uses built-in modules only.

## Future Improvements

1. **Headless Screenshot Capture** - Integrate Puppeteer to automatically capture generated code previews
2. **Iterative Refinement** - Automatically apply patches and re-check SSIM in a loop
3. **ML-Based Patch Generation** - Train a model to predict optimal CSS adjustments
4. **Visual Regression CI** - Integrate with CI/CD to catch visual regressions
