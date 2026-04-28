// ═══════════════════════════════════════════
//  BLOCK BATTLE — Input Handler
// ═══════════════════════════════════════════

class InputHandler {
  constructor(game) {
    this.game = game;
    this.dragging = false;
    this.dragPieceIndex = -1;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.dragEl = null;
  }

  init() {
    const tray = document.getElementById('piece-tray');

    // Mouse events on piece slots
    tray.addEventListener('mousedown', (e) => this._onStart(e));
    window.addEventListener('mousemove', (e) => this._onMove(e));
    window.addEventListener('mouseup', (e) => this._onEnd(e));

    // Touch events
    tray.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this._onMove(e), { passive: false });
    window.addEventListener('touchend', (e) => this._onEnd(e));
    window.addEventListener('touchcancel', (e) => this._onEnd(e));
  }

  _getPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  _onStart(e) {
    if (this.game.state !== 'playing') return;
    if (this.game.animatingClear) return;

    const slot = e.target.closest('.piece-slot');
    if (!slot || slot.classList.contains('placed')) return;

    e.preventDefault();
    const idx = parseInt(slot.dataset.index);
    if (isNaN(idx) || !this.game.pieces[idx] || this.game.pieces[idx].placed) return;

    this.dragging = true;
    this.dragPieceIndex = idx;

    const pos = this._getPos(e);
    this.currentX = pos.x;
    this.currentY = pos.y;

    // Mark slot as dragging
    slot.classList.add('dragging');

    // Create floating drag element
    this._createDragElement(idx, pos);

    this.game.audio.pickup();
  }

  _onMove(e) {
    if (!this.dragging) return;
    e.preventDefault();

    const pos = this._getPos(e);
    this.currentX = pos.x;
    this.currentY = pos.y;

    // Move drag element
    if (this.dragEl) {
      const piece = this.game.pieces[this.dragPieceIndex];
      const shape = piece.shape;
      const dragCellSize = this.game.cellSize;
      const w = shape[0].length * (dragCellSize + 2);
      const h = shape.length * (dragCellSize + 2);

      const yOffset = 80;

      this.dragEl.style.left = (pos.x - w / 2) + 'px';
      this.dragEl.style.top = (pos.y - h - yOffset) + 'px';
    }

    // Calculate ghost position based on the visual center of the dragged piece
    let dropY = pos.y;
    if (this.dragEl) {
      const piece = this.game.pieces[this.dragPieceIndex];
      const shape = piece.shape;
      const h = shape.length * (this.game.cellSize + 2);
      dropY = pos.y - h / 2 - 80;
    }
    this.game.updateGhost(pos.x, dropY, this.dragPieceIndex);
  }

  _onEnd(e) {
    if (!this.dragging) return;

    const pos = this._getPos(e);
    let dropY = pos.y;
    if (this.dragEl) {
      const piece = this.game.pieces[this.dragPieceIndex];
      const shape = piece.shape;
      const h = shape.length * (this.game.cellSize + 2);
      dropY = pos.y - h / 2 - 80;
    }

    const success = this.game.tryPlace(pos.x, dropY, this.dragPieceIndex);

    // Remove dragging state
    const slot = document.querySelector(`.piece-slot[data-index="${this.dragPieceIndex}"]`);
    if (slot) slot.classList.remove('dragging');

    // Remove drag element
    if (this.dragEl) {
      this.dragEl.remove();
      this.dragEl = null;
    }

    this.game.clearGhost();
    this.dragging = false;
    this.dragPieceIndex = -1;
  }

  _createDragElement(pieceIndex, startPos) {
    if (this.dragEl) this.dragEl.remove();

    const piece = this.game.pieces[pieceIndex];
    const shape = piece.shape;
    const color = BLOCK_COLORS[piece.colorIndex];
    const cellSize = this.game.cellSize;

    const el = document.createElement('div');
    el.className = 'drag-piece';
    el.style.gridTemplateColumns = `repeat(${shape[0].length}, ${cellSize}px)`;
    el.style.gap = '2px';

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        const cell = document.createElement('div');
        if (shape[r][c]) {
          cell.className = 'drag-cell';
          cell.style.width = cellSize + 'px';
          cell.style.height = cellSize + 'px';
          cell.style.background = `linear-gradient(135deg, ${color.light}, ${color.base}, ${color.dark})`;
        } else {
          cell.style.width = cellSize + 'px';
          cell.style.height = cellSize + 'px';
        }
        el.appendChild(cell);
      }
    }

    const w = shape[0].length * (cellSize + 2);
    const h = shape.length * (cellSize + 2);
    const yOffset = 80;
    el.style.left = (startPos.x - w / 2) + 'px';
    el.style.top = (startPos.y - h - yOffset) + 'px';

    document.body.appendChild(el);
    this.dragEl = el;
  }
}
