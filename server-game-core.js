const { SeededRandom, generatePieceSet, getShapeCells } = require('./public/js/blocks.js');

function createPlayerState(seed) {
  const rng = new SeededRandom(seed);
  return {
    grid: Array.from({ length: 9 }, () => Array(9).fill(0)),
    rng,
    pieces: generatePieceSet(rng),
    combo: 0,
    score: 0,
  };
}

function canPlaceOnGrid(grid, shape, startRow, startCol) {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue;
      const gridRow = startRow + row;
      const gridCol = startCol + col;
      if (gridRow < 0 || gridRow >= 9 || gridCol < 0 || gridCol >= 9 || grid[gridRow][gridCol] !== 0) {
        return false;
      }
    }
  }
  return true;
}

function canPlaceAny(grid, pieces) {
  for (const piece of pieces) {
    if (piece.placed) continue;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (canPlaceOnGrid(grid, piece.shape, row, col)) return true;
      }
    }
  }
  return false;
}

function applyAuthoritativeMove(player, pieceIndex, startRow, startCol) {
  const piece = player.pieces[pieceIndex];
  if (!piece || piece.placed || !canPlaceOnGrid(player.grid, piece.shape, startRow, startCol)) return false;
  const colorValue = piece.colorIndex + 1;
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) player.grid[startRow + row][startCol + col] = colorValue;
    }
  }
  player.score += getShapeCells(piece.shape).length;
  piece.placed = true;

  const clearRows = [];
  const clearCols = [];
  for (let row = 0; row < 9; row++) if (player.grid[row].every(cell => cell !== 0)) clearRows.push(row);
  for (let col = 0; col < 9; col++) {
    let full = true;
    for (let row = 0; row < 9; row++) if (player.grid[row][col] === 0) { full = false; break; }
    if (full) clearCols.push(col);
  }
  const total = clearRows.length + clearCols.length;
  if (total === 0) {
    player.combo = 0;
  } else {
    player.combo++;
    const cells = new Set();
    for (const row of clearRows) for (let col = 0; col < 9; col++) cells.add(`${row},${col}`);
    for (const col of clearCols) for (let row = 0; row < 9; row++) cells.add(`${row},${col}`);
    player.score += cells.size + total * 18 + (player.combo > 1 ? player.combo * 15 : 0);
    for (const cell of cells) {
      const [row, col] = cell.split(',').map(Number);
      player.grid[row][col] = 0;
    }
  }
  if (player.pieces.every(item => item.placed)) player.pieces = generatePieceSet(player.rng);
  return true;
}

module.exports = {
  createPlayerState,
  canPlaceOnGrid,
  canPlaceAny,
  applyAuthoritativeMove,
};
