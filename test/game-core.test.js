const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPlayerState,
  canPlaceOnGrid,
  applyAuthoritativeMove,
} = require('../server-game-core.js');

function firstValidPosition(state, pieceIndex) {
  const shape = state.pieces[pieceIndex].shape;
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (canPlaceOnGrid(state.grid, shape, row, col)) return { row, col };
    }
  }
  return null;
}

test('seeded online players receive the same pieces', () => {
  const first = createPlayerState(123456);
  const second = createPlayerState(123456);
  assert.deepEqual(first.pieces, second.pieces);
});

test('server accepts valid moves once and rejects replayed placements', () => {
  const state = createPlayerState(987654);
  const position = firstValidPosition(state, 0);
  assert.ok(position);
  assert.equal(applyAuthoritativeMove(state, 0, position.row, position.col), true);
  assert.ok(state.score > 0);
  assert.equal(applyAuthoritativeMove(state, 0, position.row, position.col), false);
});
