// ═══════════════════════════════════════════
//  BLOCK BATTLE — Block Definitions
// ═══════════════════════════════════════════

const THEMES = {
  default: [
    { base: '#ff6b6b', light: '#ff8787', dark: '#e55656', glow: 'rgba(255,107,107,0.4)' },
    { base: '#feca57', light: '#fed76a', dark: '#e5b44e', glow: 'rgba(254,202,87,0.4)' },
    { base: '#48dbfb', light: '#67e3fc', dark: '#3cc4e2', glow: 'rgba(72,219,251,0.4)' },
    { base: '#ff9ff3', light: '#ffb3f6', dark: '#e58eda', glow: 'rgba(255,159,243,0.4)' },
    { base: '#54a0ff', light: '#6db3ff', dark: '#4a8fe5', glow: 'rgba(84,160,255,0.4)' },
    { base: '#5f27cd', light: '#7c3ff2', dark: '#5320b5', glow: 'rgba(95,39,205,0.4)' },
    { base: '#00d2d3', light: '#1ae8e9', dark: '#00b8b9', glow: 'rgba(0,210,211,0.4)' }
  ],
  pastel: [
    { base: '#fab1a0', light: '#ffc7b8', dark: '#e17055', glow: 'rgba(250,177,160,0.4)' },
    { base: '#ffeaa7', light: '#fff4cc', dark: '#fdcb6e', glow: 'rgba(255,234,167,0.4)' },
    { base: '#81ecec', light: '#a7f3f3', dark: '#00cec9', glow: 'rgba(129,236,236,0.4)' },
    { base: '#74b9ff', light: '#a2d2ff', dark: '#0984e3', glow: 'rgba(116,185,255,0.4)' },
    { base: '#a29bfe', light: '#c2bcff', dark: '#6c5ce7', glow: 'rgba(162,155,254,0.4)' },
    { base: '#55efc4', light: '#81f5d5', dark: '#00b894', glow: 'rgba(85,239,196,0.4)' },
    { base: '#ff7675', light: '#ff9b9a', dark: '#d63031', glow: 'rgba(255,118,117,0.4)' }
  ],
  dark: [
    { base: '#2d3436', light: '#636e72', dark: '#1e272e', glow: 'rgba(45,52,54,0.4)' },
    { base: '#0984e3', light: '#74b9ff', dark: '#083d77', glow: 'rgba(9,132,227,0.4)' },
    { base: '#d63031', light: '#ff7675', dark: '#b33939', glow: 'rgba(214,48,49,0.4)' },
    { base: '#6c5ce7', light: '#a29bfe', dark: '#4834d4', glow: 'rgba(108,92,231,0.4)' },
    { base: '#00b894', light: '#55efc4', dark: '#006266', glow: 'rgba(0,184,148,0.4)' },
    { base: '#e17055', light: '#fab1a0', dark: '#b33939', glow: 'rgba(225,112,85,0.4)' },
    { base: '#fdcb6e', light: '#ffeaa7', dark: '#f39c12', glow: 'rgba(253,203,110,0.4)' }
  ]
};

let BLOCK_COLORS = THEMES.default;

const BLOCK_SHAPES = [
  // === Singles & Small ===
  { shape: [[1]], name: 'dot' },
  { shape: [[1, 1]], name: 'h2' },
  { shape: [[1], [1]], name: 'v2' },
  { shape: [[1, 1, 1]], name: 'h3' },
  { shape: [[1], [1], [1]], name: 'v3' },
  { shape: [[1, 1, 1, 1]], name: 'h4' },
  { shape: [[1], [1], [1], [1]], name: 'v4' },
  { shape: [[1, 1, 1, 1, 1]], name: 'h5' },
  { shape: [[1], [1], [1], [1], [1]], name: 'v5' },

  // === Squares ===
  { shape: [[1, 1], [1, 1]], name: 'sq2' },
  { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], name: 'sq3' },

  // === L shapes ===
  { shape: [[1, 0], [1, 0], [1, 1]], name: 'L1' },
  { shape: [[0, 1], [0, 1], [1, 1]], name: 'L2' },
  { shape: [[1, 1], [1, 0], [1, 0]], name: 'L3' },
  { shape: [[1, 1], [0, 1], [0, 1]], name: 'L4' },
  { shape: [[1, 0, 0], [1, 1, 1]], name: 'L5' },
  { shape: [[0, 0, 1], [1, 1, 1]], name: 'L6' },
  { shape: [[1, 1, 1], [1, 0, 0]], name: 'L7' },
  { shape: [[1, 1, 1], [0, 0, 1]], name: 'L8' },

  // === T shapes ===
  { shape: [[1, 1, 1], [0, 1, 0]], name: 'T1' },
  { shape: [[0, 1, 0], [1, 1, 1]], name: 'T2' },
  { shape: [[1, 0], [1, 1], [1, 0]], name: 'T3' },
  { shape: [[0, 1], [1, 1], [0, 1]], name: 'T4' },

  // === S/Z shapes ===
  { shape: [[1, 0], [1, 1], [0, 1]], name: 'S1' },
  { shape: [[0, 1], [1, 1], [1, 0]], name: 'S2' },
  { shape: [[1, 1, 0], [0, 1, 1]], name: 'S3' },
  { shape: [[0, 1, 1], [1, 1, 0]], name: 'S4' },

  // === Corners (2x2 minus one) ===
  { shape: [[1, 1], [1, 0]], name: 'C1' },
  { shape: [[1, 1], [0, 1]], name: 'C2' },
  { shape: [[1, 0], [1, 1]], name: 'C3' },
  { shape: [[0, 1], [1, 1]], name: 'C4' },

  // === Cross / Plus ===
  { shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], name: 'plus' },
];

// Seeded random number generator (LCG)
class SeededRandom {
  constructor(seed) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

function generatePieceSet(rng) {
  const pieces = [];
  for (let i = 0; i < 3; i++) {
    const shapeIndex = rng.nextInt(0, BLOCK_SHAPES.length - 1);
    const colorIndex = rng.nextInt(0, BLOCK_COLORS.length - 1);
    pieces.push({
      shape: BLOCK_SHAPES[shapeIndex].shape,
      colorIndex: colorIndex,
      placed: false,
      name: BLOCK_SHAPES[shapeIndex].name,
    });
  }
  return pieces;
}

function getShapeSize(shape) {
  return { rows: shape.length, cols: shape[0].length };
}

function getShapeCells(shape) {
  const cells = [];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) cells.push({ r, c });
    }
  }
  return cells;
}

function rotateShape(shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  const newShape = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      newShape[c][rows - 1 - r] = shape[r][c];
    }
  }
  return newShape;
}
