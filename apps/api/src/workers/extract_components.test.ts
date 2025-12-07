/**
 * Unit Tests for Component Extraction Module
 * 
 * Run with: npx vitest run extract_components.test.ts
 * Or: npm test -- extract_components
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  findRepeatedStructures,
  generateComponentFiles,
  findClustersForNode,
  sanitizeComponentName,
  toPascalCase,
  type LayoutSpec,
  type RepeatCluster,
} from './extract_components.js';

// ============================================
// Test Fixtures
// ============================================

const createMockLayoutSpec = (): LayoutSpec => ({
  page: {
    background: '#ffffff',
    maxWidth: 1200,
    fontFamily: 'Inter, sans-serif',
    theme: {
      background: '#ffffff',
      foreground: '#1a1a1a',
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      accent: '#22d3ee',
      muted: '#64748b',
      border: '#e2e8f0',
    },
    sections: [
      {
        id: 'features-section',
        type: 'features',
        layout: 'grid',
        alignment: 'start',
        gap: '6',
        padding: '8',
        background: '#f8fafc',
        elements: [],
        children: [
          // Feature Card 1
          {
            id: 'feature-card-1',
            type: 'card',
            layout: 'column',
            alignment: 'start',
            gap: '4',
            padding: '6',
            elements: [
              {
                type: 'icon',
                id: 'icon-1',
                icon: 'star',
              },
              {
                type: 'heading',
                id: 'heading-1',
                text: 'Feature One',
                textRole: 'title',
              },
              {
                type: 'paragraph',
                id: 'body-1',
                text: 'Description of feature one goes here.',
                textRole: 'body',
              },
            ],
          },
          // Feature Card 2 (similar structure)
          {
            id: 'feature-card-2',
            type: 'card',
            layout: 'column',
            alignment: 'start',
            gap: '4',
            padding: '6',
            elements: [
              {
                type: 'icon',
                id: 'icon-2',
                icon: 'zap',
              },
              {
                type: 'heading',
                id: 'heading-2',
                text: 'Feature Two',
                textRole: 'title',
              },
              {
                type: 'paragraph',
                id: 'body-2',
                text: 'Description of feature two goes here.',
                textRole: 'body',
              },
            ],
          },
          // Feature Card 3 (similar structure)
          {
            id: 'feature-card-3',
            type: 'card',
            layout: 'column',
            alignment: 'start',
            gap: '4',
            padding: '6',
            elements: [
              {
                type: 'icon',
                id: 'icon-3',
                icon: 'shield',
              },
              {
                type: 'heading',
                id: 'heading-3',
                text: 'Feature Three',
                textRole: 'title',
              },
              {
                type: 'paragraph',
                id: 'body-3',
                text: 'Description of feature three goes here.',
                textRole: 'body',
              },
            ],
          },
        ],
      },
      {
        id: 'testimonials-section',
        type: 'content',
        layout: 'row',
        alignment: 'center',
        gap: '4',
        padding: '6',
        elements: [],
        children: [
          // Testimonial 1
          {
            id: 'testimonial-1',
            type: 'card',
            layout: 'column',
            alignment: 'center',
            gap: '3',
            padding: '4',
            elements: [
              {
                type: 'avatar',
                id: 'avatar-1',
              },
              {
                type: 'paragraph',
                id: 'quote-1',
                text: 'Great product! Really helped our team.',
                textRole: 'body',
              },
              {
                type: 'paragraph',
                id: 'author-1',
                text: 'John Doe, CEO',
                textRole: 'caption',
              },
            ],
          },
          // Testimonial 2
          {
            id: 'testimonial-2',
            type: 'card',
            layout: 'column',
            alignment: 'center',
            gap: '3',
            padding: '4',
            elements: [
              {
                type: 'avatar',
                id: 'avatar-2',
              },
              {
                type: 'paragraph',
                id: 'quote-2',
                text: 'Absolutely love it! Highly recommend.',
                textRole: 'body',
              },
              {
                type: 'paragraph',
                id: 'author-2',
                text: 'Jane Smith, CTO',
                textRole: 'caption',
              },
            ],
          },
        ],
      },
    ],
  },
});

// Layout with no repeating patterns
const createSingleElementLayout = (): LayoutSpec => ({
  page: {
    background: '#ffffff',
    maxWidth: 1200,
    theme: {
      background: '#ffffff',
      foreground: '#1a1a1a',
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      accent: '#22d3ee',
      muted: '#64748b',
      border: '#e2e8f0',
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        layout: 'centered',
        elements: [
          {
            type: 'heading',
            id: 'hero-title',
            text: 'Welcome',
            textRole: 'title',
          },
        ],
      },
    ],
  },
});

// ============================================
// Tests: Utility Functions
// ============================================

describe('Utility Functions', () => {
  describe('toPascalCase', () => {
    it('should convert simple strings to PascalCase', () => {
      expect(toPascalCase('feature card')).toBe('FeatureCard');
      expect(toPascalCase('my component')).toBe('MyComponent');
    });

    it('should handle already capitalized strings', () => {
      expect(toPascalCase('Feature')).toBe('Feature');
      expect(toPascalCase('FeatureCard')).toBe('Featurecard'); // Note: splits on spaces
    });

    it('should handle special characters', () => {
      expect(toPascalCase('feature-card')).toBe('FeatureCard');
      expect(toPascalCase('feature_card')).toBe('FeatureCard');
      expect(toPascalCase('feature.card')).toBe('FeatureCard');
    });

    it('should handle empty strings', () => {
      expect(toPascalCase('')).toBe('');
    });
  });

  describe('sanitizeComponentName', () => {
    it('should ensure name starts with uppercase', () => {
      expect(sanitizeComponentName('card')).toBe('Card');
      expect(sanitizeComponentName('123card')).toBe('Component123card');
    });

    it('should handle collisions with existing names', () => {
      const existing = new Set(['Card', 'Card1']);
      expect(sanitizeComponentName('card', existing)).toBe('Card2');
    });

    it('should return original if no collision', () => {
      const existing = new Set(['Button', 'Input']);
      expect(sanitizeComponentName('card', existing)).toBe('Card');
    });
  });
});

// ============================================
// Tests: findRepeatedStructures
// ============================================

describe('findRepeatedStructures', () => {
  it('should find repeated card structures', () => {
    const layout = createMockLayoutSpec();
    const clusters = findRepeatedStructures(layout);

    expect(clusters.length).toBeGreaterThan(0);
    
    // Should find feature cards cluster
    const cardCluster = clusters.find(c => 
      c.instances.some(id => id.includes('feature-card'))
    );
    expect(cardCluster).toBeDefined();
    expect(cardCluster!.instanceCount).toBeGreaterThanOrEqual(2);
  });

  it('should suggest appropriate component names', () => {
    const layout = createMockLayoutSpec();
    const clusters = findRepeatedStructures(layout);

    // All clusters should have suggested names
    for (const cluster of clusters) {
      expect(cluster.suggestedName).toBeTruthy();
      expect(cluster.suggestedName.length).toBeGreaterThan(0);
    }
  });

  it('should infer prop candidates', () => {
    const layout = createMockLayoutSpec();
    const clusters = findRepeatedStructures(layout);

    const cardCluster = clusters.find(c => 
      c.suggestedName.toLowerCase().includes('card')
    );

    if (cardCluster) {
      // Should find text props
      const textProps = cardCluster.propCandidates.filter(p => p.type === 'text');
      expect(textProps.length).toBeGreaterThan(0);
    }
  });

  it('should return empty array for layout with no repeats', () => {
    const layout = createSingleElementLayout();
    const clusters = findRepeatedStructures(layout);

    expect(clusters.length).toBe(0);
  });

  it('should sort clusters by instance count', () => {
    const layout = createMockLayoutSpec();
    const clusters = findRepeatedStructures(layout);

    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i - 1].instanceCount).toBeGreaterThanOrEqual(
        clusters[i].instanceCount
      );
    }
  });
});

// ============================================
// Tests: findClustersForNode
// ============================================

describe('findClustersForNode', () => {
  it('should find cluster containing specified node', () => {
    const layout = createMockLayoutSpec();
    const clusters = findClustersForNode(layout, 'feature-card-1');

    expect(clusters.length).toBeGreaterThanOrEqual(1);
    
    // The returned cluster should contain the specified node
    const containsNode = clusters.some(c => 
      c.instances.includes('feature-card-1') || c.sampleNodeId === 'feature-card-1'
    );
    expect(containsNode).toBe(true);
  });

  it('should return empty array for non-existent node', () => {
    const layout = createMockLayoutSpec();
    const clusters = findClustersForNode(layout, 'non-existent-node');

    expect(clusters.length).toBe(0);
  });

  it('should return empty for unique elements', () => {
    const layout = createSingleElementLayout();
    const clusters = findClustersForNode(layout, 'hero-title');

    expect(clusters.length).toBe(0);
  });
});

// ============================================
// Tests: generateComponentFiles
// ============================================

describe('generateComponentFiles', () => {
  let mockCluster: RepeatCluster;

  beforeEach(() => {
    mockCluster = {
      clusterId: 'cluster-1',
      sampleNodeId: 'feature-card-1',
      instances: ['feature-card-1', 'feature-card-2', 'feature-card-3'],
      instanceCount: 3,
      similarity: 0.85,
      suggestedName: 'FeatureCard',
      propCandidates: [
        {
          name: 'title',
          type: 'text',
          sourceNodeId: 'heading-1',
          sampleValue: 'Feature One',
          inferredFrom: 'textRole:title',
        },
        {
          name: 'body',
          type: 'text',
          sourceNodeId: 'body-1',
          sampleValue: 'Description goes here.',
          inferredFrom: 'textRole:body',
        },
        {
          name: 'icon',
          type: 'icon',
          sourceNodeId: 'icon-1',
          sampleValue: 'star',
          inferredFrom: 'icon-property',
        },
      ],
      sampleStructure: {
        id: 'feature-card-1',
        type: 'card',
        layout: 'column',
        elements: [],
      },
    };
  });

  it('should generate TypeScript component file', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', true);

    expect(patch.componentName).toBe('FeatureCard');
    expect(patch.files.length).toBeGreaterThan(0);
    
    const mainFile = patch.files[0];
    expect(mainFile.path).toContain('.tsx');
    expect(mainFile.language).toBe('tsx');
    expect(mainFile.content).toContain('interface FeatureCardProps');
    expect(mainFile.content).toContain('export default function FeatureCard');
  });

  it('should generate JavaScript component file when TypeScript disabled', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', false);

    const mainFile = patch.files[0];
    expect(mainFile.path).toContain('.jsx');
    expect(mainFile.language).toBe('jsx');
    expect(mainFile.content).not.toContain('interface');
  });

  it('should include prop parameters in component', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', true);

    const content = patch.files[0].content;
    expect(content).toContain('title');
    expect(content).toContain('body');
    expect(content).toContain('icon');
  });

  it('should generate replacements for all instances', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', true);

    expect(patch.replacements.length).toBe(mockCluster.instances.length);
    
    for (const replacement of patch.replacements) {
      expect(replacement.nodeId).toBeTruthy();
      expect(replacement.componentUsage).toContain('FeatureCard');
    }
  });

  it('should include diff preview', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', true);

    expect(patch.diff).toBeDefined();
    expect(patch.diff.before).toBeTruthy();
    expect(patch.diff.after).toBeTruthy();
    expect(patch.diff.after).toContain('FeatureCard');
  });

  it('should sanitize component name', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'my feature card!', true);

    expect(patch.componentName).toBe('MyFeatureCard');
    expect(patch.files[0].content).toContain('MyFeatureCard');
  });

  it('should include NEURON comment in generated file', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', true);

    expect(patch.files[0].content).toContain('Generated by NEURON');
  });

  it('should place file in Extracted folder', () => {
    const layout = createMockLayoutSpec();
    const patch = generateComponentFiles(mockCluster, layout, 'FeatureCard', true);

    expect(patch.files[0].path).toContain('Extracted');
    expect(patch.files[0].path).toContain('FeatureCard');
  });
});

// ============================================
// Integration Test Stub
// ============================================

describe('Integration Test Stub', () => {
  it('should simulate full extraction workflow', async () => {
    // 1. Create mock layout
    const layout = createMockLayoutSpec();

    // 2. Find clusters
    const clusters = findRepeatedStructures(layout);
    expect(clusters.length).toBeGreaterThan(0);

    // 3. Select a cluster (simulating user selection)
    const selectedCluster = clusters[0];
    expect(selectedCluster.instanceCount).toBeGreaterThanOrEqual(2);

    // 4. Generate component files
    const patch = generateComponentFiles(
      selectedCluster,
      layout,
      'ExtractedComponent',
      true
    );

    // 5. Verify patch structure
    expect(patch.componentName).toBe('ExtractedComponent');
    expect(patch.files.length).toBeGreaterThan(0);
    expect(patch.replacements.length).toBe(selectedCluster.instanceCount);
    expect(patch.diff.before).toBeTruthy();
    expect(patch.diff.after).toBeTruthy();

    // 6. Verify generated file is valid TypeScript/React
    const content = patch.files[0].content;
    expect(content).toContain('import React');
    expect(content).toContain('export default function');
    expect(content).toContain('return');
  });
});
