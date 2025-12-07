/**
 * Landing/Login Page Background Initializer
 * 
 * This utility:
 * 1. Runs only when #landing or #login wrapper exists
 * 2. Lazy-loads the background image (if using custom image)
 * 3. Adds 'animated' class to trigger CSS animation
 * 4. Removes any leftover decorative circle elements (defensive cleanup)
 * 5. Safe fallback if asset is missing
 */

// Selectors for decorative elements to remove
const DECORATIVE_SELECTORS = [
  '.circle',
  '.overlay-circle', 
  '.decor-circle',
  'svg.decor-circle',
  '[class*="decor-circle"]',
];

/**
 * Initialize the landing/login page background animation
 * Call this in useEffect on landing/login pages
 */
export function initLandingBackground(): () => void {
  // Find the wrapper element (landing, login, or generating screen)
  const wrapper = document.getElementById('landing') || document.getElementById('login') || document.getElementById('generating');
  
  if (!wrapper) {
    // Not on landing/login/generating page, do nothing
    return () => {};
  }

  // Defensive cleanup: Remove any stray decorative circles
  cleanupDecorativeElements(wrapper);

  // Check if user prefers reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (prefersReducedMotion) {
    // Don't animate, but still mark as ready
    wrapper.classList.add('reduced-motion');
    return () => {
      wrapper.classList.remove('reduced-motion');
    };
  }

  // Get the background image URL from CSS variable (if custom image is used)
  const computedStyle = getComputedStyle(document.documentElement);
  const bgUrl = computedStyle.getPropertyValue('--landing-bg-url').trim();
  
  // If using a custom image URL, lazy load it
  if (bgUrl && bgUrl.includes('url(') && !bgUrl.includes('none')) {
    const imageUrl = bgUrl.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1');
    
    // Create a new Image to preload
    const img = new Image();
    
    img.onload = () => {
      // Image loaded successfully, start animation
      wrapper.classList.add('animated');
    };
    
    img.onerror = () => {
      // Image failed to load, still add animated class
      // The CSS will fall back to the conic-gradient pattern
      console.warn('[landing-init] Background image failed to load, using fallback pattern');
      wrapper.classList.add('animated');
    };
    
    img.src = imageUrl;
  } else {
    // No custom image, using CSS gradient pattern
    // Add animated class immediately
    wrapper.classList.add('animated');
  }

  // Listen for reduced motion preference changes
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handleMotionChange = (e: MediaQueryListEvent) => {
    if (e.matches) {
      wrapper.classList.remove('animated');
      wrapper.classList.add('reduced-motion');
    } else {
      wrapper.classList.remove('reduced-motion');
      wrapper.classList.add('animated');
    }
  };
  
  motionQuery.addEventListener('change', handleMotionChange);

  // Return cleanup function
  return () => {
    wrapper.classList.remove('animated', 'reduced-motion');
    motionQuery.removeEventListener('change', handleMotionChange);
  };
}

/**
 * Remove decorative circle elements from the wrapper
 * This is a defensive cleanup for any legacy/stray decorative elements
 */
function cleanupDecorativeElements(wrapper: HTMLElement): void {
  DECORATIVE_SELECTORS.forEach(selector => {
    try {
      const elements = wrapper.querySelectorAll(selector);
      elements.forEach(el => {
        // Only remove if it appears to be purely decorative
        // (empty or only whitespace content)
        if (!el.textContent?.trim() && !el.querySelector('button, a, input, [role="button"]')) {
          el.remove();
          // console.debug(`[landing-init] Removed decorative element: ${selector}`);
        }
      });
    } catch (e) {
      // Selector might be invalid, ignore
    }
  });
}

/**
 * React hook-friendly initializer
 * Use in useEffect: useEffect(() => initLandingBackground(), [])
 */
export default initLandingBackground;
