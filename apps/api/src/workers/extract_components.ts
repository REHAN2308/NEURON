/**
 * Component Extraction Module for NEURON
 * 
 * Detects repeating UI blocks from layout JSON and generates
 * reusable React components with props.
 * 
 * @module extract_components
 */

// ============================================
// Types
// ============================================

/** Layout element from the layout analyzer */
export interface LayoutElement {
  type: string;
  id?: string;
  text?: string;
  textRole?: string;
  variant?: string;
  size?: string;
  icon?: string;
  children?: LayoutElement[];
  styles?: Record<string, string>;
  position?: string;
}

/** Layout section containing elements */
export interface LayoutSection {
  id: string;
  type: string;
  layout: string;
  position?: string;
  alignment?: string;
  gap?: string;
  padding?: string;
  background?: string;
  border?: string;
  elements: LayoutElement[];
  children?: LayoutSection[];
}

/** Full layout specification */
export interface LayoutSpec {
  page: {
    background: string;
    maxWidth: number;
    fontFamily?: string;
    theme: Record<string, string>;
    sections: LayoutSection[];
  };
  metadata?: Record<string, unknown>;
}

/** Candidate prop for extraction */
export interface PropCandidate {
  name: string;
  type: 'text' | 'image' | 'href' | 'icon' | 'boolean';
  sourceNodeId: string;
  sampleValue: string;
  inferredFrom: string; // e.g., "textRole:title", "type:image"
}

/** Cluster of repeated structures */
export interface RepeatCluster {
  clusterId: string;
  sampleNodeId: string;
  instances: string[];
  instanceCount: number;
  similarity: number;
  suggestedName: string;
  propCandidates: PropCandidate[];
  sampleStructure: LayoutElement | LayoutSection;
}

/** Generated component file */
export interface GeneratedFile {
  path: string;
  content: string;
  language: 'tsx' | 'jsx' | 'css';
}

/** Replacement instruction for instances */
export interface InstanceReplacement {
  nodeId: string;
  componentUsage: string;
  propValues: Record<string, string>;
  originalCode?: string;
}

/** Patch suggestion returned to frontend */
export interface PatchSuggestion {
  componentName: string;
  files: GeneratedFile[];
  replacements: InstanceReplacement[];
  diff: {
    before: string;
    after: string;
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a unique ID for nodes
 */
function generateNodeId(prefix: string = 'n'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert string to PascalCase for component names
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Sanitize component name and ensure it's valid
 */
export function sanitizeComponentName(name: string, existingNames: Set<string> = new Set()): string {
  let sanitized = toPascalCase(name);
  
  // Ensure it starts with uppercase letter
  if (!/^[A-Z]/.test(sanitized)) {
    sanitized = 'Component' + sanitized;
  }
  
  // Handle collisions by appending numeric suffix
  let finalName = sanitized;
  let counter = 1;
  while (existingNames.has(finalName)) {
    finalName = `${sanitized}${counter}`;
    counter++;
  }
  
  return finalName;
}

/**
 * Calculate structural similarity between two elements (0-1)
 */
function calculateSimilarity(el1: LayoutElement, el2: LayoutElement): number {
  let score = 0;
  let factors = 0;
  
  // Same type is critical
  if (el1.type === el2.type) {
    score += 3;
  }
  factors += 3;
  
  // Same text role
  if (el1.textRole && el2.textRole && el1.textRole === el2.textRole) {
    score += 1;
  }
  factors += 1;
  
  // Similar child count
  const children1 = el1.children?.length || 0;
  const children2 = el2.children?.length || 0;
  if (children1 === children2) {
    score += 2;
  } else if (Math.abs(children1 - children2) <= 1) {
    score += 1;
  }
  factors += 2;
  
  // Compare styles/classes overlap
  const styles1 = Object.keys(el1.styles || {});
  const styles2 = Object.keys(el2.styles || {});
  const sharedStyles = styles1.filter(s => styles2.includes(s));
  if (styles1.length > 0 || styles2.length > 0) {
    const overlap = sharedStyles.length / Math.max(styles1.length, styles2.length, 1);
    score += overlap * 2;
  }
  factors += 2;
  
  // Similar variant
  if (el1.variant === el2.variant) {
    score += 1;
  }
  factors += 1;
  
  // Similar size
  if (el1.size === el2.size) {
    score += 1;
  }
  factors += 1;
  
  return score / factors;
}

/**
 * Get a structural fingerprint for an element
 */
function getStructureFingerprint(el: LayoutElement | LayoutSection): string {
  const parts: string[] = [];
  
  parts.push(`type:${el.type}`);
  
  if ('layout' in el) {
    parts.push(`layout:${el.layout}`);
  }
  
  if ('textRole' in el && el.textRole) {
    parts.push(`textRole:${el.textRole}`);
  }
  
  if ('variant' in el && el.variant) {
    parts.push(`variant:${el.variant}`);
  }
  
  // Count children
  const childCount = ('children' in el && el.children) ? el.children.length : 
                     ('elements' in el && el.elements) ? el.elements.length : 0;
  parts.push(`children:${childCount}`);
  
  // Add child type summary
  if ('children' in el && el.children) {
    const childTypes = el.children.map(c => c.type).sort().join(',');
    parts.push(`childTypes:${childTypes}`);
  }
  if ('elements' in el && el.elements) {
    const elementTypes = el.elements.map(e => e.type).sort().join(',');
    parts.push(`elementTypes:${elementTypes}`);
  }
  
  return parts.join('|');
}

/**
 * Flatten layout into all elements with paths
 */
function flattenLayout(
  layout: LayoutSpec,
  includeNodeIds: boolean = true
): Map<string, { element: LayoutElement | LayoutSection; path: string[] }> {
  const result = new Map<string, { element: LayoutElement | LayoutSection; path: string[] }>();
  let nodeCounter = 0;
  
  function traverse(
    node: LayoutElement | LayoutSection,
    path: string[]
  ): void {
    const nodeId = node.id || `n-${nodeCounter++}`;
    
    // Assign ID if missing
    if (!node.id && includeNodeIds) {
      node.id = nodeId;
    }
    
    result.set(nodeId, { element: node, path: [...path, nodeId] });
    
    // Traverse children
    if ('children' in node && node.children) {
      for (const child of node.children) {
        traverse(child, [...path, nodeId]);
      }
    }
    if ('elements' in node && node.elements) {
      for (const element of node.elements) {
        traverse(element, [...path, nodeId]);
      }
    }
  }
  
  // Traverse all sections
  for (const section of layout.page.sections) {
    traverse(section, ['page']);
  }
  
  return result;
}

// ============================================
// Core Functions
// ============================================

/**
 * Find repeated structures in a layout JSON
 * 
 * Heuristic clustering:
 * - Same tag/type
 * - Similar child count
 * - Similar bbox widths (±10%) - approximated by styles
 * - Top-3 shared class tokens
 */
export function findRepeatedStructures(layoutJson: LayoutSpec): RepeatCluster[] {
  const clusters: RepeatCluster[] = [];
  const nodeMap = flattenLayout(layoutJson);
  
  // Group by structure fingerprint
  const fingerprintGroups = new Map<string, string[]>();
  
  for (const [nodeId, { element }] of nodeMap) {
    const fingerprint = getStructureFingerprint(element);
    
    if (!fingerprintGroups.has(fingerprint)) {
      fingerprintGroups.set(fingerprint, []);
    }
    fingerprintGroups.get(fingerprint)!.push(nodeId);
  }
  
  // Filter groups with at least 2 similar nodes
  for (const [_fingerprint, nodeIds] of fingerprintGroups) {
    if (nodeIds.length < 2) continue;
    
    // Calculate pairwise similarity to refine clusters
    const refinedClusters: string[][] = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < nodeIds.length; i++) {
      if (processed.has(nodeIds[i])) continue;
      
      const cluster = [nodeIds[i]];
      processed.add(nodeIds[i]);
      
      const el1 = nodeMap.get(nodeIds[i])!.element as LayoutElement;
      
      for (let j = i + 1; j < nodeIds.length; j++) {
        if (processed.has(nodeIds[j])) continue;
        
        const el2 = nodeMap.get(nodeIds[j])!.element as LayoutElement;
        const similarity = calculateSimilarity(el1, el2);
        
        if (similarity >= 0.7) { // 70% similarity threshold
          cluster.push(nodeIds[j]);
          processed.add(nodeIds[j]);
        }
      }
      
      if (cluster.length >= 2) {
        refinedClusters.push(cluster);
      }
    }
    
    // Create cluster objects
    for (const cluster of refinedClusters) {
      const sampleNode = nodeMap.get(cluster[0])!;
      const element = sampleNode.element;
      
      // Infer suggested name
      const suggestedName = inferComponentName(element);
      
      // Infer prop candidates
      const propCandidates = inferPropCandidates(element);
      
      clusters.push({
        clusterId: generateNodeId('cluster'),
        sampleNodeId: cluster[0],
        instances: cluster,
        instanceCount: cluster.length,
        similarity: 0.8, // Average similarity
        suggestedName,
        propCandidates,
        sampleStructure: element,
      });
    }
  }
  
  // Sort by instance count (most repeated first)
  return clusters.sort((a, b) => b.instanceCount - a.instanceCount);
}

/**
 * Infer a component name from an element
 */
function inferComponentName(element: LayoutElement | LayoutSection): string {
  const type = element.type;
  
  // Map common types to component names
  const typeNameMap: Record<string, string> = {
    card: 'Card',
    button: 'Button',
    input: 'Input',
    image: 'ImageBlock',
    avatar: 'Avatar',
    badge: 'Badge',
    link: 'Link',
    icon: 'Icon',
    heading: 'Heading',
    paragraph: 'TextBlock',
    list: 'ListItem',
    features: 'FeatureCard',
    hero: 'HeroSection',
    navigation: 'NavItem',
  };
  
  if (typeNameMap[type]) {
    return typeNameMap[type];
  }
  
  // Check for text role hints
  if ('textRole' in element && element.textRole) {
    const roleMap: Record<string, string> = {
      title: 'TitleBlock',
      subtitle: 'SubtitleBlock',
      body: 'BodyText',
      caption: 'Caption',
      label: 'Label',
    };
    if (roleMap[element.textRole]) {
      return roleMap[element.textRole];
    }
  }
  
  // Default: capitalize type
  return toPascalCase(type) + 'Component';
}

/**
 * Infer prop candidates from an element
 */
function inferPropCandidates(element: LayoutElement | LayoutSection): PropCandidate[] {
  const props: PropCandidate[] = [];
  const nodeId = element.id || 'unknown';
  
  // Check for text content
  if ('text' in element && element.text) {
    const textRole = element.textRole || 'body';
    const propName = textRole === 'title' ? 'title' :
                     textRole === 'subtitle' ? 'subtitle' :
                     textRole === 'label' ? 'label' :
                     textRole === 'caption' ? 'caption' : 'body';
    
    props.push({
      name: propName,
      type: 'text',
      sourceNodeId: nodeId,
      sampleValue: element.text,
      inferredFrom: `textRole:${textRole}`,
    });
  }
  
  // Check for images
  if (element.type === 'image' || element.type === 'avatar') {
    props.push({
      name: element.type === 'avatar' ? 'avatarSrc' : 'imageSrc',
      type: 'image',
      sourceNodeId: nodeId,
      sampleValue: '/placeholder.png',
      inferredFrom: `type:${element.type}`,
    });
  }
  
  // Check for icons
  if ('icon' in element && element.icon) {
    props.push({
      name: 'icon',
      type: 'icon',
      sourceNodeId: nodeId,
      sampleValue: element.icon,
      inferredFrom: 'icon-property',
    });
  }
  
  // Check for links/buttons
  if (element.type === 'link' || element.type === 'button') {
    props.push({
      name: 'href',
      type: 'href',
      sourceNodeId: nodeId,
      sampleValue: '#',
      inferredFrom: `type:${element.type}`,
    });
    
    if ('text' in element && element.text) {
      props.push({
        name: 'label',
        type: 'text',
        sourceNodeId: nodeId,
        sampleValue: element.text,
        inferredFrom: 'button/link-text',
      });
    }
  }
  
  // Recursively check children for props
  if ('children' in element && element.children) {
    for (const child of element.children) {
      const childProps = inferPropCandidates(child);
      // Add unique props from children
      for (const prop of childProps) {
        if (!props.some(p => p.name === prop.name)) {
          props.push(prop);
        }
      }
    }
  }
  
  if ('elements' in element && element.elements) {
    for (const el of element.elements) {
      const elProps = inferPropCandidates(el);
      for (const prop of elProps) {
        if (!props.some(p => p.name === prop.name)) {
          props.push(prop);
        }
      }
    }
  }
  
  return props;
}

/**
 * Generate component files from a cluster
 */
export function generateComponentFiles(
  cluster: RepeatCluster,
  layoutJson: LayoutSpec,
  componentName: string,
  useTypeScript: boolean = true
): PatchSuggestion {
  const finalName = sanitizeComponentName(componentName);
  const ext = useTypeScript ? 'tsx' : 'jsx';
  const nodeMap = flattenLayout(layoutJson);
  
  // Build prop types
  const propTypes: string[] = [];
  const propDefaults: string[] = [];
  
  for (const prop of cluster.propCandidates) {
    const tsType = prop.type === 'boolean' ? 'boolean' : 'string';
    propTypes.push(`  ${prop.name}${prop.type === 'boolean' ? '?' : ''}: ${tsType};`);
    
    if (prop.type === 'text') {
      propDefaults.push(`${prop.name} = "${prop.sampleValue}"`);
    } else if (prop.type === 'image' || prop.type === 'href') {
      propDefaults.push(`${prop.name} = "${prop.sampleValue}"`);
    } else if (prop.type === 'icon') {
      propDefaults.push(`${prop.name} = "${prop.sampleValue}"`);
    }
  }
  
  // Generate component JSX based on sample structure
  const componentJsx = generateComponentJsx(cluster.sampleStructure, cluster.propCandidates);
  
  // Build type definition
  const typeDefinition = useTypeScript ? `
interface ${finalName}Props {
${propTypes.join('\n')}
}
` : '';
  
  // Build props destructuring
  const propsDestructure = cluster.propCandidates
    .map(p => {
      if (p.type === 'text' || p.type === 'image' || p.type === 'href' || p.type === 'icon') {
        return `${p.name} = "${p.sampleValue}"`;
      }
      return p.name;
    })
    .join(', ');
  
  // Generate component file content
  const componentContent = `// Generated by NEURON: Component extracted from node ${cluster.sampleNodeId}
// Cluster contains ${cluster.instanceCount} instances

import React from 'react';
${typeDefinition}
export default function ${finalName}({ ${propsDestructure} }${useTypeScript ? `: ${finalName}Props` : ''}) {
  return (
${componentJsx}
  );
}

// Export named for tree-shaking
export { ${finalName} };
`;

  // Generate replacements for each instance
  const replacements: InstanceReplacement[] = [];
  
  for (const instanceId of cluster.instances) {
    const instance = nodeMap.get(instanceId);
    if (!instance) continue;
    
    // Extract prop values from this instance
    const propValues: Record<string, string> = {};
    extractPropValues(instance.element, cluster.propCandidates, propValues);
    
    // Build component usage string
    const propsStr = Object.entries(propValues)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    
    const componentUsage = `<${finalName} ${propsStr} />`;
    
    replacements.push({
      nodeId: instanceId,
      componentUsage,
      propValues,
      originalCode: generateOriginalCode(instance.element),
    });
  }
  
  // Build diff preview
  const beforeCode = replacements[0]?.originalCode || '<!-- Original node -->';
  const afterCode = replacements[0]?.componentUsage || `<${finalName} />`;
  
  return {
    componentName: finalName,
    files: [
      {
        path: `src/components/Extracted/${finalName}.${ext}`,
        content: componentContent,
        language: ext as 'tsx' | 'jsx',
      },
    ],
    replacements,
    diff: {
      before: beforeCode,
      after: afterCode,
    },
  };
}

/**
 * Generate JSX for the component based on structure
 */
function generateComponentJsx(
  element: LayoutElement | LayoutSection,
  propCandidates: PropCandidate[],
  indent: number = 4
): string {
  const spaces = ' '.repeat(indent);
  const lines: string[] = [];
  
  // Determine tag based on type
  const tagMap: Record<string, string> = {
    card: 'article',
    button: 'button',
    link: 'a',
    heading: 'h3',
    paragraph: 'p',
    image: 'img',
    avatar: 'img',
    icon: 'span',
    list: 'ul',
    badge: 'span',
    input: 'input',
    features: 'div',
    section: 'section',
    header: 'header',
    footer: 'footer',
    navigation: 'nav',
  };
  
  const tag = tagMap[element.type] || 'div';
  
  // Build className from styles
  const classes: string[] = [];
  
  if ('layout' in element) {
    if (element.layout === 'row') classes.push('flex flex-row');
    if (element.layout === 'column') classes.push('flex flex-col');
    if (element.layout === 'grid') classes.push('grid');
    if (element.layout === 'centered') classes.push('flex items-center justify-center');
  }
  
  if ('alignment' in element && element.alignment) {
    if (element.alignment === 'center') classes.push('items-center');
    if (element.alignment === 'start') classes.push('items-start');
    if (element.alignment === 'end') classes.push('items-end');
  }
  
  if ('gap' in element && element.gap) {
    classes.push(`gap-${element.gap}`);
  }
  
  if ('padding' in element && element.padding) {
    classes.push(`p-${element.padding}`);
  }
  
  // Add type-specific classes
  if (element.type === 'card') {
    classes.push('rounded-lg', 'border', 'bg-card', 'p-4');
  }
  if (element.type === 'button') {
    classes.push('px-4', 'py-2', 'rounded-md', 'font-medium');
    if ('variant' in element) {
      if (element.variant === 'primary') classes.push('bg-primary', 'text-white');
      if (element.variant === 'secondary') classes.push('bg-secondary', 'text-white');
      if (element.variant === 'outline') classes.push('border', 'border-current');
    }
  }
  if (element.type === 'badge') {
    classes.push('inline-flex', 'items-center', 'px-2', 'py-1', 'text-xs', 'rounded-full');
  }
  
  const classAttr = classes.length > 0 ? ` className="${classes.join(' ')}"` : '';
  
  // Handle different element types
  if (tag === 'img') {
    const imageProp = propCandidates.find(p => p.type === 'image');
    const srcProp = imageProp ? `{${imageProp.name}}` : '"/placeholder.png"';
    const altProp = propCandidates.find(p => p.name === 'title');
    const altValue = altProp ? `{${altProp.name}}` : '"Image"';
    
    lines.push(`${spaces}<${tag} src=${srcProp} alt=${altValue}${classAttr} />`);
  } else if (tag === 'a') {
    const hrefProp = propCandidates.find(p => p.type === 'href');
    const hrefValue = hrefProp ? `{${hrefProp.name}}` : '"#"';
    const labelProp = propCandidates.find(p => p.name === 'label');
    const labelValue = labelProp ? `{${labelProp.name}}` : '"Link"';
    
    lines.push(`${spaces}<${tag} href=${hrefValue}${classAttr}>${labelValue}</${tag}>`);
  } else if ('text' in element && element.text) {
    const textProp = propCandidates.find(p => p.type === 'text' && p.sourceNodeId === element.id);
    const propName = textProp?.name || 'children';
    
    lines.push(`${spaces}<${tag}${classAttr}>{${propName}}</${tag}>`);
  } else {
    // Container element with children
    lines.push(`${spaces}<${tag}${classAttr}>`);
    
    // Render children
    if ('children' in element && element.children) {
      for (const child of element.children) {
        lines.push(generateComponentJsx(child, propCandidates, indent + 2));
      }
    }
    if ('elements' in element && element.elements) {
      for (const el of element.elements) {
        lines.push(generateComponentJsx(el, propCandidates, indent + 2));
      }
    }
    
    lines.push(`${spaces}</${tag}>`);
  }
  
  return lines.join('\n');
}

/**
 * Extract prop values from an element instance
 */
function extractPropValues(
  element: LayoutElement | LayoutSection,
  propCandidates: PropCandidate[],
  values: Record<string, string>
): void {
  // Extract text values
  if ('text' in element && element.text) {
    const textProp = propCandidates.find(p => p.type === 'text');
    if (textProp && !values[textProp.name]) {
      values[textProp.name] = element.text;
    }
  }
  
  // Extract icon
  if ('icon' in element && element.icon) {
    const iconProp = propCandidates.find(p => p.type === 'icon');
    if (iconProp) {
      values[iconProp.name] = element.icon;
    }
  }
  
  // Recurse into children
  if ('children' in element && element.children) {
    for (const child of element.children) {
      extractPropValues(child, propCandidates, values);
    }
  }
  if ('elements' in element && element.elements) {
    for (const el of element.elements) {
      extractPropValues(el, propCandidates, values);
    }
  }
}

/**
 * Generate original code representation for diff
 */
function generateOriginalCode(element: LayoutElement | LayoutSection): string {
  const type = element.type;
  const id = element.id || 'unknown';
  
  let code = `<!-- Node: ${id} (${type}) -->\n`;
  code += `<div class="${type}">\n`;
  
  if ('text' in element && element.text) {
    code += `  <span>${element.text}</span>\n`;
  }
  
  if ('children' in element && element.children?.length) {
    code += `  <!-- ${element.children.length} children -->\n`;
  }
  
  code += `</div>`;
  
  return code;
}

/**
 * Find clusters that contain a specific node
 */
export function findClustersForNode(
  layoutJson: LayoutSpec,
  nodeId: string
): RepeatCluster[] {
  const allClusters = findRepeatedStructures(layoutJson);
  
  return allClusters.filter(cluster => 
    cluster.instances.includes(nodeId) || cluster.sampleNodeId === nodeId
  );
}

/**
 * Validate that a cluster still exists in the layout
 */
export function validateCluster(
  cluster: RepeatCluster,
  layoutJson: LayoutSpec
): boolean {
  const nodeMap = flattenLayout(layoutJson, false);
  
  // Check that all instances still exist
  for (const instanceId of cluster.instances) {
    if (!nodeMap.has(instanceId)) {
      return false;
    }
  }
  
  return true;
}

// ============================================
// Exports
// ============================================
export default {
  findRepeatedStructures,
  generateComponentFiles,
  findClustersForNode,
  validateCluster,
  sanitizeComponentName,
  toPascalCase,
};
