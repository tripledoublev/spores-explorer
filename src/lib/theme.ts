import chroma from 'chroma-js';

/**
 * Simple hash function to convert a string to a number
 */
export function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/** Minimum contrast ratio for normal text (WCAG AA). */
const MIN_TEXT_CONTRAST = 4.5;

/**
 * Ensures a color meets contrast requirements by adjusting it
 */
function ensureContrast(color: chroma.Color, againstColor: chroma.Color | string, minContrast: number, adjustFn: (color: chroma.Color) => chroma.Color): chroma.Color {
  if (chroma.contrast(color, againstColor) >= minContrast) return color;
  let adjusted = color;
  for (let i = 0; i < 20 && chroma.contrast(adjusted, againstColor) < minContrast; i++) {
    adjusted = adjustFn(adjusted);
  }
  return adjusted;
}

/**
 * Creates a color by mixing two colors until contrast requirement is met
 */
function mixForContrast(color1: chroma.Color | string, color2: chroma.Color | string, againstColor: chroma.Color | string, minContrast: number, startRatio = 0.5, step = 0.05): chroma.Color {
  let ratio = startRatio;
  let mixed = chroma.mix(color1, color2, ratio);
  while (chroma.contrast(mixed, againstColor) < minContrast && ratio < 0.95) {
    ratio += step;
    mixed = chroma.mix(color1, color2, ratio);
  }
  return mixed;
}

/**
 * Generates a color palette from a DID string.
 * Restricted to light backgrounds only so that black text always has sufficient
 * contrast for accessibility and layered elements.
 */
export function generateColorsFromDid(did: string): Record<string, string> {
  const hash = stringToHash(did);
  const hue = hash % 360;

  // Wider range; safety check below ensures black text contrast
  const saturation = 0.6 + ((hash >> 8) % 41) / 100; // 0.6–1.0
  const lightness = 0.55 + ((hash >> 12) % 41) / 100; // 0.55–0.95
  let backgroundColor = chroma.hsl(hue, saturation, lightness);

  // Ensure background meets minimum contrast with black; lighten if needed
  while (chroma.contrast(backgroundColor, 'black') < MIN_TEXT_CONTRAST && backgroundColor.get('hsl.l') < 0.98) {
    backgroundColor = backgroundColor.set('hsl.l', Math.min(0.98, backgroundColor.get('hsl.l') + 0.05));
  }

  // Black text only (theme restricted to light backgrounds for accessibility)
  const textColor = 'black';
  const isDarkBackground = false;

  // Primary and accent: palette-based – derived from bg→text gradient in LCH
  // palette[0]=bg, [1]=25%, [2]=50% (primary), [3]=75% (accent), [4]=text
  const palette = chroma.scale([backgroundColor, textColor]).mode('lch').colors(5);
  let primaryColor = chroma(palette[2]).saturate(1.5);
  let accentColor = chroma(palette[3]).saturate(1.5);

  primaryColor = ensureContrast(primaryColor, backgroundColor, 3.0,
    c => isDarkBackground ? c.brighten(0.15) : c.darken(0.15));
  accentColor = ensureContrast(accentColor, backgroundColor, 3.0,
    c => isDarkBackground ? c.brighten(0.15) : c.darken(0.15));

  // Generate text-muted with sufficient contrast
  const textMutedColor = mixForContrast(backgroundColor, textColor, backgroundColor, 4.5, 0.5, 0.05);

  // Generate border color
  const borderColor = mixForContrast(backgroundColor, textColor, backgroundColor, 2.0, 0.3, 0.1);
  const borderMutedColor = chroma.mix(backgroundColor, borderColor, 0.6);

  // Determine accent button text color and ensure contrast
  const accentTextColor = chroma.contrast(accentColor, 'white') > 4.5 ? 'white' : 'black';
  accentColor = ensureContrast(accentColor, accentTextColor, 4.5,
    c => accentTextColor === 'white' ? c.brighten(0.1) : c.darken(0.1));

  return {
    background: backgroundColor.hex(),
    text: textColor,
    primary: primaryColor.hex(),
    accent: accentColor.hex(),
    muted: textMutedColor.hex(),
    'text-muted': textMutedColor.hex(),
    border: borderColor.hex(),
    'border-muted': borderMutedColor.hex(),
    'button-secondary-text': backgroundColor.hex(),
    'button-accent-text': accentTextColor
  };
}

const SHADOW_OFFSETS = [0, 2, 4, 6, 8, 10, 12];
const SHADOW_BLURS = [0, 4, 8, 12, 16, 20, 28];
const SHADOW_SPREADS = [0, 0, 1, 2, 3];
const SHADOW_OPACITIES = [0, 0.1, 0.15, 0.2, 0.25, 0.3];

/**
 * Generates shadow properties from a DID
 */
export function generateShadowFromDid(did: string, colors: Record<string, string>) {
  const hash = stringToHash(did);
  
  const shadowOffsetIndex = hash % SHADOW_OFFSETS.length;
  const shadowBlurIndex = (hash >> 3) % SHADOW_BLURS.length;
  const shadowSpreadIndex = (hash >> 6) % SHADOW_SPREADS.length;
  const shadowOpacityIndex = (hash >> 9) % SHADOW_OPACITIES.length;
  
  const shadowColorBase = colors.accent || colors.primary || colors.text || '#000000';
  
  return {
    x: `${SHADOW_OFFSETS[shadowOffsetIndex]}px`,
    y: `${SHADOW_OFFSETS[shadowOffsetIndex]}px`,
    blur: `${SHADOW_BLURS[shadowBlurIndex]}px`,
    spread: `${SHADOW_SPREADS[shadowSpreadIndex]}px`,
    color: chroma(shadowColorBase).alpha(SHADOW_OPACITIES[shadowOpacityIndex]).css()
  };
}

/**
 * Applies theme variables to an element (usually documentElement)
 */
export function applyTheme(did: string, element: HTMLElement = document.documentElement) {
  const colors = generateColorsFromDid(did);
  const shadow = generateShadowFromDid(did, colors);
  const hash = stringToHash(did);
  
  // Set color variables
  element.style.setProperty('--bg', colors.background);
  element.style.setProperty('--text', colors.text);
  element.style.setProperty('--accent', colors.accent);
  element.style.setProperty('--accent-hover', colors.primary);
  element.style.setProperty('--muted', colors.muted);
  element.style.setProperty('--surface', colors.background); // Using background as surface for now
  element.style.setProperty('--surface2', colors['border-muted']);
  element.style.setProperty('--border', colors.border);
  element.style.setProperty('--border-dark', colors.text);
  
  // Set shadow variables
  element.style.setProperty('--shadow-x', shadow.x);
  element.style.setProperty('--shadow-y', shadow.y);
  element.style.setProperty('--shadow-blur', shadow.blur);
  element.style.setProperty('--shadow-spread', shadow.spread);
  element.style.setProperty('--shadow-color', shadow.color);

  // Spores-garden neobrutal shadow usually has 0 blur
  // Let's use deterministic offset but maybe keep 0 blur for that neobrutal look
  // unless the hash says otherwise.
  element.style.setProperty('--shadow-neobrutal', `${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread} ${shadow.color}`);
}
