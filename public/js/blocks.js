// ═══════════════════════════════════════════
//  BLOCK BATTLE — Block Definitions
// ═══════════════════════════════════════════

const BLOCK_COLORS = [
  { base: '#ff6b6b', light: '#ff8787', dark: '#e55656', glow: 'rgba(255,107,107,0.4)' },
  { base: '#feca57', light: '#fed76a', dark: '#e5b44e', glow: 'rgba(254,202,87,0.4)' },
  { base: '#48dbfb', light: '#67e3fc', dark: '#3cc4e2', glow: 'rgba(72,219,251,0.4)' },
  { base: '#ff9ff3', light: '#ffb3f6', dark: '#e58eda', glow: 'rgba(255,159,243,0.4)' },
  { base: '#54a0ff', light: '#6db3ff', dark: '#4a8fe5', glow: 'rgba(84,160,255,0.4)' },
  { base: '#5f27cd', light: '#7c3ff2', dark: '#5320b5', glow: 'rgba(95,39,205,0.4)' },
  { base: '#00d2d3', light: '#1ae8e9', dark: '#00b8b9', glow: 'rgba(0,210,211,0.4)' },
  { base: '#ff6348', light: '#ff7b63', dark: '#e5583f', glow: 'rgba(255,99,72,0.4)' },
  { base: '#7bed9f', light: '#95f2b3', dark: '#6dd48e', glow: 'rgba(123,237,159,0.4)' },
  { base: '#eccc68', light: '#f0d77e', dark: '#d4b75d', glow: 'rgba(236,204,104,0.4)' },
];

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
