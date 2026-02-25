import { generateColorsFromDid } from './theme.js';

/**
 * Seeded random number generator for deterministic randomness
 */
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  let state = Math.abs(hash);

  return function () {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Lighten or darken a hex color
 */
function adjustColor(hex: string, amount: number): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse RGB
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);

  // Adjust
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface FlowerParams {
  petalCount: number;
  petalShape: 'round' | 'pointed' | 'wavy' | 'heart' | 'tulip';
  petalSize: number;
  petalRotation: number;
  layerCount: number;
  layerRotationOffset: number;
  layerSizeDecay: number;
  petalSizeJitter: number;
  petalAngleJitter: number;
  petalCurveJitter: number;
  centerStyle: 'simple' | 'stamen' | 'spiral' | 'dots' | 'ring';
  centerSize: number;
  stamenCount: number;
  hasStem: boolean;
  hasLeaves: boolean;
  leafStyle: 'ellipse' | 'pointed' | 'serrated';
  primaryColor: string;
  secondaryColor: string;
  centerColor: string;
  stamenTipColor: string;
}

function generateFlowerParams(did: string, colors: any): FlowerParams {
  const rng = seededRandom(did);

  const petalCount = Math.floor(rng() * 7) + 4;
  const shapeIndex = Math.floor(rng() * 5);
  const petalShape = ['round', 'pointed', 'wavy', 'heart', 'tulip'][shapeIndex] as FlowerParams['petalShape'];
  const petalSize = 0.5 + rng() * 0.4;
  const petalRotation = rng() * 360;

  const layerCount = Math.floor(rng() * 3) + 1;
  const layerRotationOffset = 15 + rng() * 30;
  const layerSizeDecay = 0.6 + rng() * 0.2;

  const petalSizeJitter = 0.1 + rng() * 0.15;
  const petalAngleJitter = 3 + rng() * 7;
  const petalCurveJitter = 0.1 + rng() * 0.2;

  const centerStyleIndex = Math.floor(rng() * 5);
  const centerStyle = ['simple', 'stamen', 'spiral', 'dots', 'ring'][centerStyleIndex] as FlowerParams['centerStyle'];
  const centerSize = 0.08 + rng() * 0.08;
  const stamenCount = Math.floor(rng() * 8) + 5;

  const hasStem = rng() > 0.4;
  const hasLeaves = hasStem && rng() > 0.5;

  const leafStyleIndex = Math.floor(rng() * 3);
  const leafStyle = ['ellipse', 'pointed', 'serrated'][leafStyleIndex] as FlowerParams['leafStyle'];

  const primaryColor = colors.primary || '#ff6b9d';
  const secondaryColor = colors.accent || colors.primary || '#ff9ecd';
  const centerColor = colors.text || colors.primary || '#4a4a4a';
  const stamenTipColor = colors.accent || adjustColor(primaryColor, 60);

  return {
    petalCount, petalShape, petalSize, petalRotation,
    layerCount, layerRotationOffset, layerSizeDecay,
    petalSizeJitter, petalAngleJitter, petalCurveJitter,
    centerStyle, centerSize, stamenCount,
    hasStem, hasLeaves, leafStyle,
    primaryColor, secondaryColor, centerColor, stamenTipColor
  };
}

function generatePetalPath(
  shape: FlowerParams['petalShape'],
  baseSize: number,
  centerX: number,
  centerY: number,
  angle: number,
  sizeMultiplier: number,
  curveVariation: number,
  rng: () => number
): string {
  const rad = (angle * Math.PI) / 180;
  const size = baseSize * sizeMultiplier;
  const petalLength = size * 40;
  const petalWidth = size * 22 * (1 + curveVariation * 0.3);

  const jitter = (amount: number) => (rng() - 0.5) * amount * size * 10;
  const tipX = centerX + Math.cos(rad) * petalLength + jitter(0.5);
  const tipY = centerY + Math.sin(rad) * petalLength + jitter(0.5);

  const perpAngle = rad + Math.PI / 2;
  const controlOffset = petalWidth * 0.5 * (1 + curveVariation * 0.2);

  const leftControlX = centerX + Math.cos(perpAngle) * controlOffset + jitter(1.5);
  const leftControlY = centerY + Math.sin(perpAngle) * controlOffset + jitter(1.5);
  const rightControlX = centerX - Math.cos(perpAngle) * controlOffset + jitter(1.5);
  const rightControlY = centerY - Math.sin(perpAngle) * controlOffset + jitter(1.5);

  switch (shape) {
    case 'round': {
      const leftCurveX = tipX + Math.cos(perpAngle) * petalWidth * 0.3 + jitter(1.0);
      const leftCurveY = tipY + Math.sin(perpAngle) * petalWidth * 0.3 + jitter(1.0);
      const rightCurveX = tipX - Math.cos(perpAngle) * petalWidth * 0.3 + jitter(1.0);
      const rightCurveY = tipY - Math.sin(perpAngle) * petalWidth * 0.3 + jitter(1.0);
      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${leftCurveX} ${leftCurveY} Q ${tipX} ${tipY} ${rightCurveX} ${rightCurveY} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }
    case 'pointed': {
      const bulgeFactor = petalWidth * 0.45;
      const bulgePoint = 0.4;
      const leftBulgeX = centerX + Math.cos(rad) * petalLength * bulgePoint + Math.cos(perpAngle) * bulgeFactor + jitter(1.0);
      const leftBulgeY = centerY + Math.sin(rad) * petalLength * bulgePoint + Math.sin(perpAngle) * bulgeFactor + jitter(1.0);
      const leftNarrowX = centerX + Math.cos(rad) * petalLength * 0.75 + Math.cos(perpAngle) * bulgeFactor * 0.4 + jitter(0.8);
      const leftNarrowY = centerY + Math.sin(rad) * petalLength * 0.75 + Math.sin(perpAngle) * bulgeFactor * 0.4 + jitter(0.8);
      const rightBulgeX = centerX + Math.cos(rad) * petalLength * bulgePoint - Math.cos(perpAngle) * bulgeFactor + jitter(1.0);
      const rightBulgeY = centerY + Math.sin(rad) * petalLength * bulgePoint - Math.sin(perpAngle) * bulgeFactor + jitter(1.0);
      const rightNarrowX = centerX + Math.cos(rad) * petalLength * 0.75 - Math.cos(perpAngle) * bulgeFactor * 0.4 + jitter(0.8);
      const rightNarrowY = centerY + Math.sin(rad) * petalLength * 0.75 - Math.sin(perpAngle) * bulgeFactor * 0.4 + jitter(0.8);
      return `M ${centerX} ${centerY} C ${leftControlX} ${leftControlY} ${leftBulgeX} ${leftBulgeY} ${leftNarrowX} ${leftNarrowY} Q ${tipX} ${tipY} ${rightNarrowX} ${rightNarrowY} C ${rightBulgeX} ${rightBulgeY} ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }
    case 'wavy': {
      const wave1X = centerX + Math.cos(rad) * petalLength * 0.3 + Math.cos(perpAngle) * petalWidth * 0.5 + jitter(1.2);
      const wave1Y = centerY + Math.sin(rad) * petalLength * 0.3 + Math.sin(perpAngle) * petalWidth * 0.5 + jitter(1.2);
      const wave2X = centerX + Math.cos(rad) * petalLength * 0.6 + Math.cos(perpAngle) * petalWidth * 0.3 + jitter(1.2);
      const wave2Y = centerY + Math.sin(rad) * petalLength * 0.6 + Math.sin(perpAngle) * petalWidth * 0.3 + jitter(1.2);
      const wave3X = centerX + Math.cos(rad) * petalLength * 0.6 - Math.cos(perpAngle) * petalWidth * 0.3 + jitter(1.2);
      const wave3Y = centerY + Math.sin(rad) * petalLength * 0.6 - Math.sin(perpAngle) * petalWidth * 0.3 + jitter(1.2);
      const wave4X = centerX + Math.cos(rad) * petalLength * 0.3 - Math.cos(perpAngle) * petalWidth * 0.5 + jitter(1.2);
      const wave4Y = centerY + Math.sin(rad) * petalLength * 0.3 - Math.sin(perpAngle) * petalWidth * 0.5 + jitter(1.2);
      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${wave1X} ${wave1Y} Q ${wave2X} ${wave2Y} ${tipX} ${tipY} Q ${wave3X} ${wave3Y} ${wave4X} ${wave4Y} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }
    case 'heart': {
      const notchDepth = petalLength * 0.15;
      const lobeWidth = petalWidth * 0.6;
      const leftLobeX = tipX + Math.cos(perpAngle) * lobeWidth - Math.cos(rad) * notchDepth * 0.5 + jitter(1.0);
      const leftLobeY = tipY + Math.sin(perpAngle) * lobeWidth - Math.sin(rad) * notchDepth * 0.5 + jitter(1.0);
      const rightLobeX = tipX - Math.cos(perpAngle) * lobeWidth - Math.cos(rad) * notchDepth * 0.5 + jitter(1.0);
      const rightLobeY = tipY - Math.sin(perpAngle) * lobeWidth - Math.sin(rad) * notchDepth * 0.5 + jitter(1.0);
      const notchX = tipX - Math.cos(rad) * notchDepth + jitter(0.5);
      const notchY = tipY - Math.sin(rad) * notchDepth + jitter(0.5);
      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${leftLobeX} ${leftLobeY} Q ${tipX} ${tipY} ${notchX} ${notchY} Q ${tipX} ${tipY} ${rightLobeX} ${rightLobeY} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }
    case 'tulip': {
      const cupWidth = petalWidth * 0.7;
      const cupPoint = petalLength * 0.6;
      const leftCupX = centerX + Math.cos(rad) * cupPoint + Math.cos(perpAngle) * cupWidth + jitter(1.0);
      const leftCupY = centerY + Math.sin(rad) * cupPoint + Math.sin(perpAngle) * cupWidth + jitter(1.0);
      const rightCupX = centerX + Math.cos(rad) * cupPoint - Math.cos(perpAngle) * cupWidth + jitter(1.0);
      const rightCupY = centerY + Math.sin(rad) * cupPoint - Math.sin(perpAngle) * cupWidth + jitter(1.0);
      const tipLeftX = tipX + Math.cos(perpAngle) * cupWidth * 0.5 + jitter(0.8);
      const tipLeftY = tipY + Math.sin(perpAngle) * cupWidth * 0.5 + jitter(0.8);
      const tipRightX = tipX - Math.cos(perpAngle) * cupWidth * 0.5 + jitter(0.8);
      const tipRightY = tipY - Math.sin(perpAngle) * cupWidth * 0.5 + jitter(0.8);
      return `M ${centerX} ${centerY} C ${leftControlX * 0.2 + centerX * 0.8} ${leftControlY * 0.2 + centerY * 0.8} ${leftCupX} ${leftCupY} ${tipLeftX} ${tipLeftY} Q ${tipX} ${tipY} ${tipRightX} ${tipRightY} C ${rightCupX} ${rightCupY} ${rightControlX * 0.2 + centerX * 0.8} ${rightControlY * 0.2 + centerY * 0.8} ${centerX} ${centerY} Z`;
    }
  }
}

function generateCenter(
  style: FlowerParams['centerStyle'],
  centerX: number,
  centerY: number,
  size: number,
  stamenCount: number,
  centerColor: string,
  stamenTipColor: string,
  rng: () => number
): string[] {
  const elements: string[] = [];
  const radius = size * 0.4;
  switch (style) {
    case 'simple':
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius * 0.6}" fill="${centerColor}" />`);
      break;
    case 'stamen': {
      const innerRadius = radius * 0.3;
      const outerRadius = radius * 1.2;
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${innerRadius}" fill="${centerColor}" />`);
      for (let i = 0; i < stamenCount; i++) {
        const angle = (i / stamenCount) * Math.PI * 2 + rng() * 0.2;
        const stamenLength = outerRadius * (0.7 + rng() * 0.3);
        const tipX = centerX + Math.cos(angle) * stamenLength;
        const tipY = centerY + Math.sin(angle) * stamenLength;
        const startX = centerX + Math.cos(angle) * innerRadius;
        const startY = centerY + Math.sin(angle) * innerRadius;
        elements.push(`<line x1="${startX}" y1="${startY}" x2="${tipX}" y2="${tipY}" stroke="${centerColor}" stroke-width="0.8" />`);
        const antherSize = 1.5 + rng() * 1;
        elements.push(`<circle cx="${tipX}" cy="${tipY}" r="${antherSize}" fill="${stamenTipColor}" />`);
      }
      break;
    }
    case 'spiral': {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const dotCount = Math.floor(20 + rng() * 15);
      for (let i = 0; i < dotCount; i++) {
        const angle = i * goldenAngle;
        const r = radius * 0.9 * Math.sqrt(i / dotCount);
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        const dotSize = 0.8 + (1 - i / dotCount) * 1.5;
        const color = i % 3 === 0 ? stamenTipColor : centerColor;
        elements.push(`<circle cx="${x}" cy="${y}" r="${dotSize}" fill="${color}" />`);
      }
      break;
    }
    case 'dots': {
      const dotCount = Math.floor(8 + rng() * 10);
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius * 0.8}" fill="${adjustColor(centerColor, 40)}" />`);
      for (let i = 0; i < dotCount; i++) {
        const angle = rng() * Math.PI * 2;
        const distance = rng() * radius * 0.6;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        const dotSize = 1 + rng() * 2;
        const color = rng() > 0.5 ? centerColor : stamenTipColor;
        elements.push(`<circle cx="${x}" cy="${y}" r="${dotSize}" fill="${color}" />`);
      }
      break;
    }
    case 'ring': {
      const ringCount = 2 + Math.floor(rng() * 2);
      for (let i = ringCount; i >= 0; i--) {
        const ringRadius = radius * 0.9 * ((i + 1) / (ringCount + 1));
        const color = i % 2 === 0 ? centerColor : stamenTipColor;
        elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${ringRadius}" fill="${color}" />`);
      }
      break;
    }
  }
  return elements;
}

function generateLeaf(
  style: FlowerParams['leafStyle'],
  x: number, y: number, size: number, rotation: number, color: string, rng: () => number
): string {
  const rad = (rotation * Math.PI) / 180;
  const perpRad = rad + Math.PI / 2;
  const jitter = (amount: number) => (rng() - 0.5) * amount * size * 0.8;
  const tipX = x + Math.cos(rad) * size + jitter(1.0);
  const tipY = y + Math.sin(rad) * size + jitter(1.0);
  switch (style) {
    case 'ellipse': {
      const width = size * 0.4;
      const bulgePoint = 0.35;
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftBulgeX = bulgeX + Math.cos(perpRad) * width + jitter(1.5);
      const leftBulgeY = bulgeY + Math.sin(perpRad) * width + jitter(1.5);
      const rightBulgeX = bulgeX - Math.cos(perpRad) * width + jitter(1.5);
      const rightBulgeY = bulgeY - Math.sin(perpRad) * width + jitter(1.5);
      return `<path d="M ${x} ${y} Q ${leftBulgeX} ${leftBulgeY} ${tipX} ${tipY} Q ${rightBulgeX} ${rightBulgeY} ${x} ${y} Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }
    case 'pointed': {
      const width = size * 0.3;
      const bulgePoint = 0.3;
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftCtrlX = bulgeX + Math.cos(perpRad) * width + jitter(1.5);
      const leftCtrlY = bulgeY + Math.sin(perpRad) * width + jitter(1.5);
      const rightCtrlX = bulgeX - Math.cos(perpRad) * width + jitter(1.5);
      const rightCtrlY = bulgeY - Math.sin(perpRad) * width + jitter(1.5);
      const midX = x + Math.cos(rad) * size * 0.65;
      const midY = y + Math.sin(rad) * size * 0.65;
      const leftMidX = midX + Math.cos(perpRad) * width * 0.5 + jitter(1.2);
      const leftMidY = midY + Math.sin(perpRad) * width * 0.5 + jitter(1.2);
      const rightMidX = midX - Math.cos(perpRad) * width * 0.5 + jitter(1.2);
      const rightMidY = midY - Math.sin(perpRad) * width * 0.5 + jitter(1.2);
      return `<path d="M ${x} ${y} C ${leftCtrlX} ${leftCtrlY} ${leftMidX} ${leftMidY} ${tipX} ${tipY} C ${rightMidX} ${rightMidY} ${rightCtrlX} ${rightCtrlY} ${x} ${y} Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }
    case 'serrated': {
      const width = size * 0.35;
      const bulgePoint = 0.35;
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftBulgeX = bulgeX + Math.cos(perpRad) * width + jitter(1.5);
      const leftBulgeY = bulgeY + Math.sin(perpRad) * width + jitter(1.5);
      const rightBulgeX = bulgeX - Math.cos(perpRad) * width + jitter(1.5);
      const rightBulgeY = bulgeY - Math.sin(perpRad) * width + jitter(1.5);
      const midPoint = 0.65;
      const midX = x + Math.cos(rad) * size * midPoint;
      const midY = y + Math.sin(rad) * size * midPoint;
      const leftMidX = midX + Math.cos(perpRad) * width * 0.6 + jitter(1.2);
      const leftMidY = midY + Math.sin(perpRad) * width * 0.6 + jitter(1.2);
      const rightMidX = midX - Math.cos(perpRad) * width * 0.6 + jitter(1.2);
      const rightMidY = midY - Math.sin(perpRad) * width * 0.6 + jitter(1.2);
      return `<path d="M ${x} ${y} Q ${leftBulgeX} ${leftBulgeY} ${leftMidX} ${leftMidY} Q ${tipX + Math.cos(perpRad) * width * 0.2} ${tipY + Math.sin(perpRad) * width * 0.2} ${tipX} ${tipY} Q ${tipX - Math.cos(perpRad) * width * 0.2} ${tipY - Math.sin(perpRad) * width * 0.2} ${rightMidX} ${rightMidY} Q ${rightBulgeX} ${rightBulgeY} ${x} ${y} Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }
  }
}

export function generateFlowerSVGString(did: string, displaySize: number = 100): string {
  const colors = generateColorsFromDid(did);
  const params = generateFlowerParams(did, colors);
  const rng = seededRandom(did + '-svg');
  const size = 100;
  const centerX = size / 2;
  const centerY = size / 2;
  const flowerRadius = size * 0.4;

  let svgElements: string[] = [];

  for (let layer = 0; layer < params.layerCount; layer++) {
    const layerScale = Math.pow(params.layerSizeDecay, layer);
    const layerRotation = params.petalRotation + layer * params.layerRotationOffset;
    const layerPetalCount = Math.max(params.petalCount - layer, 3);
    const layerColorAdjust = layer * 25;
    const layerPrimaryColor = adjustColor(params.primaryColor, layerColorAdjust);
    const layerSecondaryColor = adjustColor(params.secondaryColor, layerColorAdjust);
    const angleStep = 360 / layerPetalCount;

    for (let i = 0; i < layerPetalCount; i++) {
      const sizeMultiplier = 1 + (rng() - 0.5) * 2 * params.petalSizeJitter;
      const angleJitter = (rng() - 0.5) * 2 * params.petalAngleJitter;
      const curveVariation = (rng() - 0.5) * 2 * params.petalCurveJitter;
      const angle = layerRotation + i * angleStep + angleJitter;
      const petalPath = generatePetalPath(params.petalShape, params.petalSize * layerScale, centerX, centerY, angle, sizeMultiplier, curveVariation, rng);
      const strokeColor = i % 2 === 0 ? layerPrimaryColor : layerSecondaryColor;
      svgElements.push(`<path d="${petalPath}" fill="${strokeColor}" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="${1 - layer * 0.1}" />`);
    }
  }

  const centerElements = generateCenter(params.centerStyle, centerX, centerY, flowerRadius * params.centerSize * 3, params.stamenCount, params.centerColor, params.stamenTipColor, rng);
  svgElements.push(...centerElements);

  if (params.hasStem) {
    const stemStartY = centerY;
    const stemHeight = size * 0.35;
    const stemWidth = size * 0.025;
    const stemColor = adjustColor(params.secondaryColor, -40);
    const stemCurve = (rng() - 0.5) * 4;
    const stemEndY = stemStartY + stemHeight;
    svgElements.unshift(`<path d="M ${centerX} ${stemStartY} Q ${centerX + stemCurve} ${stemStartY + stemHeight * 0.5} ${centerX} ${stemEndY}" stroke="${stemColor}" stroke-width="${stemWidth}" fill="none" stroke-linecap="round" />`);
    if (params.hasLeaves) {
      const leafSize = size * 0.1;
      const leafColor = adjustColor(params.secondaryColor, -30);
      const leftLeafY = stemStartY + stemHeight * 0.35;
      svgElements.unshift(generateLeaf(params.leafStyle, centerX, leftLeafY, leafSize, -50, leafColor, rng));
      if (rng() > 0.3) {
        const rightLeafY = stemStartY + stemHeight * 0.55;
        svgElements.unshift(generateLeaf(params.leafStyle, centerX, rightLeafY, leafSize * 0.85, 50, leafColor, rng));
      }
    }
  }

  return `<svg width="${displaySize}" height="${displaySize}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${svgElements.join('\n')}
  </svg>`;
}

export function generateSporeFlowerSVGString(did: string, displaySize: number = 100): string {
  const colors = generateColorsFromDid(did);
  const params = generateFlowerParams(did, colors);
  const rng = seededRandom(did + '-svg');
  const size = 100;
  const centerX = size / 2;
  const centerY = size / 2;
  const flowerRadius = size * 0.4;

  let svgElements: string[] = [];

  for (let layer = 0; layer < params.layerCount; layer++) {
    const layerScale = Math.pow(params.layerSizeDecay, layer);
    const layerRotation = params.petalRotation + layer * params.layerRotationOffset;
    const layerPetalCount = Math.max(params.petalCount - layer, 3);
    const layerColorAdjust = layer * 25;
    const layerPrimaryColor = adjustColor(params.primaryColor, layerColorAdjust);
    const layerSecondaryColor = adjustColor(params.secondaryColor, layerColorAdjust);
    const angleStep = 360 / layerPetalCount;

    for (let i = 0; i < layerPetalCount; i++) {
      const sizeMultiplier = 1 + (rng() - 0.5) * 2 * params.petalSizeJitter;
      const angleJitter = (rng() - 0.5) * 2 * params.petalAngleJitter;
      const curveVariation = (rng() - 0.5) * 2 * params.petalCurveJitter;
      const angle = layerRotation + i * angleStep + angleJitter;
      const petalPath = generatePetalPath(params.petalShape, params.petalSize * layerScale, centerX, centerY, angle, sizeMultiplier, curveVariation, rng);
      const strokeColor = i % 2 === 0 ? layerPrimaryColor : layerSecondaryColor;
      // Outline only
      svgElements.push(`<path d="${petalPath}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="${1 - layer * 0.1}" />`);
    }
  }

  const centerRadius = flowerRadius * params.centerSize * 3 * 0.4;
  svgElements.push(`<circle cx="${centerX}" cy="${centerY}" r="${centerRadius * 0.8}" fill="none" stroke="${params.centerColor}" stroke-width="1.5" />`);

  return `<svg width="${displaySize}" height="${displaySize}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${svgElements.join('\n')}
  </svg>`;
}
