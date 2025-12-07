# NEURON Web App

Modern Next.js 14 frontend for the NEURON Image-to-Code AI application.

## Features

- 🎨 **Dark Mode UI** - Beautiful Vercel-inspired design
- 📤 **Drag & Drop Upload** - Intuitive image upload experience
- ⚡ **Real-time Processing** - Live updates via polling
- 💻 **Monaco Code Editor** - Professional code viewing with syntax highlighting
- 📱 **Responsive Design** - Works on all devices
- 🎯 **Zustand State Management** - Clean and performant state handling

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Icons**: Lucide React
- **Editor**: Monaco Editor (VS Code editor)

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 10.0.0
- Running API server (see `apps/api`)

### Installation

```bash
# From the root directory
npm install

# Or from web directory
cd apps/web
npm install
```

### Environment Variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Development

```bash
# From root
npm run dev:web

# Or from web directory
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with dark mode
│   ├── page.tsx            # Home page with Hero + Workspace
│   └── globals.css         # Global styles
├── components/
│   ├── UploadZone.tsx      # Drag & drop upload component
│   ├── CodeViewer.tsx      # Monaco editor with controls
│   └── Workspace.tsx       # Split-screen workspace
├── store/
│   └── useProjectStore.ts  # Zustand state management
└── lib/
    └── config.ts           # API endpoints & configuration
```

## Components

### UploadZone

Handles image uploads with drag & drop support:
- File validation (size, type)
- Base64 conversion
- API communication
- Status polling

### CodeViewer

Monaco-based code editor with:
- Syntax highlighting
- Copy to clipboard
- Download code
- Preview mode
- Fullscreen support

### Workspace

Split-screen view showing:
- Original image preview
- Generated code editor
- Status indicators
- Processing feedback

## State Management

Using Zustand for simple, performant state:

```typescript
const { 
  status,           // 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  imagePreview,     // Preview URL
  generatedCode,    // AI-generated code
  startUpload,      // Start upload workflow
  reset,            // Clear state
} = useProjectStore();
```

## Styling

Dark mode Tailwind theme with:
- Custom color palette
- Gradient effects
- Smooth animations
- Glass morphism effects

## API Integration

Communicates with the Express backend:

- `POST /api/generate` - Upload image
- `GET /api/project/:id` - Get project status/code
- Polling mechanism for real-time updates

## Build

```bash
npm run build
npm run start
```

## License

MIT
