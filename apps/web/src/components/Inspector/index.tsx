// Inspector components
export { default as InspectorPanel } from './InspectorPanel';
export { default as ExtractComponentModal } from './ExtractComponentModal';

// Re-export types
export type { 
  RepeatCluster, 
  PropCandidate, 
  GeneratedFile, 
  PatchSuggestion,
  InstanceReplacement 
} from './ExtractComponentModal';

export type { ElementInfo } from './InspectorPanel';
