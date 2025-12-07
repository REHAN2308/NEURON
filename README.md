# NEURON - Image-to-Code AI Application

A production-ready monorepo for transforming images/designs into production-ready code using AI Vision models.

## 🌟 Features

- **AI-Powered Code Generation**: Uses Claude 3.5 Sonnet, Gemini 1.5 Pro, or GPT-4 Vision
- **React + Tailwind Output**: Generates pixel-perfect React components with Tailwind CSS
- **Background Processing**: BullMQ-based job queue for reliable async processing
- **Modern UI**: Dark-mode interface inspired by Vercel's design
- **Real-time Status Updates**: Track generation progress in real-time
- **Code Preview**: Monaco editor with syntax highlighting and copy/download features

## Project Structure

```
neuron/
├── apps/
│   ├── web/                    # Next.js 14 frontend (App Router)
│   │   ├── src/
│   │   │   ├── app/           # App router pages
│   │   │   ├── components/    # React components
│   │   │   ├── store/         # Zustand state management
│   │   │   └── lib/           # Utilities
│   │   └── ...
│   └── api/                    # Express.js backend
│       ├── prisma/            # Database schema
│       ├── src/
│       │   ├── routes/        # API endpoints
│       │   ├── workers/       # AI processing worker
│       │   ├── queues/        # BullMQ job queue
│       │   ├── services/      # Business logic
│       │   ├── middleware/    # Express middleware
│       │   ├── lib/           # Shared utilities
│       │   └── types/         # TypeScript types
│       └── ...
├── packages/
│   └── ui/                     # Shared UI components
├── package.json                # Root workspace configuration
├── turbo.json                  # Turborepo configuration
└── README.md
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand, Monaco Editor
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, BullMQ
- **Database**: SQLite (dev) / PostgreSQL (production)
- **Queue**: Redis + BullMQ
- **AI**: Anthropic Claude / Google Gemini / OpenAI GPT-4 Vision
- **Build System**: Turborepo
- **Package Manager**: npm workspaces

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 10.0.0
- Redis (for job queue)
- AI API Key (Anthropic, Google, or OpenAI)

### Installation

```bash
# Install all dependencies from the root
npm install

# Setup the database
cd apps/api
npx prisma db push
```

### Configuration

Copy the `.env.example` to `.env` in the `apps/api` folder:

```bash
cp apps/api/.env.example apps/api/.env
```

Configure your AI provider:

```env
# Choose your AI provider: anthropic, gemini, openai, or mock
AI_PROVIDER=anthropic

# Add your API key
ANTHROPIC_API_KEY=sk-ant-...
# or
GEMINI_API_KEY=...
# or
OPENAI_API_KEY=sk-...
```

### Running Redis

**Windows (using Docker):**
```bash
docker run -d -p 6379:6379 redis
```

**macOS (using Homebrew):**
```bash
brew install redis
brew services start redis
```

### Development

```bash
# Run all apps in development mode
npm run dev

# Run only the web app
npm run dev:web

# Run only the API
npm run dev:api
```

### Building

```bash
# Build all apps
npm run build

# Build individual apps
npm run build:web
npm run build:api
```

## Architecture

### How It Works

1. **Upload**: User uploads an image/screenshot of a design
2. **Queue**: Image is saved and a job is added to the BullMQ queue
3. **Process**: Worker picks up the job and calls the Vision AI API
4. **Generate**: AI analyzes the image and generates React + Tailwind code
5. **Store**: Generated code is saved to the database
6. **Display**: User sees the generated code in the Monaco editor

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/health/ready` | Readiness check |
| POST | `/api/generate` | Upload image and start code generation |
| GET | `/api/project/:id` | Get project status and generated code |
| GET | `/api/project/:id/status` | Get project status only |

### Worker (`apps/api/src/workers/worker.ts`)

The worker is the "brain" of the application. It:

- Receives jobs from the BullMQ queue
- Reads uploaded images and converts to base64
- Sends images to the configured Vision AI with specialized prompts
- Parses and cleans the generated code
- Updates the database with results

**Supported AI Providers:**
- **Anthropic Claude 3.5 Sonnet** (Recommended)
- **Google Gemini 1.5 Pro**
- **OpenAI GPT-4 Vision** (Coming soon)
- **Mock** (For development without API keys)

## Apps

### Web (`apps/web`)

Next.js 14 application with:
- App Router architecture
- TypeScript support
- Tailwind CSS styling
- Zustand state management
- Monaco Editor for code display
- Shared UI components from `@neuron/ui`

Runs on: http://localhost:3000

### API (`apps/api`)

Express.js backend with:
- TypeScript
- Prisma ORM with SQLite/PostgreSQL
- BullMQ job queue
- REST API structure
- CORS and security middleware
- Multer for file uploads

Runs on: http://localhost:3001

## Packages

### UI (`packages/ui`)

Shared React component library including:
- Button component
- Card component
- More components can be added as needed

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all apps for production |
| `npm run lint` | Lint all apps |
| `npm run clean` | Clean all build outputs and node_modules |

## Environment Variables

### API (`apps/api/.env`)

```env
# Server
PORT=3001
NODE_ENV=development
API_BASE_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000

# Database
DATABASE_URL="file:./dev.db"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# AI Provider (anthropic, gemini, openai, mock)
AI_PROVIDER=mock
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=

# Worker
WORKER_CONCURRENCY=3
```

## License

MIT
