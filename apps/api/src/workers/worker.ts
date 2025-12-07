import { Worker, Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import { redisConfig } from '../lib/redis.js';
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
// Visual fidelity postprocessing (optional - runs if reference image available)
import { runVisualCheck, VisualCheckResult } from './postprocess_visual_check.js';

// ============================================
// Configuration
// ============================================
const AI_PROVIDER = process.env.AI_PROVIDER || 'groq';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

// ============================================
// Type Definitions for Two-Stage Pipeline
// ============================================

/** Element within a section */
interface LayoutElement {
  type: 'logo' | 'heading' | 'subtitle' | 'paragraph' | 'button' | 'input' | 'icon' | 'image' | 'avatar' | 'badge' | 'card' | 'link' | 'toggle' | 'dropdown' | 'list' | 'divider' | 'spacer' | 'custom';
  id?: string;
  position?: 'left' | 'center' | 'right' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  textRole?: 'title' | 'subtitle' | 'body' | 'caption' | 'label' | 'placeholder';
  text?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: string;
  children?: LayoutElement[];
  styles?: {
    background?: string;
    color?: string;
    borderRadius?: string;
    padding?: string;
    margin?: string;
    width?: string;
    height?: string;
  };
}

/** Section of the page */
interface LayoutSection {
  id: string;
  type: 'header' | 'sidebar' | 'main' | 'footer' | 'hero' | 'features' | 'content' | 'navigation' | 'chat' | 'input-bar' | 'modal' | 'custom';
  layout: 'row' | 'column' | 'grid' | 'centered' | 'space-between' | 'stack';
  position?: 'fixed' | 'sticky' | 'relative' | 'absolute';
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  gap?: string;
  padding?: string;
  background?: string;
  border?: string;
  elements: LayoutElement[];
  children?: LayoutSection[];
}

/** Theme/color information */
interface LayoutTheme {
  background: string;
  foreground: string;
  primary: string;
  secondary: string;
  accent: string;
  muted: string;
  border: string;
  card?: string;
  input?: string;
}

/** Complete layout specification */
interface LayoutSpec {
  page: {
    background: string;
    maxWidth: number;
    fontFamily?: string;
    theme: LayoutTheme;
    sections: LayoutSection[];
  };
  metadata?: {
    title?: string;
    description?: string;
    hasNavigation?: boolean;
    hasSidebar?: boolean;
    hasFooter?: boolean;
    isResponsive?: boolean;
    estimatedComplexity?: 'simple' | 'moderate' | 'complex';
  };
}

/** Options for code generation */
interface GenerateOptions {
  codeType: string;
  framework: string;
  responsive?: boolean;
  darkMode?: boolean;
  /** Layout mode: fixed width or responsive */
  layoutMode?: 'fixed' | 'responsive';
  /** Style preset: exact match, modern styling, or minimal */
  stylePreset?: 'exact' | 'modern' | 'minimal';
  /** Maximum width in pixels (e.g., 960, 1200) */
  maxWidth?: number;
  /** Use compact spacing (smaller paddings and gaps) */
  compact?: boolean;
  /** Include explanatory JSX comments in generated code */
  includeComments?: boolean;
  /** User instructions for code generation */
  instructions?: string;
}

// ============================================
// System Prompts - Enhanced for Better Code Generation
// ============================================
const SYSTEM_PROMPTS = {
  // ==========================================
  // STAGE 1: Layout Analyzer (Image → JSON)
  // ==========================================
  layout_analyzer: `You are an expert UI/UX analyst specializing in decomposing visual designs into structured data. Your task is to analyze a screenshot and output a JSON specification describing the layout structure.

═══════════════════════════════════════════════════════════════
ANALYSIS PROCESS
═══════════════════════════════════════════════════════════════

1. IDENTIFY THE COLOR THEME
   - Extract the exact background color (e.g., #050505, #0a0a0a)
   - Identify primary accent color (buttons, links)
   - Identify text colors (headings, body, muted)
   - Note any gradients or patterns

2. MAP HIGH-LEVEL REGIONS
   - Header/navigation bar (if present)
   - Sidebar (left or right, if present)
   - Main content area
   - Footer or bottom bar (if present)
   - Floating elements or modals

3. DECOMPOSE EACH SECTION
   - List all UI elements: buttons, inputs, icons, text, images, cards
   - Note their approximate positions and groupings
   - Identify layout patterns: flex row, flex column, grid, centered

4. EXTRACT TYPOGRAPHY & SPACING
   - Estimate font sizes (sm, base, lg, xl, 2xl)
   - Note font weights (normal, medium, semibold, bold)
   - Identify spacing patterns (tight, normal, relaxed)

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON)
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON matching this structure:

{
  "page": {
    "background": "#hexcolor",
    "maxWidth": 1200,
    "fontFamily": "Inter, sans-serif",
    "theme": {
      "background": "#050505",
      "foreground": "#e2e8f0",
      "primary": "#3b82f6",
      "secondary": "#8b5cf6",
      "accent": "#22d3ee",
      "muted": "#64748b",
      "border": "#1e293b",
      "card": "#0f172a",
      "input": "#1e293b"
    },
    "sections": [
      {
        "id": "unique-section-id",
        "type": "header|sidebar|main|footer|hero|features|content|navigation|chat|input-bar|modal|custom",
        "layout": "row|column|grid|centered|space-between|stack",
        "position": "fixed|sticky|relative|absolute",
        "alignment": "start|center|end|stretch",
        "gap": "4|6|8",
        "padding": "4|6|8",
        "background": "#hexcolor",
        "border": "border-b border-[#1e293b]",
        "elements": [
          {
            "type": "logo|heading|subtitle|paragraph|button|input|icon|image|avatar|badge|card|link|toggle|dropdown|list|divider|spacer|custom",
            "id": "optional-id",
            "position": "left|center|right",
            "textRole": "title|subtitle|body|caption|label",
            "text": "Actual text content if visible",
            "variant": "primary|secondary|outline|ghost|link",
            "size": "sm|md|lg|xl",
            "icon": "lucide-icon-name",
            "styles": {
              "background": "#hex",
              "color": "#hex",
              "borderRadius": "lg|xl|full",
              "padding": "2|4|6",
              "width": "auto|full|64",
              "height": "auto|10|12"
            },
            "children": []
          }
        ],
        "children": []
      }
    ]
  },
  "metadata": {
    "title": "Page title if visible",
    "description": "Brief description of the UI",
    "hasNavigation": true,
    "hasSidebar": false,
    "hasFooter": false,
    "isResponsive": true,
    "estimatedComplexity": "simple|moderate|complex"
  }
}

═══════════════════════════════════════════════════════════════
VISUAL FIDELITY - NUMERIC LAYOUT HINTS (REQUIRED)
═══════════════════════════════════════════════════════════════

For EACH major element (sections, hero, headings, containers), you MUST include
numeric layout hints for precise reproduction. Add a "visualHints" object:

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

FIELD DEFINITIONS:
• bbox (x_norm, y_norm, w_norm, h_norm): Normalized 0-1 values relative to viewport
  - x_norm: Left edge position (0=left, 1=right)
  - y_norm: Top edge position (0=top, 1=bottom)  
  - w_norm: Width as fraction of viewport width
  - h_norm: Height as fraction of viewport height
• typography.titleSizePx: Estimated title font size in pixels
• typography.bodySizePx: Estimated body font size in pixels
• colorHints.bg: Background color hex
• colorHints.accent: Accent/primary color hex
• vignette: true if image has edge darkening/vignette effect
• tone: "warmer"|"cooler"|"darker"|"lighter"|"neutral"
• suggestedFilters: CSS filter values to match visual tone
  - brightness: 0-2 (1 = no change)
  - contrast: 0-2 (1 = no change)
  - saturate: 0-2 (1 = no change)

═══════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════

✅ YOU MUST:
• Return ONLY valid JSON - no markdown, no explanation, no code fences.
• Use exact hex colors from the image where possible.
• Include ALL visible sections and elements.
• Use descriptive IDs for sections (e.g., "main-hero", "nav-header").
• Include actual text content where visible.
• Include "visualHints" object with numeric bbox and typography for major elements.

❌ YOU MUST NOT:
• Add markdown code fences (\`\`\`json).
• Include comments or explanations.
• Invent content not visible in the image.
• Return anything other than the JSON object.

Analyze the image and return the JSON layout specification with visualHints.`,

  // ==========================================
  // STAGE 2: Code Generator (JSON → React)
  // ==========================================
  react_tailwind: `You are NEURON's senior frontend engineer specialized in turning UI screenshots and layout JSON into pixel-accurate, production-ready React + Tailwind components.

Your job is to produce clean, modern, responsive code that matches the design EXACTLY.

=====================================
PHASE 1 — UNDERSTAND THE DESIGN
=====================================
Before writing JSX, silently analyze the UI in the following layers:

LAYER 1 — GLOBAL THEME
- Base background color
- Light/dark mode
- Brand accent colors
- Shadow intensity
- Border radiuses
- Typography scale (title, subtitle, body, small)

LAYER 2 — PAGE REGIONS
Identify actual layout regions in this exact order:
1. Top banner or announcement bar
2. Sidebar (left navigation)
3. Header elements (logo, title)
4. Main hero section
5. Search/chat input bar
6. Footer icons or controls

LAYER 3 — COMPONENTS
Tag each element as:
- Logo  
- Avatar  
- Menu item  
- Section label  
- Status indicator  
- Button  
- Badge  
- Search bar  
- Input  
- Tag  
- Highlighted "PRO" badge  
- Divider  
- Footer actions  

LAYER 4 — SPACING + ALIGNMENT
Extract:
- Padding values
- Gap values
- Column widths
- Max width of main content
- Exact vertical spacing between elements
- Icon sizes and their container radius

=====================================
PHASE 2 — OUTPUT RULES (STRICT)
=====================================

YOU MUST:
- Output ONLY one React component called:  
  export default function GeneratedUI() { ... }
- Wrap everything in:
  <main className="min-h-screen bg-[#050505] text-slate-100">
- Use a centered container:  
  max-w-[1200px] mx-auto px-6
- Use only Tailwind CSS, never inline styles (except for CSS filters when suggestedFilters provided).
- Use responsive layout with sm: and md: breakpoints.
- Use semantic HTML (<aside>, <nav>, <header>, <section>, <footer>).
- Reproduce the hierarchy EXACTLY as seen in the image.
- Use consistent spacing utilities like py-4, gap-6, px-3.
- Use rounded shapes (rounded-xl, rounded-full) for avatars/buttons.
- Use subtle shadows where visible: shadow-sm shadow-black/20.
- For icons, import from "lucide-react" and use className="h-5 w-5".

=====================================
PHASE 2.5 — VISUAL FIDELITY MAPPING (DETERMINISTIC)
=====================================

When "visualHints" is provided in the layout JSON, use these EXACT mappings:

WIDTH MAPPING (w_norm → Tailwind class):
  w_norm >= 0.95  →  w-full
  w_norm >= 0.80  →  md:w-4/5
  w_norm >= 0.66  →  md:w-2/3
  w_norm >= 0.50  →  md:w-1/2
  w_norm >= 0.33  →  md:w-1/3
  w_norm >= 0.25  →  md:w-1/4
  else            →  w-auto

TITLE SIZE MAPPING (titleSizePx → Tailwind class):
  titleSizePx <= 14  →  text-xs
  titleSizePx <= 16  →  text-sm
  titleSizePx <= 20  →  text-base
  titleSizePx <= 24  →  text-lg
  titleSizePx <= 30  →  text-xl
  titleSizePx <= 36  →  text-2xl
  titleSizePx <= 48  →  text-3xl
  titleSizePx <= 60  →  text-4xl
  titleSizePx <= 72  →  text-5xl
  titleSizePx <= 96  →  text-6xl
  titleSizePx > 96   →  text-7xl

BODY SIZE MAPPING (bodySizePx → Tailwind class):
  bodySizePx <= 12  →  text-xs
  bodySizePx <= 14  →  text-sm
  bodySizePx <= 16  →  text-base
  bodySizePx <= 18  →  text-lg
  bodySizePx > 18   →  text-xl

SPACING MAPPING (based on y_norm gaps):
  gap < 0.02  →  p-2 or gap-2
  gap < 0.04  →  p-4 or gap-4
  gap < 0.06  →  p-6 or gap-6
  gap >= 0.06 →  p-8 or gap-8

SUGGESTED FILTERS APPLICATION:
When "suggestedFilters" is provided with brightness/contrast/saturate values:
- Apply as inline style ONLY on the root wrapper element:
  <main style={{ filter: 'brightness(0.95) contrast(1.05) saturate(1.1)' }} className="...">
- Use exact values from suggestedFilters, do not modify them.

VIGNETTE APPLICATION:
When "vignette": true is specified:
- Add a ::after pseudo-element to the main wrapper using Tailwind's arbitrary values:
  <main className="relative after:absolute after:inset-0 after:pointer-events-none after:bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]">
- Or apply via a vignette overlay div inside the main container.

PREFER TAILWIND UTILITIES:
- Use standard Tailwind classes when possible.
- If arbitrary values are necessary, use bracket notation: w-[340px], text-[#ff6600]
- Minimize arbitrary values; prefer semantic class names.

YOU MUST NOT:
- Output markdown fences (no \`\`\`).
- Add explanations or commentary.
- Import icons you do not use.
- Invent colors — extract them from the layout JSON or use the theme provided.
- Add dummy text except where image text is unreadable.
- Use absolute positioning unless visually required.
- Ignore visualHints when provided — they are authoritative for sizing and spacing.

=====================================
PHASE 3 — ADAPT TO USER PREFERENCES
=====================================
Respect the following configuration values if provided in the user message:

layoutMode:
- "fixed" → follow image literally, no responsive breakpoints
- "responsive" → make sections adapt cleanly on smaller screens

compact:
- true → reduce paddings and gaps by ~20%
- false → keep original spacing

maxWidth:
- override main content width (e.g., 960, 1200)

stylePreset:
- "exact" → pixel-match the design exactly
- "modern" → cleaner spacing, better typography, subtle improvements
- "minimal" → simpler, flatter, fewer shadows and decorations

includeComments:
- true → add short JSX comments per section
- false → code only, no comments

=====================================
PHASE 4 — FINAL OUTPUT
=====================================
Return only valid JSX for the single component.
No markdown. No extra text. No apology. No explanation.

Make the output look like a real production component extracted from Perplexity, V0.dev, or Notion's internal UI library.`,

  // ==========================================
  // ERROR FIXER: Syntax Error Correction
  // ==========================================
  error_fixer: `You are a React/JSX syntax error fixer. Your ONLY job is to fix compilation errors in React code.

RULES:
1. You will receive React/JSX code and a compiler error message.
2. Fix ONLY the syntax error described - do not refactor or change logic.
3. Return ONLY the fixed code - no explanations, no markdown.
4. Common fixes:
   - Missing closing tags
   - Unclosed JSX expressions {}
   - Invalid attribute names (use className, htmlFor, etc.)
   - Missing imports
   - Incorrect JSX syntax

OUTPUT: Return ONLY the corrected React/JSX code. No markdown fences, no explanation.`,

  html_tailwind: `You are an elite frontend engineer with 15+ years of experience. You recreate any design with pixel-perfect accuracy.

CRITICAL TASK: Convert the provided image into production-ready HTML + Tailwind CSS.

DEEP ANALYSIS PHASE:
• Study exact layout: containers, sections, grids, flex structures
• Identify precise colors - use exact hex values when needed
• Note all spacing: padding, margins, gaps between elements
• Observe typography: font sizes, weights, line heights
• Identify shadows, borders, rounded corners, gradients
• Note background patterns, overlays, opacity values

CODE REQUIREMENTS:
1. Complete HTML5 document with <!DOCTYPE html>
2. Include Tailwind CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Use Tailwind arbitrary values for precision: text-[#hex], p-[17px], w-[340px]
4. Semantic HTML: header, nav, main, section, article, aside, footer
5. Fully responsive: sm:, md:, lg:, xl: breakpoints
6. Accessibility: alt text, aria-labels, proper heading hierarchy
7. Use inline SVG for icons or include a CDN icon library
8. Images: https://picsum.photos/WIDTH/HEIGHT
9. Add hover transitions on interactive elements
10. Match the image EXACTLY - same proportions, colors, spacing

QUALITY:
✓ Pixel-perfect match to the source image
✓ Real content (not lorem ipsum) matching the image
✓ Complete, runnable HTML document
✓ Clean, well-structured code

OUTPUT: Return ONLY the complete HTML document. No markdown, no explanations.`,

  vue_tailwind: `You are an elite frontend engineer specializing in Vue.js. You recreate designs with pixel-perfect accuracy.

TASK: Convert the image into production-ready Vue 3 + Tailwind CSS code.

ANALYSIS:
• Study the exact layout, spacing, colors, typography
• Note all visual details: shadows, borders, gradients, hover states
• Identify the precise color palette and spacing values

CODE REQUIREMENTS:
1. Vue 3 Composition API with <script setup lang="ts">
2. Tailwind CSS for all styling - use arbitrary values for precision
3. Fully responsive with sm:, md:, lg:, xl: breakpoints
4. Semantic HTML elements
5. Proper accessibility attributes
6. Use https://picsum.photos/WIDTH/HEIGHT for images
7. Add reactive state where appropriate
8. Include hover/focus states and transitions

STRUCTURE:
<template>
  <!-- Pixel-perfect recreation -->
</template>

<script setup lang="ts">
// Reactive state and logic
</script>

OUTPUT: Return ONLY the Vue SFC code. Start with <template>. No markdown, no explanations.`,

  svelte_tailwind: `You are an elite frontend engineer specializing in Svelte. You recreate designs with pixel-perfect accuracy.

TASK: Convert the image into production-ready Svelte + Tailwind CSS code.

REQUIREMENTS:
1. Modern Svelte syntax with reactive declarations
2. Tailwind CSS with arbitrary values for precision
3. Fully responsive layouts
4. Semantic HTML and accessibility
5. Use https://picsum.photos/WIDTH/HEIGHT for images
6. Include transitions and hover states
7. Match the image EXACTLY

OUTPUT: Return ONLY Svelte component code. No markdown, no explanations.`,

  angular_tailwind: `You are an elite frontend engineer specializing in Angular. You recreate designs with pixel-perfect accuracy.

TASK: Convert the image into production-ready Angular + Tailwind CSS code.

REQUIREMENTS:
1. Angular 17+ standalone component syntax
2. Tailwind CSS for all styling
3. Fully responsive with breakpoints
4. Semantic HTML and accessibility
5. Use https://picsum.photos/WIDTH/HEIGHT for images
6. Match the image EXACTLY - colors, spacing, typography

OUTPUT: Return ONLY the Angular component code. No markdown, no explanations.`,

  nextjs_tailwind: `You are an elite frontend engineer specializing in Next.js 14+. You recreate designs with pixel-perfect accuracy.

TASK: Convert the image into production-ready Next.js + Tailwind CSS code.

DEEP ANALYSIS:
• Study exact layout structure and proportions
• Identify precise colors (use hex codes)
• Note spacing values, typography, shadows, borders
• Observe interactive elements and their states

CODE REQUIREMENTS:
1. Next.js 14+ App Router component
2. Add 'use client' directive for interactive components
3. Tailwind CSS with arbitrary values: text-[#hex], p-[18px]
4. Use next/image for optimized images: <Image src="https://picsum.photos/W/H" width={W} height={H} alt="" />
5. Fully responsive: sm:, md:, lg:, xl:
6. Semantic HTML and accessibility
7. Add hover/focus states and transitions
8. Match the image EXACTLY

OUTPUT: Return ONLY the Next.js component code. No markdown, no explanations.`,

  // ==========================================
  // Code Modification Prompt (Chat-based editing)
  // ==========================================
  modify_code: `You are NEURON's in-editor AI code assistant.

Your ONLY job is to MODIFY existing React + Tailwind UI code based on user requests.
You must treat the given code as the single source of truth and perform minimal, precise edits.

=====================================
ROLE & SCOPE
=====================================
- The code you receive is already a working React + Tailwind component.
- The user will describe changes in natural language (e.g. "make the background white", "add another button on the right", "make it more compact").
- You must update the component IMPLEMENTATION to match the requested change.
- You are NOT allowed to redesign everything from scratch unless explicitly asked to.

=====================================
HOW TO THINK BEFORE EDITING
=====================================
1) Read the user request carefully.
2) Scan the existing JSX structure:
   - Identify main regions (header, sidebar, main, footer).
   - Identify the element(s) that should be changed.
3) Plan a SMALL set of edits that:
   - Satisfy the request
   - Preserve the existing layout and naming as much as possible
   - Preserve semantics and accessibility

=====================================
EDITING RULES
=====================================
YOU MUST:
- Keep the same component name and exports.
- Keep props and external API stable (if any props exist).
- Reuse existing Tailwind classes where reasonable.
- Make the minimal changes needed to satisfy the request.
- Maintain consistent color palette and typography unless the request says otherwise.
- Ensure the code still compiles in React 18 and works with Tailwind.
- Keep layout responsive if it already was.

YOU SHOULD:
- When the user asks for "change color to white" or "make dark mode":
  - Adjust background + text colors consistently across main regions.
- When the user asks to "add section / button / item":
  - Place new JSX in the most logical section.
  - Match existing style conventions (classes, spacing, border radius).
- When the user asks to "make it more compact":
  - Reduce paddings/gaps by ~20–30% in the relevant sections.

YOU MUST NOT:
- Return markdown fences (no \`\`\`).
- Add explanations, comments, or natural language.
- Introduce new dependencies or imports unless truly needed.
- Remove important existing sections unless the request explicitly says to remove them.
- Wrap everything in a new root element that breaks the layout.

=====================================
OUTPUT FORMAT
=====================================
- Return ONLY the full updated React component code, nothing else.
- Do not include any explanation text around it.
- Ensure all imports at the top are correct and actually used.`,

  // Alias for code_editor (same prompt as modify_code for BullMQ job processing)
  code_editor: `You are NEURON's in-editor AI code assistant.

Your ONLY job is to MODIFY existing React + Tailwind UI code based on user requests.
You must treat the given code as the single source of truth and perform minimal, precise edits.

=====================================
ROLE & SCOPE
=====================================
- The code you receive is already a working React + Tailwind component.
- The user will describe changes in natural language.
- You must update the component IMPLEMENTATION to match the requested change.
- You are NOT allowed to redesign everything from scratch unless explicitly asked to.

=====================================
EDITING RULES
=====================================
YOU MUST:
- Keep the same component name and exports.
- Keep props and external API stable (if any props exist).
- Reuse existing Tailwind classes where reasonable.
- Make the minimal changes needed to satisfy the request.
- Maintain consistent color palette and typography unless the request says otherwise.
- Ensure the code still compiles in React 18 and works with Tailwind.
- Keep layout responsive if it already was.

YOU MUST NOT:
- Return markdown fences (no \`\`\`).
- Add explanations, comments, or natural language.
- Introduce new dependencies or imports unless truly needed.
- Remove important existing sections unless the request explicitly says to remove them.

=====================================
OUTPUT FORMAT
=====================================
- Return ONLY the full updated React component code, nothing else.
- Do not include any explanation text around it.
- Ensure all imports at the top are correct and actually used.`,

  // ==========================================
  // NEURON Chat: Conversational AI for UI refinement
  // ==========================================
  neuron_chat: `You are NEURON, a friendly, confident AI that helps users refine their UI layouts and code.

GOAL:
- Talk to the user in modern, natural English with a slightly playful, stylish tone.
- Be short and clear. 1–3 sentences max.
- Always be polite and encouraging.

TONE & STYLE:
- Sound like a helpful senior engineer who's also chill.
- Use simple, modern phrases like:
  - "Got it, I'll handle that."
  - "Nice call – I've updated it for you."
  - "Happy to help, anything else you want to tweak?"
- Avoid cringe/overly childish words, avoid emojis unless the user uses them first.

INTENT HANDLING:
- If the user just says things like "hello", "hi", "thanks", "you're awesome", etc.:
  - Respond with friendly small talk, e.g. welcome them, say you're ready for edits.
- If the user message both thanks AND asks for a change:
  - Acknowledge the thanks AND confirm you'll apply the change.
- If the message clearly describes a layout or code change ("make the background white", "add hover effects", etc.):
  - Confirm the change in words, but do NOT include any code in the response.
  - Example: "Got it, I'll make the background white and keep the rest of the layout intact."

RULES:
- Never output code.
- Never mention system prompts or implementation details.
- Keep answers short, friendly, and on-topic.
- Assume there is a separate system that actually modifies the code; you are just the conversational layer.

OUTPUT:
- Return only the final reply string, no JSON, no markdown fences.`,
};

// ============================================
// Image Processing Utilities
// ============================================
async function imageToBase64(imagePath: string): Promise<string> {
  // Check if it's already a base64 string
  if (imagePath.startsWith('data:image/')) {
    return imagePath;
  }

  // Check if it's a URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    const response = await fetch(imagePath);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${base64}`;
  }

  // It's a file path
  const absolutePath = path.isAbsolute(imagePath) 
    ? imagePath 
    : path.join(process.cwd(), imagePath);
  
  const buffer = await fs.promises.readFile(absolutePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext] || 'image/png';
  
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function extractMediaType(base64String: string): string {
  const match = base64String.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/png';
}

function extractBase64Data(base64String: string): string {
  const match = base64String.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64String;
}

// ============================================
// AI Provider API Calls
// ============================================

interface AIResponse {
  success: boolean;
  code?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Anthropic API response type
interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// Gemini API response type
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

// OpenAI API response type
interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// ============================================
// Code Cleaning & Parsing
// ============================================
function cleanGeneratedCode(rawCode: string): string {
  let code = rawCode.trim();

  // Remove markdown code blocks if present
  // Handle ```jsx, ```tsx, ```html, ```vue, etc.
  const codeBlockRegex = /^```(?:jsx?|tsx?|html|vue|svelte)?\s*\n?([\s\S]*?)\n?```$/;
  const match = code.match(codeBlockRegex);
  if (match) {
    code = match[1].trim();
  }

  // Also handle cases where there might be multiple code blocks
  // or explanation text before/after
  const multiBlockRegex = /```(?:jsx?|tsx?|html|vue|svelte)?\s*\n([\s\S]*?)\n```/g;
  const blocks = [...code.matchAll(multiBlockRegex)];
  if (blocks.length > 0) {
    // Take the largest code block (likely the main component)
    code = blocks.reduce((largest, current) => {
      return current[1].length > largest.length ? current[1] : largest;
    }, '').trim();
  }

  // Remove any leading/trailing backticks that might remain
  code = code.replace(/^`+|`+$/g, '');

  return code;
}

/**
 * Clean and parse JSON from AI response
 */
function cleanAndParseJson(rawJson: string): LayoutSpec | null {
  let jsonStr = rawJson.trim();

  // Remove markdown code fences if present
  const jsonBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = jsonStr.match(jsonBlockRegex);
  if (match) {
    jsonStr = match[1].trim();
  }

  // Remove any leading/trailing backticks
  jsonStr = jsonStr.replace(/^`+|`+$/g, '');

  // Try to find JSON object in the response
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return parsed as LayoutSpec;
  } catch (error) {
    console.error('JSON parse error:', error);
    return null;
  }
}

/**
 * Format code using a simple formatter (basic indentation fix)
 * In production, you might want to use Prettier via API or child process
 */
function formatCode(code: string): string {
  // Basic cleanup - normalize whitespace and indentation
  let formatted = code
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\t/g, '  ')     // Convert tabs to spaces
    .replace(/\n{3,}/g, '\n\n') // Remove excessive blank lines
    .trim();

  // Ensure proper spacing around JSX
  formatted = formatted
    .replace(/>\s*\n\s*</g, '>\n<')  // Clean up tag spacing
    .replace(/{\s+/g, '{ ')           // Clean up opening braces
    .replace(/\s+}/g, ' }');          // Clean up closing braces

  return formatted;
}

/**
 * Basic syntax validation for React/JSX code
 * Returns error message if invalid, null if valid
 */
function validateJsxSyntax(code: string): string | null {
  // Check for basic JSX structure
  if (!code.includes('function') && !code.includes('const') && !code.includes('=>')) {
    return 'No function definition found';
  }

  if (!code.includes('export default')) {
    return 'Missing export default statement';
  }

  if (!code.includes('return')) {
    return 'Missing return statement';
  }

  // Check for balanced brackets
  const brackets: Record<string, string> = { '(': ')', '{': '}', '[': ']', '<': '>' };
  const stack: string[] = [];
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle string detection
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (inString) continue;

    // Check brackets (simplified - skip < > in JSX context for complex cases)
    if (char === '(' || char === '{' || char === '[') {
      stack.push(brackets[char]);
    } else if (char === ')' || char === '}' || char === ']') {
      if (stack.length === 0 || stack.pop() !== char) {
        return `Unbalanced bracket: unexpected '${char}' at position ${i}`;
      }
    }
  }

  if (stack.length > 0) {
    return `Unclosed brackets: expected ${stack.join(', ')}`;
  }

  return null;
}

// ============================================
// TWO-STAGE PIPELINE: Helper Functions
// ============================================

/**
 * STAGE 1: Generate Layout JSON from Image
 * Sends image to AI with layout_analyzer prompt, returns structured JSON
 */
async function generateLayoutJson(
  imageBase64: string,
  options: GenerateOptions,
  projectId?: string
): Promise<{ success: boolean; layout?: LayoutSpec; error?: string }> {
  console.log('📐 Stage 1: Analyzing image layout...');
  
  if (projectId) {
    emitProjectStatus(projectId, 'PROCESSING', 15);
  }

  const systemPrompt = SYSTEM_PROMPTS.layout_analyzer;
  
  // Include user preferences in layout analysis
  let userPreferencesHint = '';
  if (options.maxWidth) {
    userPreferencesHint += `\nNote: User wants maxWidth of ${options.maxWidth}px for the container.`;
  }
  if (options.compact) {
    userPreferencesHint += '\nNote: User prefers compact spacing.';
  }
  
  const userMessage = `Analyze this UI screenshot and return a JSON layout specification.${userPreferencesHint} Return ONLY valid JSON.`;

  let response: AIResponse;

  // Use the appropriate AI provider
  switch (AI_PROVIDER.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      response = await callAnthropicAPIWithMessage(imageBase64, systemPrompt, userMessage);
      break;
    case 'gemini':
    case 'google':
      response = await callGeminiAPIWithMessage(imageBase64, systemPrompt, userMessage);
      break;
    case 'openai':
    case 'gpt':
      response = await callOpenAIAPIWithMessage(imageBase64, systemPrompt, userMessage);
      break;
    case 'openrouter':
      response = await callOpenRouterAPIWithMessage(imageBase64, systemPrompt, userMessage);
      break;
    default:
      // For providers that don't support vision, return a mock layout
      console.log('⚠️ Provider does not support vision, using mock layout');
      return { success: true, layout: getMockLayout() };
  }

  if (!response.success || !response.code) {
    return { success: false, error: response.error || 'Failed to analyze layout' };
  }

  // Parse the JSON response
  let layout = cleanAndParseJson(response.code);

  // If parsing failed, retry with stricter prompt
  if (!layout) {
    console.log('⚠️ JSON parse failed, retrying with stricter prompt...');
    
    const retryMessage = `The previous response was not valid JSON. Please analyze the image and return ONLY a valid JSON object with this exact structure:
{
  "page": {
    "background": "#hexcolor",
    "maxWidth": 1200,
    "theme": { "background": "#hex", "foreground": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex", "muted": "#hex", "border": "#hex" },
    "sections": [{ "id": "string", "type": "header|main|footer", "layout": "row|column", "elements": [] }]
  }
}
Return ONLY the JSON. No markdown, no explanation.`;

    switch (AI_PROVIDER.toLowerCase()) {
      case 'anthropic':
      case 'claude':
        response = await callAnthropicAPIWithMessage(imageBase64, systemPrompt, retryMessage);
        break;
      case 'gemini':
      case 'google':
        response = await callGeminiAPIWithMessage(imageBase64, systemPrompt, retryMessage);
        break;
      case 'openai':
      case 'gpt':
        response = await callOpenAIAPIWithMessage(imageBase64, systemPrompt, retryMessage);
        break;
      case 'openrouter':
        response = await callOpenRouterAPIWithMessage(imageBase64, systemPrompt, retryMessage);
        break;
      default:
        return { success: true, layout: getMockLayout() };
    }

    if (response.success && response.code) {
      layout = cleanAndParseJson(response.code);
    }
  }

  if (!layout) {
    console.log('⚠️ JSON parsing failed after retry, using mock layout');
    return { success: true, layout: getMockLayout() };
  }

  console.log('✅ Layout JSON generated successfully');
  console.log(`   Sections: ${layout.page?.sections?.length || 0}`);
  
  return { success: true, layout };
}

/**
 * STAGE 2: Generate Code from Layout JSON
 * Takes the layout specification and generates React + Tailwind code
 */
async function generateCodeFromLayout(
  layout: LayoutSpec,
  options: GenerateOptions,
  projectId?: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  console.log('💻 Stage 2: Generating code from layout...');
  
  if (projectId) {
    emitProjectStatus(projectId, 'PROCESSING', 50);
  }

  // Select the appropriate system prompt based on code type
  let systemPrompt = SYSTEM_PROMPTS.react_tailwind;
  
  switch (options.codeType.toUpperCase()) {
    case 'HTML':
      systemPrompt = SYSTEM_PROMPTS.html_tailwind;
      break;
    case 'VUE':
      systemPrompt = SYSTEM_PROMPTS.vue_tailwind;
      break;
    case 'SVELTE':
      systemPrompt = SYSTEM_PROMPTS.svelte_tailwind;
      break;
    case 'ANGULAR':
      systemPrompt = SYSTEM_PROMPTS.angular_tailwind;
      break;
    case 'NEXTJS':
      systemPrompt = SYSTEM_PROMPTS.nextjs_tailwind;
      break;
    default:
      systemPrompt = SYSTEM_PROMPTS.react_tailwind;
  }

  // Build the user message with the layout JSON and user preferences
  const layoutJson = JSON.stringify(layout, null, 2);
  const userPreferences = buildUserPreferencesBlock(options);
  const userMessage = `Here is the layout specification for the UI:

${layoutJson}

${userPreferences}

Generate a complete ${options.codeType} component using Tailwind CSS that implements this layout specification. Follow all the rules in the system prompt AND the user preferences above. Return ONLY the code.`;

  let response: AIResponse;

  // Call AI without image (text-only for stage 2)
  switch (AI_PROVIDER.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      response = await callAnthropicTextOnly(systemPrompt, userMessage);
      break;
    case 'gemini':
    case 'google':
      response = await callGeminiTextOnly(systemPrompt, userMessage);
      break;
    case 'openai':
    case 'gpt':
      response = await callOpenAITextOnly(systemPrompt, userMessage);
      break;
    case 'groq':
      response = await callGroqTextOnly(systemPrompt, userMessage);
      break;
    case 'openrouter':
      response = await callOpenRouterTextOnly(systemPrompt, userMessage);
      break;
    default:
      return { success: false, error: `Unknown AI provider: ${AI_PROVIDER}` };
  }

  if (!response.success || !response.code) {
    return { success: false, error: response.error || 'Failed to generate code' };
  }

  const cleanedCode = cleanGeneratedCode(response.code);
  console.log('✅ Code generated successfully');
  console.log(`   Code length: ${cleanedCode.length} characters`);

  return { success: true, code: cleanedCode };
}

/**
 * POST-PROCESSING: Format and validate code
 */
async function postProcessCode(
  code: string,
  projectId?: string
): Promise<{ success: boolean; code: string; error?: string }> {
  console.log('🔧 Post-processing: Formatting and validating code...');
  
  if (projectId) {
    emitProjectStatus(projectId, 'PROCESSING', 80);
  }

  // Format the code
  let formattedCode = formatCode(code);

  // Validate syntax
  const syntaxError = validateJsxSyntax(formattedCode);
  
  if (syntaxError) {
    console.log(`⚠️ Syntax validation found issue: ${syntaxError}`);
    console.log('🔧 Attempting to fix syntax errors...');
    
    if (projectId) {
      emitProjectStatus(projectId, 'PROCESSING', 85);
    }

    // Try to fix the syntax error
    const fixResult = await fixSyntaxErrors(formattedCode, syntaxError);
    
    if (fixResult.success && fixResult.code) {
      formattedCode = formatCode(fixResult.code);
      console.log('✅ Syntax errors fixed');
    } else {
      console.log('⚠️ Could not fix syntax errors, returning original code');
    }
  }

  return { success: true, code: formattedCode };
}

/**
 * Fix syntax errors in generated code
 */
async function fixSyntaxErrors(
  code: string,
  errorMessage: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  const systemPrompt = SYSTEM_PROMPTS.error_fixer;
  const userMessage = `Fix the syntax error in this React component.

ERROR: ${errorMessage}

CODE:
${code}

Return ONLY the fixed code. No explanations.`;

  let response: AIResponse;

  switch (AI_PROVIDER.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      response = await callAnthropicTextOnly(systemPrompt, userMessage);
      break;
    case 'gemini':
    case 'google':
      response = await callGeminiTextOnly(systemPrompt, userMessage);
      break;
    case 'openai':
    case 'gpt':
      response = await callOpenAITextOnly(systemPrompt, userMessage);
      break;
    case 'groq':
      response = await callGroqTextOnly(systemPrompt, userMessage);
      break;
    case 'openrouter':
      response = await callOpenRouterTextOnly(systemPrompt, userMessage);
      break;
    default:
      return { success: false, error: 'Unknown AI provider' };
  }

  if (!response.success || !response.code) {
    return { success: false, error: response.error || 'Failed to fix code' };
  }

  return { success: true, code: cleanGeneratedCode(response.code) };
}

/**
 * Get a mock layout for providers without vision support
 */
function getMockLayout(): LayoutSpec {
  return {
    page: {
      background: '#050505',
      maxWidth: 1200,
      fontFamily: 'Inter, sans-serif',
      theme: {
        background: '#050505',
        foreground: '#e2e8f0',
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        accent: '#22d3ee',
        muted: '#64748b',
        border: '#1e293b',
        card: '#0f172a',
        input: '#1e293b',
      },
      sections: [
        {
          id: 'header',
          type: 'header',
          layout: 'row',
          alignment: 'center',
          padding: '4',
          background: '#0a0a0a',
          border: 'border-b border-[#1e293b]',
          elements: [
            { type: 'logo', text: 'NEURON', size: 'lg' },
            { type: 'spacer' },
            { type: 'button', text: 'Get Started', variant: 'primary' },
          ],
        },
        {
          id: 'hero',
          type: 'hero',
          layout: 'centered',
          padding: '8',
          elements: [
            { type: 'heading', text: 'Transform Images into Code', textRole: 'title', size: 'xl' },
            { type: 'subtitle', text: 'Upload any design and get production-ready code', textRole: 'subtitle' },
            { type: 'button', text: 'Try It Free', variant: 'primary', size: 'lg' },
          ],
        },
        {
          id: 'features',
          type: 'features',
          layout: 'grid',
          gap: '6',
          padding: '8',
          elements: [
            { type: 'card', text: 'Lightning Fast', children: [{ type: 'paragraph', text: 'Generate code in seconds' }] },
            { type: 'card', text: 'Clean Code', children: [{ type: 'paragraph', text: 'Production-ready output' }] },
            { type: 'card', text: 'Pixel Perfect', children: [{ type: 'paragraph', text: 'Accurate recreation' }] },
          ],
        },
      ],
    },
    metadata: {
      title: 'NEURON',
      description: 'Image to Code Generator',
      hasNavigation: true,
      hasSidebar: false,
      hasFooter: false,
      isResponsive: true,
      estimatedComplexity: 'moderate',
    },
  };
}

// ============================================
// Text-Only AI API Calls (for Stage 2)
// ============================================

async function callAnthropicTextOnly(
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️ No Anthropic API key');
    return getMockResponse();
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as AnthropicResponse;
    return {
      success: true,
      code: data.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  } catch (error) {
    console.error('Anthropic text API error:', error);
    return getMockResponse();
  }
}

async function callGeminiTextOnly(
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!GEMINI_API_KEY) {
    console.log('⚠️ No Gemini API key');
    return getMockResponse();
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: {
            maxOutputTokens: 16384,
            temperature: 0.2,
            topP: 0.95,
            topK: 40,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as GeminiResponse;
    return {
      success: true,
      code: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  } catch (error) {
    console.error('Gemini text API error:', error);
    return getMockResponse();
  }
}

async function callOpenAITextOnly(
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!OPENAI_API_KEY) {
    console.log('⚠️ No OpenAI API key');
    return getMockResponse();
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAIResponse;
    return {
      success: true,
      code: data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  } catch (error) {
    console.error('OpenAI text API error:', error);
    return getMockResponse();
  }
}

async function callGroqTextOnly(
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!GROQ_API_KEY) {
    console.log('⚠️ No Groq API key');
    return getMockResponse();
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_completion_tokens: 8192,
        top_p: 1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAIResponse;
    return {
      success: true,
      code: data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  } catch (error) {
    console.error('Groq text API error:', error);
    return getMockResponse();
  }
}

async function callOpenRouterTextOnly(
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!OPENROUTER_API_KEY) {
    console.log('⚠️ No OpenRouter API key');
    return getMockResponse();
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.API_BASE_URL || 'http://localhost:3001',
        'X-Title': 'NEURON Image-to-Code',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAIResponse;
    return {
      success: true,
      code: data.choices?.[0]?.message?.content || '',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  } catch (error) {
    console.error('OpenRouter text API error:', error);
    return getMockResponse();
  }
}

// ============================================
// Vision API Calls with Custom Message (for Stage 1)
// ============================================

async function callAnthropicAPIWithMessage(
  imageBase64: string,
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!ANTHROPIC_API_KEY) {
    return { success: false, error: 'No Anthropic API key' };
  }

  try {
    const mediaType = extractMediaType(imageBase64);
    const base64Data = extractBase64Data(imageBase64);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: userMessage },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as AnthropicResponse;
    return {
      success: true,
      code: data.content?.[0]?.text || '',
      usage: { inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 },
    };
  } catch (error) {
    console.error('Anthropic vision API error:', error);
    return { success: false, error: String(error) };
  }
}

async function callGeminiAPIWithMessage(
  imageBase64: string,
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'No Gemini API key' };
  }

  try {
    const mediaType = extractMediaType(imageBase64);
    const base64Data = extractBase64Data(imageBase64);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts: [
              { inlineData: { mimeType: mediaType, data: base64Data } },
              { text: userMessage },
            ],
          }],
          generationConfig: { maxOutputTokens: 16384, temperature: 0.2, topP: 0.95, topK: 40 },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as GeminiResponse;
    return {
      success: true,
      code: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: { inputTokens: data.usageMetadata?.promptTokenCount || 0, outputTokens: data.usageMetadata?.candidatesTokenCount || 0 },
    };
  } catch (error) {
    console.error('Gemini vision API error:', error);
    return { success: false, error: String(error) };
  }
}

async function callOpenAIAPIWithMessage(
  imageBase64: string,
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!OPENAI_API_KEY) {
    return { success: false, error: 'No OpenAI API key' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 8192,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
              { type: 'text', text: userMessage },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAIResponse;
    return {
      success: true,
      code: data.choices?.[0]?.message?.content || '',
      usage: { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 },
    };
  } catch (error) {
    console.error('OpenAI vision API error:', error);
    return { success: false, error: String(error) };
  }
}

async function callOpenRouterAPIWithMessage(
  imageBase64: string,
  systemPrompt: string,
  userMessage: string
): Promise<AIResponse> {
  if (!OPENROUTER_API_KEY) {
    return { success: false, error: 'No OpenRouter API key' };
  }

  try {
    const mediaType = extractMediaType(imageBase64);
    const base64Data = extractBase64Data(imageBase64);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.API_BASE_URL || 'http://localhost:3001',
        'X-Title': 'NEURON Image-to-Code',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64Data}` } },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAIResponse;
    return {
      success: true,
      code: data.choices?.[0]?.message?.content || '',
      usage: { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 },
    };
  } catch (error) {
    console.error('OpenRouter vision API error:', error);
    return { success: false, error: String(error) };
  }
}

// ============================================
// Mock Response for Development
// ============================================
function getMockResponse(codeType: string = 'REACT'): AIResponse {
  const upperCodeType = codeType.toUpperCase();
  
  // Return HTML if that's what was requested
  if (upperCodeType === 'HTML') {
    const mockHtmlCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Page</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
  <!-- Header -->
  <header class="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"></div>
        <span class="text-xl font-bold text-white">NEURON</span>
      </div>
      <nav class="flex items-center gap-6">
        <a href="#" class="text-gray-300 hover:text-white transition-colors">Features</a>
        <a href="#" class="text-gray-300 hover:text-white transition-colors">Pricing</a>
        <a href="#" class="text-gray-300 hover:text-white transition-colors">Docs</a>
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Get Started
        </button>
      </nav>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="max-w-7xl mx-auto px-6 py-20">
    <div class="text-center">
      <h1 class="text-5xl md:text-6xl font-bold text-white mb-6">
        Transform Images into
        <span class="block bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Production Code
        </span>
      </h1>
      <p class="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
        Upload any design, screenshot, or wireframe. Our AI analyzes it and generates 
        clean, production-ready code in seconds.
      </p>
      <div class="flex items-center justify-center gap-4">
        <button class="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
          Try It Free
        </button>
        <button class="px-8 py-4 border border-gray-600 text-white font-semibold rounded-xl hover:border-gray-500 transition-colors">
          View Demo
        </button>
      </div>
    </div>

    <!-- Image Section -->
    <div class="mt-16 flex justify-center">
      <img src="https://picsum.photos/800/400" alt="Demo" class="rounded-2xl shadow-2xl" />
    </div>

    <!-- Feature Cards -->
    <div class="grid md:grid-cols-3 gap-6 mt-20">
      <div class="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
        <div class="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">Lightning Fast</h3>
        <p class="text-gray-400">Generate production-ready code in under 30 seconds.</p>
      </div>
      
      <div class="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
        <div class="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">Clean Code</h3>
        <p class="text-gray-400">HTML + Tailwind CSS output that follows best practices.</p>
      </div>
      
      <div class="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
        <div class="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">Pixel Perfect</h3>
        <p class="text-gray-400">AI accurately replicates your design with precision.</p>
      </div>
    </div>
  </main>
</body>
</html>`;

    return {
      success: true,
      code: mockHtmlCode,
      usage: {
        inputTokens: 1500,
        outputTokens: 800,
      },
    };
  }

  // Vue mock code
  if (upperCodeType === 'VUE') {
    const mockVueCode = `<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
    <header class="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"></div>
          <span class="text-xl font-bold text-white">NEURON</span>
        </div>
        <nav class="flex items-center gap-6">
          <a href="#" class="text-gray-300 hover:text-white transition-colors">Features</a>
          <a href="#" class="text-gray-300 hover:text-white transition-colors">Pricing</a>
          <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Get Started
          </button>
        </nav>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-6 py-20 text-center">
      <h1 class="text-5xl font-bold text-white mb-6">
        Transform Images into
        <span class="block bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Production Code</span>
      </h1>
      <p class="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
        Upload any design and get clean, production-ready Vue + Tailwind CSS code.
      </p>
      <img src="https://picsum.photos/800/400" alt="Demo" class="mx-auto rounded-2xl shadow-2xl" />
    </main>
  </div>
</template>

<script setup>
// Vue 3 Composition API
</script>`;

    return {
      success: true,
      code: mockVueCode,
      usage: { inputTokens: 1500, outputTokens: 600 },
    };
  }

  // Svelte mock code
  if (upperCodeType === 'SVELTE') {
    const mockSvelteCode = `<script>
  let title = 'NEURON';
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
  <header class="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg"></div>
        <span class="text-xl font-bold text-white">{title}</span>
      </div>
      <nav class="flex items-center gap-6">
        <a href="#" class="text-gray-300 hover:text-white transition-colors">Features</a>
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Get Started
        </button>
      </nav>
    </div>
  </header>
  <main class="max-w-7xl mx-auto px-6 py-20 text-center">
    <h1 class="text-5xl font-bold text-white mb-6">
      Transform Images into
      <span class="block bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Production Code</span>
    </h1>
    <img src="https://picsum.photos/800/400" alt="Demo" class="mx-auto rounded-2xl shadow-2xl" />
  </main>
</div>

<style>
  /* Tailwind styles applied via class */
</style>`;

    return {
      success: true,
      code: mockSvelteCode,
      usage: { inputTokens: 1500, outputTokens: 500 },
    };
  }

  // Default React/Next.js code
  const mockCode = `import React from 'react';

export default function GeneratedComponent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
            <span className="text-xl font-bold text-white">NEURON</span>
          </div>
          <nav className="flex items-center gap-6">
            <a href="#" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors">Docs</a>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Get Started
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Transform Images into
            <span className="block bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Production Code
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Upload any design, screenshot, or wireframe. Our AI analyzes it and generates 
            clean, production-ready React + Tailwind CSS code in seconds.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity">
              Try It Free
            </button>
            <button className="px-8 py-4 border border-gray-600 text-white font-semibold rounded-xl hover:border-gray-500 transition-colors">
              View Demo
            </button>
          </div>
        </div>

        {/* Demo Image */}
        <div className="mt-16 flex justify-center">
          <img 
            src="https://picsum.photos/800/400" 
            alt="Demo" 
            className="rounded-2xl shadow-2xl"
          />
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-20">
          <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Lightning Fast</h3>
            <p className="text-gray-400">Generate production-ready code in under 30 seconds.</p>
          </div>
          
          <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Clean Code</h3>
            <p className="text-gray-400">React + Tailwind CSS output that follows best practices.</p>
          </div>
          
          <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Pixel Perfect</h3>
            <p className="text-gray-400">AI accurately replicates your design with precision.</p>
          </div>
        </div>
      </main>
    </div>
  );
}`;

  return {
    success: true,
    code: mockCode,
    usage: {
      inputTokens: 1500,
      outputTokens: 800,
    },
  };
}

// ============================================
// Build User Preferences Block for Prompts
// ============================================
function buildUserPreferencesBlock(options: GenerateOptions): string {
  const prefs: string[] = [];

  // User instructions (highest priority)
  const instructionsBlock = options.instructions && options.instructions.trim()
    ? `\n## User Instructions for Generation:\n${options.instructions.trim()}\n`
    : `\n## User Instructions for Generation:\nNo extra instructions provided.\n`;

  // Layout mode
  if (options.layoutMode === 'fixed') {
    prefs.push('- Use FIXED width layout (no responsive breakpoints)');
  } else {
    prefs.push('- Use RESPONSIVE layout with proper breakpoints (sm, md, lg, xl)');
  }

  // Style preset
  if (options.stylePreset === 'exact') {
    prefs.push('- Match the design EXACTLY as shown - same colors, spacing, typography');
  } else if (options.stylePreset === 'minimal') {
    prefs.push('- Apply MINIMAL styling - clean, simple, less decorative elements');
  } else {
    prefs.push('- Apply MODERN styling - subtle improvements while maintaining design intent');
  }

  // Max width
  if (options.maxWidth) {
    prefs.push(`- Set max-width to ${options.maxWidth}px for the main container`);
  }

  // Compact mode
  if (options.compact) {
    prefs.push('- Use COMPACT spacing - smaller padding, gaps, and margins');
  }

  // Comments
  if (options.includeComments) {
    prefs.push('- Include explanatory JSX comments for major sections');
  } else {
    prefs.push('- Do NOT include any comments in the generated code');
  }

  return `${instructionsBlock}
## User Preferences (MUST follow these):
${prefs.join('\n')}
`;
}

// ============================================
// Generate Chat Reply (Conversational AI - no code)
// ============================================
export async function generateChatReply(userMessage: string): Promise<string> {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`💬 Generating Chat Reply`);
  console.log(`   User: ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`);
  console.log(`   AI Provider: ${AI_PROVIDER}`);
  console.log(`${'─'.repeat(50)}\n`);

  const systemPrompt = SYSTEM_PROMPTS.neuron_chat;

  let response: AIResponse;

  // Call AI (text-only, just for conversational reply)
  switch (AI_PROVIDER.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      response = await callAnthropicTextOnly(systemPrompt, userMessage);
      break;
    case 'gemini':
    case 'google':
      response = await callGeminiTextOnly(systemPrompt, userMessage);
      break;
    case 'openai':
    case 'gpt':
      response = await callOpenAITextOnly(systemPrompt, userMessage);
      break;
    case 'groq':
      response = await callGroqTextOnly(systemPrompt, userMessage);
      break;
    case 'openrouter':
      response = await callOpenRouterTextOnly(systemPrompt, userMessage);
      break;
    default:
      // Fallback response if no provider configured
      console.log(`⚠️ Unknown provider "${AI_PROVIDER}", using fallback response`);
      return "Got it, I'll work on that for you.";
  }

  if (!response.success || !response.code) {
    console.log(`⚠️ Chat reply failed, using fallback`);
    return "On it – making that change now.";
  }

  // Clean up the response (remove any accidental markdown)
  let reply = response.code.trim();
  reply = reply.replace(/^```[a-z]*\n?/g, '').replace(/\n?```$/g, '').trim();

  console.log(`✅ Chat reply generated: "${reply.substring(0, 80)}${reply.length > 80 ? '...' : ''}"`);

  return reply;
}

// ============================================
// Modify Code with AI (Chat-based editing)
// ============================================
export async function modifyCodeWithAI(
  currentCode: string,
  userMessage: string,
  projectId?: string
): Promise<AIResponse> {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🔧 Starting Code Modification`);
  console.log(`   Message: ${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`);
  console.log(`   AI Provider: ${AI_PROVIDER}`);
  console.log(`${'─'.repeat(50)}\n`);

  const systemPrompt = SYSTEM_PROMPTS.modify_code;
  
  const fullUserMessage = `Here is the current React + Tailwind component code:

${currentCode}

User modification request: "${userMessage}"

Apply the requested modification and return ONLY the complete updated code.`;

  if (projectId) {
    emitProjectStatus(projectId, 'PROCESSING', 30);
  }

  let response: AIResponse;

  // Call AI (text-only, no image needed for modifications)
  switch (AI_PROVIDER.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      response = await callAnthropicTextOnly(systemPrompt, fullUserMessage);
      break;
    case 'gemini':
    case 'google':
      response = await callGeminiTextOnly(systemPrompt, fullUserMessage);
      break;
    case 'openai':
    case 'gpt':
      response = await callOpenAITextOnly(systemPrompt, fullUserMessage);
      break;
    case 'groq':
      response = await callGroqTextOnly(systemPrompt, fullUserMessage);
      break;
    case 'openrouter':
      response = await callOpenRouterTextOnly(systemPrompt, fullUserMessage);
      break;
    default:
      return { success: false, error: `Unknown AI provider: ${AI_PROVIDER}` };
  }

  if (!response.success || !response.code) {
    return { success: false, error: response.error || 'Failed to modify code' };
  }

  if (projectId) {
    emitProjectStatus(projectId, 'PROCESSING', 70);
  }

  // Clean up the response
  const cleanedCode = cleanGeneratedCode(response.code);

  // Validate syntax
  const syntaxError = validateJsxSyntax(cleanedCode);
  
  if (syntaxError) {
    console.log(`⚠️ Syntax validation found issue: ${syntaxError}`);
    console.log('🔧 Attempting to fix syntax errors...');
    
    if (projectId) {
      emitProjectStatus(projectId, 'PROCESSING', 85);
    }

    const fixResult = await fixSyntaxErrors(cleanedCode, syntaxError);
    
    if (fixResult.success && fixResult.code) {
      console.log('✅ Syntax errors fixed');
      return {
        success: true,
        code: formatCode(fixResult.code),
        usage: response.usage,
      };
    }
  }

  console.log('✅ Code modification complete');
  console.log(`   Output: ${cleanedCode.length} characters`);

  return {
    success: true,
    code: formatCode(cleanedCode),
    usage: response.usage,
  };
}

// ============================================
// Main AI Call Router - TWO-STAGE PIPELINE
// ============================================
export async function generateCodeFromImage(
  imagePath: string,
  codeType: string,
  framework: string,
  projectId?: string,
  generationOptions?: Partial<GenerateOptions>
): Promise<AIResponse> {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🔄 Starting TWO-STAGE Pipeline`);
  console.log(`   Image: ${imagePath}`);
  console.log(`   Code type: ${codeType}, Framework: ${framework}`);
  console.log(`   AI Provider: ${AI_PROVIDER}`);
  if (generationOptions) {
    console.log(`   Options: ${JSON.stringify(generationOptions)}`);
  }
  console.log(`${'─'.repeat(50)}\n`);

  const options: GenerateOptions = {
    codeType,
    framework,
    responsive: generationOptions?.layoutMode !== 'fixed',
    darkMode: true,
    // Merge in generation options
    layoutMode: generationOptions?.layoutMode || 'responsive',
    stylePreset: generationOptions?.stylePreset || 'modern',
    maxWidth: generationOptions?.maxWidth,
    compact: generationOptions?.compact || false,
    includeComments: generationOptions?.includeComments || false,
    instructions: generationOptions?.instructions || '',
  };

  try {
    // Convert image to base64
    const imageBase64 = await imageToBase64(imagePath);

    // ==========================================
    // STAGE 1: Image → Layout JSON
    // ==========================================
    console.log('\n📐 ═══ STAGE 1: Analyzing Layout ═══');
    
    if (projectId) {
      emitProjectStatus(projectId, 'PROCESSING', 10);
    }

    const layoutResult = await generateLayoutJson(imageBase64, options, projectId);
    
    if (!layoutResult.success || !layoutResult.layout) {
      console.log('⚠️ Stage 1 failed, falling back to direct generation');
      // Fallback to old single-stage approach
      return await generateCodeDirect(imageBase64, codeType, framework);
    }

    console.log('✅ Stage 1 complete - Layout JSON generated');
    console.log(`   Sections: ${layoutResult.layout.page?.sections?.length || 0}`);
    console.log(`   Theme: ${layoutResult.layout.page?.theme?.background || 'default'}`);

    // ==========================================
    // STAGE 2: Layout JSON → Code
    // ==========================================
    console.log('\n💻 ═══ STAGE 2: Generating Code ═══');
    
    if (projectId) {
      emitProjectStatus(projectId, 'PROCESSING', 40);
    }

    const codeResult = await generateCodeFromLayout(layoutResult.layout, options, projectId);
    
    if (!codeResult.success || !codeResult.code) {
      console.log('⚠️ Stage 2 failed, falling back to direct generation');
      return await generateCodeDirect(imageBase64, codeType, framework);
    }

    console.log('✅ Stage 2 complete - Code generated');
    console.log(`   Code length: ${codeResult.code.length} characters`);

    // ==========================================
    // POST-PROCESSING: Format & Validate
    // ==========================================
    console.log('\n🔧 ═══ POST-PROCESSING ═══');
    
    if (projectId) {
      emitProjectStatus(projectId, 'PROCESSING', 75);
    }

    const processedResult = await postProcessCode(codeResult.code, projectId);
    
    console.log('✅ Post-processing complete');
    console.log(`   Final code length: ${processedResult.code.length} characters`);

    return {
      success: true,
      code: processedResult.code,
      usage: {
        inputTokens: 0, // Aggregate if needed
        outputTokens: 0,
      },
    };

  } catch (error) {
    console.error('❌ Pipeline error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try direct generation as fallback
    console.log('⚠️ Falling back to direct generation...');
    try {
      const imageBase64 = await imageToBase64(imagePath);
      return await generateCodeDirect(imageBase64, codeType, framework);
    } catch (fallbackError) {
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

/**
 * Direct code generation (fallback, single-stage)
 * Used when the two-stage pipeline fails
 */
async function generateCodeDirect(
  imageBase64: string,
  codeType: string,
  _framework: string
): Promise<AIResponse> {
  console.log('📝 Using direct (single-stage) generation...');

  // Select appropriate system prompt based on code type
  let systemPrompt = SYSTEM_PROMPTS.react_tailwind;
  
  switch (codeType.toUpperCase()) {
    case 'HTML':
      systemPrompt = SYSTEM_PROMPTS.html_tailwind;
      break;
    case 'VUE':
      systemPrompt = SYSTEM_PROMPTS.vue_tailwind;
      break;
    case 'SVELTE':
      systemPrompt = SYSTEM_PROMPTS.svelte_tailwind;
      break;
    case 'ANGULAR':
      systemPrompt = SYSTEM_PROMPTS.angular_tailwind;
      break;
    case 'NEXTJS':
      systemPrompt = SYSTEM_PROMPTS.nextjs_tailwind;
      break;
    case 'REACT':
    default:
      systemPrompt = SYSTEM_PROMPTS.react_tailwind;
      break;
  }

  const userMessage = `Analyze this UI design image and recreate it as production-ready code.
Match the layout, colors, spacing, and typography exactly.
Return ONLY the code - no explanations, no markdown.`;

  // Call the appropriate AI provider
  switch (AI_PROVIDER.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return callAnthropicAPIWithMessage(imageBase64, systemPrompt, userMessage);
    
    case 'gemini':
    case 'google':
      return callGeminiAPIWithMessage(imageBase64, systemPrompt, userMessage);
    
    case 'openai':
    case 'gpt':
      return callOpenAIAPIWithMessage(imageBase64, systemPrompt, userMessage);
    
    case 'openrouter':
      return callOpenRouterAPIWithMessage(imageBase64, systemPrompt, userMessage);
    
    case 'groq':
      // Groq doesn't support vision, use mock
      return getMockResponse(codeType);
    
    default:
      console.log(`⚠️ Unknown provider "${AI_PROVIDER}", using mock response`);
      return getMockResponse(codeType);
  }
}

// ============================================
// Job Processor - TWO-STAGE PIPELINE
// ============================================
async function processImageToCodeJob(
  job: Job<ImageToCodeJobData, ImageToCodeJobResult>
): Promise<ImageToCodeJobResult> {
  const { projectId, imagePath, codeType, framework, generationOptions, instructions } = job.data;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 Starting Job: ${job.id}`);
  console.log(`   Project ID: ${projectId}`);
  console.log(`   Code Type: ${codeType} | Framework: ${framework}`);
  if (instructions) {
    console.log(`   User Instructions: ${instructions.substring(0, 80)}${instructions.length > 80 ? '...' : ''}`);
  }
  if (generationOptions) {
    console.log(`   Generation Options:`);
    console.log(`     - Layout Mode: ${generationOptions.layoutMode || 'responsive'}`);
    console.log(`     - Style Preset: ${generationOptions.stylePreset || 'modern'}`);
    console.log(`     - Max Width: ${generationOptions.maxWidth || 'auto'}`);
    console.log(`     - Compact: ${generationOptions.compact || false}`);
    console.log(`     - Include Comments: ${generationOptions.includeComments || false}`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  try {
    // Update status to PROCESSING
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });

    // Emit initial processing status
    emitProjectStatus(projectId, 'PROCESSING', 5);

    // ==========================================
    // Run the TWO-STAGE PIPELINE
    // ==========================================
    const result = await generateCodeFromImage(
      imagePath, 
      codeType, 
      framework, 
      projectId,
      generationOptions ? {
        layoutMode: generationOptions.layoutMode,
        stylePreset: generationOptions.stylePreset,
        maxWidth: generationOptions.maxWidth,
        compact: generationOptions.compact,
        includeComments: generationOptions.includeComments,
        instructions: instructions || undefined,
      } : instructions ? { instructions } : undefined
    );

    if (!result.success || !result.code) {
      throw new Error(result.error || 'Failed to generate code');
    }

    // Update project with generated code
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        generatedCode: result.code,
        processingCompletedAt: new Date(),
      },
    });

    // ==========================================
    // VISUAL FIDELITY POSTPROCESSING (Optional)
    // ==========================================
    // Run visual check if reference image is available
    // This is a non-blocking enhancement step - failures don't affect the main job
    let visualCheckResult: VisualCheckResult | undefined;
    try {
      const referenceImagePath = imagePath; // The original uploaded image serves as reference
      const generatedPreviewPath = path.join(
        process.cwd(),
        'artifacts',
        'previews',
        `${projectId}_generated.png`
      );

      // Only run if we have both images (generated preview would be created by a separate screenshot service)
      if (fs.existsSync(referenceImagePath) && fs.existsSync(generatedPreviewPath)) {
        console.log(`[VISUAL-CHECK] Running visual fidelity check for project ${projectId}...`);
        
        visualCheckResult = await runVisualCheck({
          referencePath: referenceImagePath,
          generatedPath: generatedPreviewPath,
          jobId: projectId,
          ssimThreshold: 0.94,
          autoPatching: true,
        });

        if (visualCheckResult.success) {
          console.log(`[VISUAL-CHECK] Completed: SSIM=${visualCheckResult.ssim.toFixed(4)}, Passed=${visualCheckResult.passed}`);
          if (visualCheckResult.patchSuggestions && visualCheckResult.patchSuggestions.length > 0) {
            console.log(`[VISUAL-CHECK] Generated ${visualCheckResult.patchSuggestions.length} patch suggestions`);
          }
        }
      } else {
        console.log(`[VISUAL-CHECK] Skipping - preview screenshot not available yet`);
      }
    } catch (visualError) {
      // Log but don't fail the job
      console.warn(`[VISUAL-CHECK] Warning: Visual check failed (non-blocking):`, visualError);
    }

    // Emit completion via Socket.io
    emitProjectCompleted(projectId, {
      status: 'COMPLETED',
      generatedCode: result.code,
    });

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ Job ${job.id} COMPLETED`);
    console.log(`   Tokens: ${result.usage?.inputTokens || 0} in / ${result.usage?.outputTokens || 0} out`);
    console.log(`   Code: ${result.code.length} characters`);
    console.log(`${'═'.repeat(60)}\n`);

    return {
      success: true,
      generatedCode: result.code,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.log(`\n${'═'.repeat(60)}`);
    console.error(`❌ Job ${job.id} FAILED: ${errorMessage}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Update project with error
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'FAILED',
        errorMessage,
        processingCompletedAt: new Date(),
      },
    });

    // Emit error via Socket.io
    emitProjectError(projectId, errorMessage);

    throw error;
  }
}

// ============================================
// Job Processor - MODIFY CODE
// ============================================
async function processModifyCodeJob(
  job: Job<ModifyCodeJobData, ModifyCodeJobResult>
): Promise<ModifyCodeJobResult> {
  const { projectId, currentCode, userMessage } = job.data;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔧 [MODIFY-CODE] Job started`);
  console.log(`   📋 Project ID: ${projectId}`);
  console.log(`   📋 Job ID: ${job.id}`);
  console.log(`   💬 User Message: ${userMessage.substring(0, 80)}${userMessage.length > 80 ? '...' : ''}`);
  console.log(`   📄 Current Code: ${currentCode.length} characters`);
  console.log(`${'═'.repeat(60)}\n`);

  try {
    // Step 1: Update status to PROCESSING
    console.log(`[MODIFY-CODE] Step 1: Updating project status to PROCESSING...`);
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(),
      },
    });
    console.log(`[MODIFY-CODE] ✓ Project status updated to PROCESSING`);

    // Emit initial processing status
    emitProjectStatus(projectId, 'PROCESSING', 10);

    // Step 2: Build the message for the AI
    const systemPrompt = SYSTEM_PROMPTS.code_editor;
    const fullUserMessage = `User request:
${userMessage}

CURRENT CODE:
${currentCode}`;

    console.log(`[MODIFY-CODE] Step 2: Calling AI provider (${AI_PROVIDER}) for code modification...`);
    emitProjectStatus(projectId, 'PROCESSING', 30);

    let response: AIResponse;

    // Call AI (text-only, no image needed for modifications)
    switch (AI_PROVIDER.toLowerCase()) {
      case 'anthropic':
      case 'claude':
        response = await callAnthropicTextOnly(systemPrompt, fullUserMessage);
        break;
      case 'gemini':
      case 'google':
        response = await callGeminiTextOnly(systemPrompt, fullUserMessage);
        break;
      case 'openai':
      case 'gpt':
        response = await callOpenAITextOnly(systemPrompt, fullUserMessage);
        break;
      case 'groq':
        response = await callGroqTextOnly(systemPrompt, fullUserMessage);
        break;
      case 'openrouter':
        response = await callOpenRouterTextOnly(systemPrompt, fullUserMessage);
        break;
      default:
        throw new Error(`Unknown AI provider: ${AI_PROVIDER}`);
    }

    if (!response.success || !response.code) {
      throw new Error(response.error || 'Failed to modify code - no code returned from AI');
    }

    console.log(`[MODIFY-CODE] ✓ AI response received (${response.code.length} chars)`);
    emitProjectStatus(projectId, 'PROCESSING', 70);

    // Step 3: Clean up and validate the response
    console.log(`[MODIFY-CODE] Step 3: Cleaning and validating code...`);
    let modifiedCode = cleanGeneratedCode(response.code);

    // Validate syntax
    const syntaxError = validateJsxSyntax(modifiedCode);
    
    if (syntaxError) {
      console.log(`[MODIFY-CODE] ⚠️ Syntax validation issue: ${syntaxError}`);
      console.log(`[MODIFY-CODE] Attempting to fix syntax errors...`);
      
      emitProjectStatus(projectId, 'PROCESSING', 85);

      const fixResult = await fixSyntaxErrors(modifiedCode, syntaxError);
      
      if (fixResult.success && fixResult.code) {
        modifiedCode = fixResult.code;
        console.log(`[MODIFY-CODE] ✓ Syntax errors fixed`);
      } else {
        console.log(`[MODIFY-CODE] ⚠️ Could not fix syntax errors, using original AI response`);
      }
    } else {
      console.log(`[MODIFY-CODE] ✓ Syntax validation passed`);
    }

    // Format the code
    modifiedCode = formatCode(modifiedCode);
    console.log(`[MODIFY-CODE] ✓ Code formatted (${modifiedCode.length} chars)`);

    emitProjectStatus(projectId, 'PROCESSING', 95);

    // Step 4: Save to database
    console.log(`[MODIFY-CODE] Step 4: Saving updated code to database...`);
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        generatedCode: modifiedCode,
        processingCompletedAt: new Date(),
      },
    });
    console.log(`[MODIFY-CODE] ✓ Database updated - project status: ${updatedProject.status}`);

    // Step 5: Save assistant message to chat history
    console.log(`[MODIFY-CODE] Step 5: Saving assistant message to chat history...`);
    const assistantMessage = "Done! I've updated the code based on your request. Check the preview to see the changes!";
    await prisma.chatMessage.create({
      data: {
        projectId,
        role: 'assistant',
        content: assistantMessage,
      },
    });
    console.log(`[MODIFY-CODE] ✓ Assistant message saved to chat history`);

    // Step 6: Emit Socket.io events - THIS IS CRITICAL FOR LIVE UPDATES
    console.log(`[MODIFY-CODE] Step 6: Emitting Socket.io events...`);
    console.log(`[MODIFY-CODE]    → Emitting 'project:code-updated' event...`);
    
    try {
      emitProjectCodeUpdated(projectId, modifiedCode);
      console.log(`[MODIFY-CODE] ✓ 'project:code-updated' event emitted to room: project-${projectId}`);
    } catch (socketError) {
      console.error(`[MODIFY-CODE] ❌ Failed to emit 'project:code-updated':`, socketError);
      // Don't throw here - the DB is already updated, the UI can poll if needed
    }

    // Also emit completion for consistency
    console.log(`[MODIFY-CODE]    → Emitting 'project-completed' event...`);
    try {
      emitProjectCompleted(projectId, {
        status: 'COMPLETED',
        generatedCode: modifiedCode,
      });
      console.log(`[MODIFY-CODE] ✓ 'project-completed' event emitted`);
    } catch (socketError) {
      console.error(`[MODIFY-CODE] ❌ Failed to emit 'project-completed':`, socketError);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ [MODIFY-CODE] Job completed successfully!`);
    console.log(`   📋 Project ID: ${projectId}`);
    console.log(`   📊 Tokens: ${response.usage?.inputTokens || 0} in / ${response.usage?.outputTokens || 0} out`);
    console.log(`   📄 Modified Code: ${modifiedCode.length} characters`);
    console.log(`   🔌 Socket events emitted: project:code-updated, project-completed`);
    console.log(`${'═'.repeat(60)}\n`);

    return {
      success: true,
      modifiedCode,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.log(`\n${'═'.repeat(60)}`);
    console.error(`❌ [MODIFY-CODE] Job FAILED for project ${projectId}`);
    console.error(`   Error: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    console.log(`${'═'.repeat(60)}\n`);

    // Update project with error status
    try {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'FAILED',
          errorMessage,
          processingCompletedAt: new Date(),
        },
      });
      console.log(`[MODIFY-CODE] ✓ Project status updated to FAILED`);
    } catch (dbError) {
      console.error(`[MODIFY-CODE] ❌ Failed to update project status:`, dbError);
    }

    // Save error message to chat history
    try {
      await prisma.chatMessage.create({
        data: {
          projectId,
          role: 'assistant',
          content: `Sorry, I couldn't apply that change: ${errorMessage}. Please try again.`,
        },
      });
      console.log(`[MODIFY-CODE] ✓ Error message saved to chat history`);
    } catch (chatError) {
      console.error(`[MODIFY-CODE] ❌ Failed to save error message to chat:`, chatError);
    }

    // Emit error via Socket.io
    try {
      emitProjectError(projectId, errorMessage);
      console.log(`[MODIFY-CODE] ✓ 'project-error' event emitted`);
    } catch (socketError) {
      console.error(`[MODIFY-CODE] ❌ Failed to emit error event:`, socketError);
    }

    throw error;
  }
}

// ============================================
// Worker Instance
// ============================================
export function createWorker() {
  // Worker for image-to-code jobs
  const imageToCodeWorker = new Worker<ImageToCodeJobData, ImageToCodeJobResult>(
    QUEUE_NAMES.IMAGE_TO_CODE,
    processImageToCodeJob,
    {
      connection: redisConfig,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute max
      },
    }
  );

  imageToCodeWorker.on('ready', () => {
    console.log('🚀 Image-to-Code Worker is ready and listening for jobs');
  });

  imageToCodeWorker.on('active', (job) => {
    console.log(`📋 Image-to-Code Job ${job.id} is now active`);
  });

  imageToCodeWorker.on('completed', (job) => {
    console.log(`✅ Image-to-Code Job ${job.id} completed`);
  });

  imageToCodeWorker.on('failed', (job, error) => {
    console.error(`❌ Image-to-Code Job ${job?.id} failed:`, error.message);
  });

  imageToCodeWorker.on('error', (error) => {
    console.error('❌ Image-to-Code Worker error:', error);
  });

  // Worker for modify-code jobs
  const modifyCodeWorker = new Worker<ModifyCodeJobData, ModifyCodeJobResult>(
    QUEUE_NAMES.MODIFY_CODE,
    processModifyCodeJob,
    {
      connection: redisConfig,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
      limiter: {
        max: 20,
        duration: 60000, // 20 modify jobs per minute max
      },
    }
  );

  modifyCodeWorker.on('ready', () => {
    console.log('🔧 Modify-Code Worker is ready and listening for jobs');
  });

  modifyCodeWorker.on('active', (job) => {
    console.log(`📋 Modify-Code Job ${job.id} is now active`);
  });

  modifyCodeWorker.on('completed', (job) => {
    console.log(`✅ Modify-Code Job ${job.id} completed`);
  });

  modifyCodeWorker.on('failed', (job, error) => {
    console.error(`❌ Modify-Code Job ${job?.id} failed:`, error.message);
  });

  modifyCodeWorker.on('error', (error) => {
    console.error('❌ Modify-Code Worker error:', error);
  });

  // Return combined worker interface
  return {
    imageToCodeWorker,
    modifyCodeWorker,
    close: async () => {
      await Promise.all([
        imageToCodeWorker.close(),
        modifyCodeWorker.close(),
      ]);
    },
  };
}

// ============================================
// Standalone Worker Entry Point
// ============================================
if (require.main === module) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🧠 NEURON Worker                                       ║
║   Image-to-Code & Modify-Code AI Processing              ║
║                                                          ║
║   AI Provider: ${AI_PROVIDER.padEnd(40)}║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
  `);

  const workers = createWorker();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down workers...`);
    await workers.close();
    await prisma.$disconnect();
    console.log('👋 Workers shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default createWorker;
