// Archetype-specific fallback images using SVG with unique colors and symbols
// These are used when image generation is rate limited - NO API CALL needed
const createArchetypeSVG = (gradientTop: string, gradientMid: string, gradientBot: string, symbol: string, accentColor: string): string => {
  const svg = `<svg width="512" height="912" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${gradientTop};stop-opacity:1" />
        <stop offset="50%" style="stop-color:${gradientMid};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${gradientBot};stop-opacity:1" />
      </linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="256" cy="300" r="120" fill="none" stroke="${accentColor}" stroke-width="1" opacity="0.2"/>
    <circle cx="256" cy="300" r="80" fill="none" stroke="${accentColor}" stroke-width="1.5" opacity="0.4" filter="url(#glow)"/>
    <circle cx="256" cy="300" r="40" fill="none" stroke="${accentColor}" stroke-width="2" opacity="0.6"/>
    <text x="256" y="310" font-family="serif" font-size="36" fill="${accentColor}" text-anchor="middle" opacity="0.8" filter="url(#glow)">${symbol}</text>
  </svg>`;
  // Use encodeURIComponent instead of btoa to handle Unicode symbols properly
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};

// Pre-generated archetype images - instant, no API calls
const FALLBACK_IMAGES: Record<string, string> = {
  'The Penitent':          createArchetypeSVG('#2d1b0e', '#1a1008', '#0f0803', '\u2665', '#c9a227'),   // Heart - amber (candlelight)
  'The Wandering Soul':    createArchetypeSVG('#0d1a2e', '#0f2035', '#07121f', '\u2736', '#87ceeb'),   // Star - sky blue
  'The Suffering Servant': createArchetypeSVG('#1a0808', '#200a0a', '#0f0505', '\u271d', '#c0392b'),   // Cross - red
  'The Scrupulous Soul':   createArchetypeSVG('#1a1030', '#15102a', '#0a0815', '\u262a', '#b8c5d6'),   // Symbol - violet/soft
  'The Desolate Heart':    createArchetypeSVG('#151520', '#101015', '#08080d', '\u25cf', '#6b7280'),   // Circle - slate
  'The Grieving Soul':     createArchetypeSVG('#2e0f1a', '#1e0b10', '#100507', '\u2740', '#e879a0'),   // Flower - rose
  'The Consoled Soul':     createArchetypeSVG('#0f2e1a', '#0b1e10', '#051007', '\u2600', '#34d399'),   // Sun - emerald
  'The Wounded Pilgrim':   createArchetypeSVG('#2e1a0a', '#1e1005', '#100a03', '\u2767', '#f97316'),   // Dagger/staff - orange
  'default': createArchetypeSVG('#1a1a2e', '#16213e', '#0f0f23', '\u2728', '#ffd700'),                 // Sparkles - gold
};

/**
 * Get archetype-specific fallback image (instant, no API call)
 */
export const getArchetypeFallbackImage = (archetype?: string): string => {
  if (archetype && FALLBACK_IMAGES[archetype]) {
    return FALLBACK_IMAGES[archetype];
  }
  return FALLBACK_IMAGES.default;
};

/**
 * Generate sanctuary image for the devotional.
 *
 * OPTIMIZED: Uses archetype-specific fallback images by default (instant, no API call).
 * Only attempts API generation if explicitly requested and archetype is provided.
 *
 * @param prompt - Image prompt (used only if tryGenerate is true)
 * @param archetype - Archetype for fallback image selection
 * @param tryGenerate - If true, attempts API generation first (default: false for speed)
 */
export const generateWhisperImage = async (
  prompt: string,
  archetype?: string,
  tryGenerate: boolean = false
): Promise<string> => {
  // FAST PATH: Use archetype-specific fallback (no API call)
  if (!tryGenerate) {
    console.log(`[Image] Using archetype fallback for: ${archetype || 'default'}`);
    return getArchetypeFallbackImage(archetype);
  }

  // SLOW PATH: Try API generation (only if explicitly requested)
  if (!prompt || typeof prompt !== 'string') {
    console.warn('Invalid prompt, using fallback image');
    return getArchetypeFallbackImage(archetype);
  }

  try {
    const response = await fetch('/api/gemini-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || 'Failed to generate image';

      // If rate limited or overloaded, use archetype fallback
      if (response.status === 429 || response.status === 503 ||
          errorMessage.includes('rate') || errorMessage.includes('busy') ||
          errorMessage.includes('overloaded')) {
        console.warn('Image generation rate limited, using archetype fallback');
        return getArchetypeFallbackImage(archetype);
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.image) {
      return data.image;
    }

    console.warn('No image in response, using fallback');
    return getArchetypeFallbackImage(archetype);

  } catch (error) {
    console.error('Image generation error:', error);
    console.warn('Using archetype fallback due to error');
    return getArchetypeFallbackImage(archetype);
  }
};

// Re-export for backward compatibility
export { generateWhisperImage as generateImage };

