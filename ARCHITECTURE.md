# NEURON - Complete System Architecture

> **Image-to-Code AI Platform**  
> Last Updated: December 4, 2025  
> Total Lines of Code: ~15,000+

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Core Pipelines](#core-pipelines)
6. [API Endpoints](#api-endpoints)
7. [Database Schema](#database-schema)
8. [Real-time Communication](#real-time-communication)
9. [Frontend Architecture](#frontend-architecture)
10. [Key Features](#key-features)

---

## Overview

NEURON is a full-stack AI-powered application that converts UI design images into production-ready code. Users upload a screenshot or design mockup, and NEURON generates clean, responsive HTML/React code using AI vision models.

### Core Capabilities:
- 🖼️ **Image-to-Code Generation** - Upload any UI image → Get working code
- 💬 **AI Chat Refinement** - Iteratively modify code through natural language
- 🔍 **Visual Fidelity Pipeline** - Ensure generated code matches the original design
- 🧩 **Component Extraction** - Detect repeating UI patterns and extract as reusable components
- 👁️ **Live Preview** - Real-time preview with responsive viewport switching
- 📝 **Multi-file Code Editor** - Monaco-powered editor with file tabs

---

## Project Structure

```
NEURON/
├── apps/
│   ├── api/                    # Backend Express.js API
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema (SQLite)
│   │   └── src/
│   │       ├── index.ts        # Server entry point
│   │       ├── lib/
│   │       │   ├── prisma.ts   # Database client
│   │       │   ├── redis.ts    # Redis connection (BullMQ)
│   │       │   └── socket.ts   # Socket.io setup
│   │       ├── middleware/
│   │       │   └── errorHandler.ts
│   │       ├── queues/
│   │       │   └── jobQueue.ts # BullMQ job queue
│   │       ├── routes/
│   │       │   ├── generate.ts # Image upload & generation
│   │       │   ├── project.ts  # Project CRUD & chat
│   │       │   └── health.ts   # Health check endpoint
│   │       ├── services/
│   │       │   └── uploadService.ts # File upload handling
│   │       ├── types/
│   │       │   └── queue.ts    # Type definitions
│   │       └── workers/
│   │           ├── worker.ts   # Main AI processing worker
│   │           └── extract_components.ts # Component extraction
│   │
│   ├── web/                    # Frontend Next.js App
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx  # Root layout
│   │       │   ├── page.tsx    # Landing page
│   │       │   ├── globals.css # Global styles
│   │       │   ├── api/
│   │       │   │   ├── chat/route.ts      # Chat API route
│   │       │   │   └── modify-code/route.ts # Code modification
│   │       │   ├── auth/callback/page.tsx
│   │       │   └── login/page.tsx
│   │       ├── components/
│   │       │   ├── Workspace.tsx       # Main workspace UI
│   │       │   ├── LivePreview.tsx     # Iframe preview
│   │       │   ├── CodeViewer.tsx      # Monaco editor
│   │       │   ├── CodeViewerWithTabs.tsx # Multi-file editor
│   │       │   ├── ChatBox.tsx         # Chat interface
│   │       │   ├── UploadZone.tsx      # Image upload
│   │       │   ├── ViewportToolbar.tsx # Device size buttons
│   │       │   └── Inspector/
│   │       │       ├── InspectorPanel.tsx    # Element inspector
│   │       │       └── ExtractComponentModal.tsx
│   │       ├── hooks/
│   │       │   └── useSocket.ts        # Socket.io hook
│   │       ├── lib/
│   │       │   ├── auth.ts             # Authentication
│   │       │   └── config.ts           # API endpoints
│   │       └── store/
│   │           ├── useProjectStore.ts  # Project state (Zustand)
│   │           ├── useEditorStore.ts   # Editor state
│   │           └── useExtractionHistory.ts # Undo/revert
│   │
│   └── vision2code/            # Python Image Processing
│       └── app/
│           ├── main.py         # FastAPI server
│           ├── config.py       # Configuration
│           ├── database.py     # Database models
│           ├── models.py       # Pydantic schemas
│           └── auth.py         # Authentication
│
├── packages/
│   └── ui/                     # Shared UI components
│       └── src/
│           ├── index.ts
│           └── components/
│               ├── Button.tsx
│               └── Card.tsx
│
├── tools/                      # Visual fidelity tools
│   ├── image_preprocess.py     # Image preprocessing
│   ├── color_transfer.py       # Color matching
│   └── postprocess_visual_check.ts # Visual comparison
│
├── docs/
│   └── COMPONENT_EXTRACTION.md # Feature documentation
│
├── turbo.json                  # Turborepo config
└── package.json                # Root package.json
```

---

## Technology Stack

### Backend (apps/api)
| Technology | Purpose |
|------------|---------|
| **Node.js + Express** | HTTP server & REST API |
| **TypeScript** | Type-safe JavaScript |
| **Prisma ORM** | Database access (SQLite) |
| **BullMQ** | Job queue for async processing |
| **Socket.io** | Real-time WebSocket communication |
| **Zod** | Request validation |
| **Multer** | File upload handling |

### Frontend (apps/web)
| Technology | Purpose |
|------------|---------|
| **Next.js 14** | React framework (App Router) |
| **React 18** | UI library |
| **TypeScript** | Type-safe JavaScript |
| **Tailwind CSS** | Utility-first styling |
| **Zustand** | State management |
| **Monaco Editor** | Code editor (VS Code engine) |
| **Socket.io Client** | Real-time updates |
| **Lucide React** | Icons |

### AI & Processing
| Technology | Purpose |
|------------|---------|
| **Anthropic Claude** | Vision AI (image analysis) |
| **OpenAI GPT-4** | Alternative AI provider |
| **Google Gemini** | Alternative AI provider |
| **Python (PIL/OpenCV)** | Image preprocessing |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **Turborepo** | Monorepo build system |
| **SQLite** | Database (dev) |
| **Redis** | Job queue backend |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEURON SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│  │   Browser   │────▶│  Next.js    │────▶│     Express API Server     │   │
│  │   Client    │◀────│  Frontend   │◀────│       (Port 3001)          │   │
│  │             │     │ (Port 3000) │     │                             │   │
│  └─────────────┘     └─────────────┘     └──────────────┬──────────────┘   │
│        │                    │                           │                   │
│        │ WebSocket          │                           │                   │
│        │                    │                           ▼                   │
│        │              ┌─────┴─────┐              ┌─────────────┐            │
│        └─────────────▶│ Socket.io │◀────────────│   BullMQ    │            │
│                       │  Server   │              │ Job Queue   │            │
│                       └───────────┘              └──────┬──────┘            │
│                                                         │                   │
│                                                         ▼                   │
│                                                  ┌─────────────┐            │
│                                                  │   Worker    │            │
│                                                  │  (AI Jobs)  │            │
│                                                  └──────┬──────┘            │
│                                                         │                   │
│                       ┌─────────────────────────────────┼──────────────┐    │
│                       │                                 │              │    │
│                       ▼                                 ▼              ▼    │
│                ┌─────────────┐                   ┌───────────┐  ┌─────────┐ │
│                │   SQLite    │                   │  Claude   │  │ OpenAI  │ │
│                │  Database   │                   │  Vision   │  │  GPT-4  │ │
│                └─────────────┘                   └───────────┘  └─────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Pipelines

### 1. Image-to-Code Generation Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    IMAGE-TO-CODE GENERATION PIPELINE                      │
└──────────────────────────────────────────────────────────────────────────┘

Step 1: IMAGE UPLOAD
───────────────────
User uploads image → Multer saves to /uploads → Create Project record

     ┌─────────┐      ┌─────────────┐      ┌──────────────┐
     │  User   │─────▶│ POST /api/  │─────▶│    Multer    │
     │ Upload  │      │  generate   │      │  Save File   │
     └─────────┘      └─────────────┘      └──────┬───────┘
                                                  │
                                                  ▼
                                           ┌──────────────┐
                                           │   Prisma     │
                                           │ Create Project│
                                           └──────┬───────┘
                                                  │
Step 2: JOB QUEUING                               ▼
──────────────────                         ┌──────────────┐
Project created → Add job to BullMQ        │   BullMQ     │
                                           │  Add Job     │
                                           └──────┬───────┘
                                                  │
Step 3: AI PROCESSING (Worker)                    ▼
─────────────────────────────           ┌─────────────────┐
Worker picks up job →                   │     Worker      │
Read image as base64 →                  │   Process Job   │
Send to AI Vision API                   └────────┬────────┘
                                                 │
                    ┌────────────────────────────┴───────────────────┐
                    │                                                │
                    ▼                                                ▼
             ┌─────────────┐                                  ┌─────────────┐
             │   Claude    │    OR                            │   OpenAI    │
             │   Sonnet    │                                  │   GPT-4o    │
             └──────┬──────┘                                  └──────┬──────┘
                    │                                                │
                    └────────────────────┬───────────────────────────┘
                                         │
                                         ▼
Step 4: CODE GENERATION         ┌─────────────────┐
───────────────────────         │  AI Response    │
AI analyzes image →             │  (Generated     │
Generates HTML/React code       │   Code)         │
                                └────────┬────────┘
                                         │
Step 5: SAVE & NOTIFY                    ▼
─────────────────────           ┌─────────────────┐
Save code to database →         │ Update Project  │
Emit Socket event to client     │ (generatedCode) │
                                └────────┬────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │  Socket.io      │
                                │  Emit 'code-    │
                                │  updated'       │
                                └────────┬────────┘
                                         │
Step 6: DISPLAY                          ▼
───────────────────             ┌─────────────────┐
Frontend receives event →       │   Frontend      │
Updates Zustand store →         │   LivePreview   │
Renders in LivePreview          │   Workspace     │
                                └─────────────────┘
```

### 2. AI Chat Modification Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    AI CHAT MODIFICATION PIPELINE                          │
└──────────────────────────────────────────────────────────────────────────┘

User: "Make the header blue and add a shadow"
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Workspace.tsx)                                               │
│                                                                         │
│  1. Detect modification intent (keywords: change, modify, add, etc.)   │
│  2. POST /api/project/:id/apply-change                                  │
│  3. Show "Applying changes..." in chat                                  │
│  4. Listen for socket 'code-updated' event                              │
└────────────────────────────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND (project.ts - /apply-change)                                   │
│                                                                         │
│  1. Validate request with Zod                                           │
│  2. Fetch project with current code                                     │
│  3. Generate AI chat reply (conversational)                             │
│  4. Add modify job to BullMQ queue                                      │
│  5. Return { jobId, chatReply } immediately                             │
└────────────────────────────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  WORKER (worker.ts - processModifyCodeJob)                              │
│                                                                         │
│  1. Read current code from project                                      │
│  2. Build prompt with instruction + current code                        │
│  3. Call AI API (Claude/GPT-4)                                          │
│  4. Extract modified code from response                                 │
│  5. Update project.generatedCode in database                            │
│  6. Emit socket event: io.to(projectId).emit('code-updated', newCode)   │
└────────────────────────────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SOCKET EVENT → FRONTEND                                                │
│                                                                         │
│  1. useSocket hook receives 'code-updated' event                        │
│  2. Updates Zustand store (useProjectStore)                             │
│  3. LivePreview re-renders with new code                                │
│  4. Chat message updated to "Done!"                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. Visual Fidelity Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     VISUAL FIDELITY PIPELINE                             │
└──────────────────────────────────────────────────────────────────────────┘

Purpose: Ensure generated code visually matches the original design image

                     ┌─────────────────┐
                     │ Original Image  │
                     └────────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     │                     ▼
┌───────────────┐             │           ┌───────────────────┐
│ Preprocessing │             │           │  Code Generation  │
│ (Python)      │             │           │  (AI Worker)      │
│               │             │           │                   │
│ • Resize      │             │           │ HTML/React output │
│ • Normalize   │             │           └─────────┬─────────┘
│ • Edge detect │             │                     │
└───────┬───────┘             │                     ▼
        │                     │           ┌───────────────────┐
        │                     │           │ Render Screenshot │
        │                     │           │ (Puppeteer/       │
        │                     │           │  Playwright)      │
        │                     │           └─────────┬─────────┘
        │                     │                     │
        ▼                     │                     ▼
┌───────────────┐             │           ┌───────────────────┐
│ Reference     │             │           │ Generated Image   │
│ Image         │             │           │                   │
└───────┬───────┘             │           └─────────┬─────────┘
        │                     │                     │
        └──────────┬──────────┴─────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │ Visual Compare  │
         │ (SSIM/Histogram)│
         │                 │
         │ Similarity > 90%│
         │   ✅ PASS       │
         │ Similarity < 90%│
         │   🔄 RETRY      │
         └─────────────────┘

Files:
  - tools/image_preprocess.py   → Resize, normalize images
  - tools/color_transfer.py     → Color histogram matching
  - tools/postprocess_visual_check.ts → SSIM comparison

Usage:
  npm run visual-check -- --ref original.png --gen generated.png --threshold 0.90
```

### 4. Component Extraction Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    COMPONENT EXTRACTION PIPELINE                          │
└──────────────────────────────────────────────────────────────────────────┘

Purpose: Detect repeating UI patterns and extract as reusable components

Step 1: DETECTION (findRepeatedStructures)
──────────────────────────────────────────

Input: Layout JSON (parsed from generated code)
       {
         tag: "div",
         children: [
           { tag: "div", class: "card", ... },
           { tag: "div", class: "card", ... },
           { tag: "div", class: "card", ... }
         ]
       }

Algorithm:
  1. Traverse all nodes in layout tree
  2. Generate fingerprint for each node:
     fingerprint = tag + childCount + widthBucket + topClasses
     
     Example: "div|3|200|card,shadow,rounded"
     
  3. Group nodes by fingerprint
  4. Filter groups with ≥2 instances (repeating patterns)
  5. Calculate similarity score (0-1)

Output: RepeatCluster[]
        [
          {
            clusterId: "cluster_abc123",
            suggestedName: "Card",
            instances: ["node_1", "node_2", "node_3"],
            instanceCount: 3,
            similarity: 0.95,
            propCandidates: [
              { name: "title", type: "text", sampleValue: "Card Title" },
              { name: "image", type: "image", sampleValue: "/img.png" }
            ]
          }
        ]


Step 2: UI SELECTION (InspectorPanel)
─────────────────────────────────────

┌─────────────────────────────────────────────────────────┐
│  INSPECTOR PANEL                                         │
│  ─────────────────                                       │
│  Element: <div class="card">                            │
│  Size: 300 x 200px                                       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  🧩 EXTRACT COMPONENT                               │ │
│  │                                                      │ │
│  │  Found 3 repeating patterns:                        │ │
│  │                                                      │ │
│  │  ┌────────────────────────────────────────────────┐ │ │
│  │  │  Card                                          │ │ │
│  │  │  3 instances • 95% similar                     │ │ │
│  │  │                              [Extract →]       │ │ │
│  │  └────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘


Step 3: GENERATION (generateComponentFiles)
───────────────────────────────────────────

Input: Cluster + Component Name

Process:
  1. Analyze prop candidates (text nodes, images, links)
  2. Generate TypeScript interface for props
  3. Generate React/TSX component code
  4. Create patch suggestions for replacing instances

Output:
  {
    componentName: "Card",
    files: [
      {
        path: "components/Card.tsx",
        content: `
          interface CardProps {
            title: string;
            image: string;
            description?: string;
          }
          
          export function Card({ title, image, description }: CardProps) {
            return (
              <div className="card rounded-lg shadow-md">
                <img src={image} alt={title} />
                <h3>{title}</h3>
                {description && <p>{description}</p>}
              </div>
            );
          }
        `
      }
    ],
    replacements: [
      { nodeId: "node_1", componentUsage: "<Card title=\"...\" />" },
      { nodeId: "node_2", componentUsage: "<Card title=\"...\" />" }
    ]
  }


Step 4: PREVIEW & APPLY
───────────────────────

┌─────────────────────────────────────────────────────────┐
│  EXTRACT COMPONENT MODAL                                 │
│  ───────────────────────                                 │
│  Component Name: [Card____________]                      │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  DIFF PREVIEW                              [Toggle] │ │
│  │  ─────────────                                      │ │
│  │  - <div class="card">...</div>                      │ │
│  │  - <div class="card">...</div>                      │ │
│  │  + <Card title="..." image="..." />                 │ │
│  │  + <Card title="..." image="..." />                 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│           [Cancel]    [Apply Extraction]                │
└─────────────────────────────────────────────────────────┘


Step 5: REVERT (if needed)
──────────────────────────

Extraction history stored in project.extractionHistory (JSON)
POST /api/project/:id/revert-extraction { versionId }
→ Restores previous code state
```

---

## API Endpoints

### Generation Routes (`/api/generate`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Upload image and start code generation |
| GET | `/api/generate/status/:jobId` | Get job status |

### Project Routes (`/api/project`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/project` | List all projects |
| GET | `/project/:id` | Get project details |
| DELETE | `/project/:id` | Delete project |
| GET | `/project/:id/status` | Get project status |
| GET | `/project/:id/chat` | Get chat history |
| POST | `/project/:id/chat` | Add chat message |
| POST | `/project/:id/apply-change` | Apply AI code modification |
| GET | `/project/:id/extract-candidates` | Get component extraction candidates |
| POST | `/project/:id/extract-component` | Generate component code |
| POST | `/project/:id/apply-extraction` | Apply component extraction |
| POST | `/project/:id/revert-extraction` | Revert extraction |

### Health Routes (`/api/health`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/queue` | Queue stats |

---

## Database Schema

```prisma
// SQLite Database via Prisma ORM

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String?
  avatar       String?
  passwordHash String?
  provider     String    @default("EMAIL")  // EMAIL | GOOGLE | GITHUB
  providerId   String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  projects     Project[]
}

model Project {
  id                    String        @id @default(cuid())
  userId                String
  user                  User          @relation(...)
  
  // Project Info
  name                  String        @default("Untitled Project")
  description           String?
  
  // Image Processing
  originalImage         String        // Path to uploaded image
  imageMetadata         String?       // JSON: width, height, format
  
  // Generated Output
  generatedCode         String?       // The HTML/React code
  codeType              String        @default("HTML")
  framework             String        @default("VANILLA")
  
  // Layout Analysis
  layoutJson            String?       // Parsed layout structure (JSON)
  
  // Component Extraction
  extractionHistory     String?       // Version history (JSON)
  
  // User Instructions
  instructions          String?       // Initial generation instructions
  
  // Processing Status
  status                String        @default("PENDING")
  errorMessage          String?
  jobId                 String?       @unique
  
  // Timestamps
  processingStartedAt   DateTime?
  processingCompletedAt DateTime?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt
  
  chatMessages          ChatMessage[]
}

model ChatMessage {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(...)
  role      String   // "user" | "assistant"
  content   String
  createdAt DateTime @default(now())
}
```

---

## Real-time Communication

### Socket.io Events

```typescript
// SERVER → CLIENT Events
──────────────────────────

'code-updated'
  Payload: { code: string, projectId: string }
  When: After AI generates/modifies code
  Handler: Updates Zustand store, triggers LivePreview refresh

'job-progress'
  Payload: { jobId: string, progress: number, stage: string }
  When: During long-running jobs
  Handler: Updates progress indicator in UI

'job-completed'
  Payload: { jobId: string, result: any }
  When: Job finished successfully
  Handler: Final UI update

'job-failed'
  Payload: { jobId: string, error: string }
  When: Job encountered error
  Handler: Shows error message


// CLIENT → SERVER Events
──────────────────────────

'join-project'
  Payload: { projectId: string }
  When: Client opens a project
  Handler: Adds socket to project room

'leave-project'
  Payload: { projectId: string }
  When: Client leaves project
  Handler: Removes socket from room
```

### Socket Flow Diagram

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Server    │
│  (Browser)  │                    │  (Express)  │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  ─── connect() ───────────────▶  │
       │                                  │
       │  ─── join-project ────────────▶  │ socket.join(projectId)
       │      { projectId: "abc" }        │
       │                                  │
       │                                  │ [User requests change]
       │                                  │ [Worker processes...]
       │                                  │
       │  ◀─── code-updated ────────────  │ io.to(projectId).emit()
       │       { code: "..." }            │
       │                                  │
       │  [LivePreview updates]           │
       │                                  │
```

---

## Frontend Architecture

### State Management (Zustand)

```typescript
// useProjectStore.ts - Global project state
──────────────────────────────────────────

interface ProjectState {
  // Current Project
  projectId: string | null;
  generatedCode: string | null;
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';
  
  // Settings
  settings: {
    codeType: 'HTML' | 'REACT';
    framework: 'VANILLA' | 'TAILWIND';
  };
  
  // UI State
  isModifying: boolean;
  
  // Actions
  setProjectId: (id: string) => void;
  setGeneratedCode: (code: string) => void;
  setStatus: (status: Status) => void;
  reset: () => void;
}


// useEditorStore.ts - Code editor state
────────────────────────────────────────

interface EditorState {
  // Files
  files: Map<string, FileContent>;
  activeFile: string;
  
  // Actions
  initializeFromCode: (code: string, type: CodeType) => void;
  updateFile: (path: string, content: string) => void;
  setActiveFile: (path: string) => void;
}


// useExtractionHistory.ts - Undo/revert state
──────────────────────────────────────────────

interface ExtractionHistoryState {
  // Per-project history
  history: Map<string, ExtractionEntry[]>;
  
  // Actions
  addExtraction: (projectId: string, entry: ExtractionEntry) => void;
  revertExtraction: (projectId: string, versionId: number) => void;
  getExtractions: (projectId: string) => ExtractionEntry[];
}
```

### Component Hierarchy

```
App (layout.tsx)
└── Page (page.tsx)
    ├── UploadZone              # Image upload dropzone
    │   └── [Handles drag & drop, file selection]
    │
    └── Workspace               # Main workspace (shown after generation)
        │
        ├── ChatPanel (left)    # AI chat assistant
        │   ├── ChatHeader
        │   ├── QuickActions
        │   ├── ChatHistory
        │   └── ChatInput
        │
        └── MainPanel (right)
            │
            ├── TopBar
            │   ├── ProjectInfo
            │   ├── TabSwitcher (Code/Preview)
            │   └── ActionButtons (Save, Copy, Download)
            │
            └── ContentArea
                │
                ├── CodeView (activeTab === 'code')
                │   └── CodeViewerWithTabs
                │       ├── FileTabs
                │       └── MonacoEditor
                │
                └── PreviewView (activeTab === 'preview')
                    ├── ViewportToolbar (Desktop/Tablet/Mobile)
                    ├── InspectorToggle
                    ├── BrowserFrame
                    │   └── LivePreview (iframe)
                    └── InspectorPanel (optional)
                        ├── ElementInfo
                        ├── LayoutSection
                        ├── StylesSection
                        └── ExtractComponent
                            └── ExtractComponentModal
```

---

## Key Features

### 1. Multi-Provider AI Support

```typescript
// Supported AI Providers (configured via .env)

AI_PROVIDER=anthropic  // or 'openai' or 'gemini'

// Provider-specific settings
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-pro
```

### 2. Live Preview with Inspector Mode

```
┌─────────────────────────────────────────────────────────┐
│  [Desktop] [Tablet] [Mobile]    [🔍 Inspector]          │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────┐  │
│  │                         │  │  INSPECTOR          │  │
│  │    Live Preview         │  │  ───────────        │  │
│  │    (iframe)             │  │  Element: <div>     │  │
│  │                         │  │  Class: card        │  │
│  │    Click any element    │  │  Size: 300x200     │  │
│  │    to inspect           │  │                     │  │
│  │                         │  │  [Extract Component]│  │
│  │                         │  │                     │  │
│  └─────────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Inspector Mode:
  - Crosshair cursor on preview
  - Blue highlight on hover
  - Click to select element
  - PostMessage communication between iframe and parent
```

### 3. File Tab System

```
┌─────────────────────────────────────────────────────────┐
│  [index.html ×]  [styles.css ×]  [+]                    │
├─────────────────────────────────────────────────────────┤
│  1 │ <!DOCTYPE html>                                    │
│  2 │ <html lang="en">                                   │
│  3 │ <head>                                             │
│  4 │   <link rel="stylesheet" href="styles.css">       │
│  5 │ </head>                                            │
│  6 │ <body>                                             │
│  7 │   ...                                              │
└─────────────────────────────────────────────────────────┘

Features:
  - Monaco Editor (VS Code engine)
  - Syntax highlighting
  - Auto-completion
  - Multi-file support
  - Changes sync to preview in real-time
```

---

## Environment Variables

```bash
# apps/api/.env

# Database
DATABASE_URL="file:./dev.db"

# AI Provider (anthropic | openai | gemini)
AI_PROVIDER=anthropic

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# OpenAI (alternative)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Google Gemini (alternative)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-pro

# Redis (for BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# Server
PORT=3001
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:3000
```

---

## Running the Project

```bash
# Install dependencies
npm install

# Setup database
cd apps/api
npx prisma migrate dev
npx prisma generate

# Start development servers (from root)
npm run dev

# This starts:
#   - API server: http://localhost:3001
#   - Web app: http://localhost:3000

# Run visual fidelity check
npm run visual-check -- --ref original.png --gen generated.png --threshold 0.90

# Run tests
npm test
```

---

## Summary

NEURON is a sophisticated full-stack application that:

1. **Accepts UI images** via drag-and-drop upload
2. **Processes them through AI vision models** (Claude/GPT-4/Gemini)
3. **Generates production-ready code** (HTML/React + Tailwind)
4. **Provides real-time preview** with responsive viewports
5. **Enables iterative refinement** through natural language chat
6. **Extracts reusable components** from repeating patterns
7. **Ensures visual fidelity** through automated comparison

The architecture follows modern best practices:
- **Monorepo** with Turborepo for efficient builds
- **Type-safe** end-to-end with TypeScript + Zod
- **Real-time** updates via Socket.io
- **Async job processing** with BullMQ
- **State management** with Zustand
- **Database access** with Prisma ORM

---

*Generated for NEURON v1.0.0*
