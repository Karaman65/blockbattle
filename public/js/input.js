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
    this.bombDragging = false;
    this.bombDragEl = null;
    this.suppressBombClick = false;

    // Performance: Ghost preview debouncing
    this._lastGhostX = 0;
    this._lastGhostY = 0;
    this._lastMoveTime = 0;
  }

  init() {
    const tray = document.getElementById('piece-tray');
    const canvas = document.getElementById('game-canvas');

    // Mouse events on piece slots
    tray.addEventListener('mousedown', (e) => this._onStart(e));
    window.addEventListener('mousemove', (e) => this._onMove(e));
    window.addEventListener('mouseup', (e) => this._onEnd(e));

    // Performance: Throttled touch move
    const throttledMove = this.throttle((e) => this._onMove(e), 16); // ~60fps

    // Touch events
    tray.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
    window.addEventListener('touchmove', throttledMove, { passive: false });
    window.addEventListener('touchend', (e) => this._onEnd(e));
    window.addEventListener('touchcancel', (e) => this._onEnd(e));

    // Canvas events (for Power-ups)
    canvas.addEventListener('mousedown', (e) => this._onCanvasClick(e));
    canvas.addEventListener('touchstart', (e) => this._onCanvasClick(e));

    const bombBtn = document.getElementById('btn-bomb');
    if (bombBtn) {
      bombBtn.addEventListener('mousedown', (e) => this._onBombStart(e));
      bombBtn.addEventListener('touchstart', (e) => this._onBombStart(e), { passive: false });
    }
  }

  // Performance: Throttle function
  throttle(func, wait) {
    let timeout = null;
    let previous = 0;
    return function (...args) {
      const now = Date.now();
      const remaining = wait - (now - previous);
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        func.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          previous = Date.now();
          timeout = null;
          func.apply(this, args);
        }, remaining);
      }
    };
  }

  _onCanvasClick(e) {
    if (!this.game.bombMode || this.game.state !== 'playing') return;

    e.preventDefault();
    const cell = this._getCanvasCell(this._getPos(e));
    if (cell) this.game.useBombAt(cell.row, cell.col);
  }

  _getCanvasCell(pos) {
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = (pos.x - rect.left) * sx;
    const y = (pos.y - rect.top) * sy;
    const col = Math.floor((x - this.game.gridOffset.x) / this.game.cellSize);
    const row = Math.floor((y - this.game.gridOffset.y) / this.game.cellSize);
    if (row < 0 || row >= this.game.GRID_SIZE || col < 0 || col >= this.game.GRID_SIZE) return null;
    return { row, col };
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
    this.lastEvent = e;
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
    this.lastEvent = e;
    if (this.bombDragging) {
      e.preventDefault();
      this._moveBombDrag(this._getPos(e));
      return;
    }
    if (!this.dragging) return;
    e.preventDefault();

    const pos = this._getPos(e);
    this.currentX = pos.x;
    this.currentY = pos.y;

    // Sürüklenen blok ve hayaleti parmağın 100px yukarısında (tam ortada) hizala
    const yOffset = 100;
    const centerX = pos.x;
    const centerY = pos.y - yOffset;

    // Move drag element
    if (this.dragEl) {
      const piece = this.game.pieces[this.dragPieceIndex];
      const shape = piece.shape;
      const dragCellSize = this.game.cellSize;
      const w = shape[0].length * (dragCellSize + 2);
      const h = shape.length * (dragCellSize + 2);

      this.dragEl.style.left = (centerX - w / 2) + 'px';
      this.dragEl.style.top = (centerY - h / 2) + 'px';
    }

    this.game.updateGhost(centerX, centerY, this.dragPieceIndex);
  }

  _onEnd(e) {
    if (this.bombDragging) {
      this._endBombDrag(e);
      return;
    }
    if (!this.dragging) return;

    const pos = this._getPos(e);
    const yOffset = 100;
    const centerX = pos.x;
    const centerY = pos.y - yOffset;

    const success = this.game.tryPlace(centerX, centerY, this.dragPieceIndex);

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
    const yOffset = 100;
    const centerX = startPos.x;
    const centerY = startPos.y - yOffset;

    el.style.left = (centerX - w / 2) + 'px';
    el.style.top = (centerY - h / 2) + 'px';

    document.body.appendChild(el);
    this.dragEl = el;
  }

  _onBombStart(e) {
    if (this.game.state !== 'playing') return;
    if (this.game.powerUps.bomb <= 0) return;
    if (this.game.animatingClear) return;

    e.preventDefault();
    this.lastEvent = e;
    this.bombDragging = true;
    this.game.bombMode = true;
    this.game.updatePowerUpUI();
    this._createBombDragElement(this._getPos(e));
    this.game.audio.pickup();
  }

  _moveBombDrag(pos) {
    this.currentX = pos.x;
    this.currentY = pos.y;
    this.lastEvent = { clientX: pos.x, clientY: pos.y };
    if (!this.bombDragEl) return;
    this.bombDragEl.style.left = `${pos.x}px`;
    this.bombDragEl.style.top = `${pos.y - 72}px`;
  }

  _endBombDrag(e) {
    const pos = this._getPos(e);
    const cell = this._getCanvasCell(pos);
    if (cell) {
      this.game.useBombAt(cell.row, cell.col);
    } else {
      this.game.bombMode = false;
      this.game.updatePowerUpUI();
      this.game.audio.invalid();
    }

    if (this.bombDragEl) {
      this.bombDragEl.remove();
      this.bombDragEl = null;
    }
    this.bombDragging = false;
    this.suppressBombClick = true;
    setTimeout(() => { this.suppressBombClick = false; }, 250);
  }

  _createBombDragElement(startPos) {
    if (this.bombDragEl) this.bombDragEl.remove();
    const el = document.createElement('div');
    el.className = 'drag-bomb';
    el.textContent = '💣';
    document.body.appendChild(el);
    this.bombDragEl = el;
    this._moveBombDrag(startPos);
  }
}
