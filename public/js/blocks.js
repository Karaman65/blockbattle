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
  ],
  matrix: [
    { base: '#00f3ff', light: '#7cfff8', dark: '#008ea3', glow: 'rgba(0,243,255,0.45)' },
    { base: '#0984e3', light: '#74b9ff', dark: '#0051a8', glow: 'rgba(9,132,227,0.45)' },
    { base: '#00cec9', light: '#81ecec', dark: '#008b87', glow: 'rgba(0,206,201,0.45)' },
    { base: '#54a0ff', light: '#a2d2ff', dark: '#2f68c5', glow: 'rgba(84,160,255,0.45)' },
    { base: '#2e86de', light: '#74b9ff', dark: '#1b4f9c', glow: 'rgba(46,134,222,0.45)' },
    { base: '#00a8ff', light: '#7ed6df', dark: '#006ba6', glow: 'rgba(0,168,255,0.45)' },
    { base: '#48dbfb', light: '#c7f9ff', dark: '#2aa8bf', glow: 'rgba(72,219,251,0.45)' }
  ],
  nebula: [
    { base: '#9d00ff', light: '#c471ed', dark: '#5f27cd', glow: 'rgba(157,0,255,0.45)' },
    { base: '#ff00ff', light: '#ff9ff3', dark: '#b000b8', glow: 'rgba(255,0,255,0.45)' },
    { base: '#6c5ce7', light: '#a29bfe', dark: '#4834d4', glow: 'rgba(108,92,231,0.45)' },
    { base: '#ff007a', light: '#ff6b9d', dark: '#a80052', glow: 'rgba(255,0,122,0.45)' },
    { base: '#341f97', light: '#786fa6', dark: '#1b1464', glow: 'rgba(52,31,151,0.45)' },
    { base: '#e84393', light: '#fd79a8', dark: '#ad1457', glow: 'rgba(232,67,147,0.45)' },
    { base: '#8e44ad', light: '#be90d4', dark: '#5b2c6f', glow: 'rgba(142,68,173,0.45)' }
  ],
  lava: [
    { base: '#ff4757', light: '#ff7f7f', dark: '#c0392b', glow: 'rgba(255,71,87,0.45)' },
    { base: '#ff6b35', light: '#ff9f43', dark: '#d35400', glow: 'rgba(255,107,53,0.45)' },
    { base: '#ffa502', light: '#ffd166', dark: '#cc7700', glow: 'rgba(255,165,2,0.45)' },
    { base: '#e84118', light: '#ff7675', dark: '#9c1f00', glow: 'rgba(232,65,24,0.45)' },
    { base: '#f368e0', light: '#ff9ff3', dark: '#b53471', glow: 'rgba(243,104,224,0.45)' },
    { base: '#ff3838', light: '#ff6b6b', dark: '#b71540', glow: 'rgba(255,56,56,0.45)' },
    { base: '#feca57', light: '#ffeaa7', dark: '#cd8b00', glow: 'rgba(254,202,87,0.45)' }
  ],
  toxic: [
    { base: '#00ff88', light: '#7dffb2', dark: '#00b35f', glow: 'rgba(0,255,136,0.45)' },
    { base: '#2ed573', light: '#7bed9f', dark: '#079246', glow: 'rgba(46,213,115,0.45)' },
    { base: '#a3ff12', light: '#d4ff7a', dark: '#6fb000', glow: 'rgba(163,255,18,0.45)' },
    { base: '#00d2d3', light: '#81ecec', dark: '#008c8c', glow: 'rgba(0,210,211,0.45)' },
    { base: '#55efc4', light: '#b8fff0', dark: '#00b894', glow: 'rgba(85,239,196,0.45)' },
    { base: '#badc58', light: '#eaff9a', dark: '#6ab04c', glow: 'rgba(186,220,88,0.45)' },
    { base: '#7bed9f', light: '#c8ffd8', dark: '#2ecc71', glow: 'rgba(123,237,159,0.45)' }
  ]
};

let BLOCK_COLORS = THEMES.default;

const COSMETICS = {
  bombEffect: {
    classic: {
      name: 'Klasik Patlama',
      price: 0,
      ring: 'rgba(255, 126, 46, 0.78)',
      core: 'rgba(255, 214, 102, 0.82)',
      smoke: ['#3a2a22', '#5a3b2b'],
      spark: '#ff8c42',
    },
    smoke: {
      name: 'Kara Duman',
      price: 650,
      ring: 'rgba(18, 18, 24, 0.86)',
      core: 'rgba(255, 126, 46, 0.82)',
      smoke: ['#1c1d24', '#3a3b45'],
      spark: '#ff8c42',
    },
    neon: {
      name: 'Neon Şok',
      price: 950,
      ring: 'rgba(0, 243, 255, 0.78)',
      core: 'rgba(157, 0, 255, 0.72)',
      smoke: ['#082c38', '#3b1b62'],
      spark: '#00f3ff',
    },
    frost: {
      name: 'Buz Kırığı',
      price: 1200,
      ring: 'rgba(126, 214, 223, 0.82)',
      core: 'rgba(199, 249, 255, 0.8)',
      smoke: ['#163746', '#8ed6e6'],
      spark: '#c7f9ff',
    },
  }
};

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

  // === Wide corners & hooks ===
  { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], name: 'hook1' },
  { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], name: 'hook2' },
  { shape: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], name: 'hook3' },
  { shape: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], name: 'hook4' },
  { shape: [[1, 1, 0], [1, 0, 0], [1, 1, 1]], name: 'claw1' },
  { shape: [[0, 1, 1], [0, 0, 1], [1, 1, 1]], name: 'claw2' },
  { shape: [[1, 1, 1], [1, 0, 0], [1, 1, 0]], name: 'claw3' },
  { shape: [[1, 1, 1], [0, 0, 1], [0, 1, 1]], name: 'claw4' },

  // === U / cup shapes ===
  { shape: [[1, 0, 1], [1, 1, 1]], name: 'cup1' },
  { shape: [[1, 1, 1], [1, 0, 1]], name: 'cup2' },
  { shape: [[1, 1], [1, 0], [1, 1]], name: 'cup3' },
  { shape: [[1, 1], [0, 1], [1, 1]], name: 'cup4' },

  // === Chunky 2x3 / 3x2 pieces ===
  { shape: [[1, 1, 1], [1, 1, 0]], name: 'chunk1' },
  { shape: [[1, 1, 1], [0, 1, 1]], name: 'chunk2' },
  { shape: [[1, 1, 0], [1, 1, 1]], name: 'chunk3' },
  { shape: [[0, 1, 1], [1, 1, 1]], name: 'chunk4' },
  { shape: [[1, 1], [1, 1], [1, 0]], name: 'chunk5' },
  { shape: [[1, 1], [1, 1], [0, 1]], name: 'chunk6' },
  { shape: [[1, 0], [1, 1], [1, 1]], name: 'chunk7' },
  { shape: [[0, 1], [1, 1], [1, 1]], name: 'chunk8' },

  // === Steps and bends ===
  { shape: [[1, 0, 0], [1, 1, 0], [0, 1, 1]], name: 'step1' },
  { shape: [[0, 0, 1], [0, 1, 1], [1, 1, 0]], name: 'step2' },
  { shape: [[0, 1, 1], [1, 1, 0], [1, 0, 0]], name: 'step3' },
  { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 1]], name: 'step4' },
  { shape: [[1, 0, 1], [1, 1, 0]], name: 'bend1' },
  { shape: [[1, 0, 1], [0, 1, 1]], name: 'bend2' },
  { shape: [[1, 1, 0], [0, 1, 0], [0, 1, 1]], name: 'bend3' },
  { shape: [[0, 1, 1], [0, 1, 0], [1, 1, 0]], name: 'bend4' },

  // === Compact special shapes ===
  { shape: [[1, 1, 1], [0, 1, 0], [1, 1, 1]], name: 'bridge' },
  { shape: [[1, 0, 1], [1, 1, 1], [1, 0, 1]], name: 'ring' },
  { shape: [[0, 1, 0], [1, 1, 1], [1, 0, 1]], name: 'gem1' },
  { shape: [[1, 0, 1], [1, 1, 1], [0, 1, 0]], name: 'gem2' },
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
