export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const API_ENDPOINTS = {
  generate: `${API_BASE_URL}/api/generate`,
  project: (id: string) => `${API_BASE_URL}/api/project/${id}`,
  projectList: `${API_BASE_URL}/api/project`,
  applyChange: (id: string) => `${API_BASE_URL}/api/project/${id}/apply-change`,
  chatHistory: (id: string) => `${API_BASE_URL}/api/project/${id}/chat`,
  addChatMessage: (id: string) => `${API_BASE_URL}/api/project/${id}/chat`,
  health: `${API_BASE_URL}/api/health`,
  // Component Extraction endpoints
  extractCandidates: (id: string, nodeId?: string) => 
    `${API_BASE_URL}/api/project/${id}/extract-candidates${nodeId ? `?node=${nodeId}` : ''}`,
  extractComponent: (id: string) => `${API_BASE_URL}/api/project/${id}/extract-component`,
  applyExtraction: (id: string) => `${API_BASE_URL}/api/project/${id}/apply-extraction`,
  revertExtraction: (id: string) => `${API_BASE_URL}/api/project/${id}/revert-extraction`,
} as const;

export const APP_CONFIG = {
  name: 'NEURON',
  description: 'Transform images into production-ready code with AI',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  pollInterval: 1000, // 1 second
  maxPollAttempts: 60, // 60 seconds max
} as const;
