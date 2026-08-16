export function applyBoard(Game) {
  Object.assign(Game.prototype, {
    resetGrid() {
      this.grid = [];
      for (let r = 0; r < this.GRID_SIZE; r++) this.grid.push(new Array(this.GRID_SIZE).fill(0));
      this.markRenderDirty();
    },

    resizeCanvas() {
      const ga = document.getElementById('game-area');
      const fallbackWidth = Math.min(window.innerWidth || 360, 780);
      const fallbackHeight = Math.max(280, (window.innerHeight || 640) - 270);
      const mobileViewport = this.isMobile || (window.innerWidth || 0) <= 720;
      const mobileSolo = mobileViewport && this.mode !== 'online';
      const mobileOnline = mobileViewport && this.mode === 'online';
      const measuredWidth = ga && ga.clientWidth ? ga.clientWidth : fallbackWidth;
      const measuredHeight = ga && ga.clientHeight ? ga.clientHeight : fallbackHeight;
      const cssVars = getComputedStyle(document.documentElement);
      const adHeight = (document.body.classList.contains('ad-banner-visible') && !document.body.classList.contains('premium-no-ads'))
        ? (parseFloat(cssVars.getPropertyValue('--ad-banner-height')) || 64)
        : 0;
      const viewportHeight = window.innerHeight || fallbackHeight;
      const mobileWidth = Math.min(window.innerWidth || fallbackWidth, 520) - 24;
      const mobileVerticalReserve = this.mode === 'online' ? 390 : 290;
      const mobileHeight = Math.max(280, viewportHeight - mobileVerticalReserve - adHeight);
      const mobileGame = mobileSolo || mobileOnline;
      const boardChromeSpace = mobileGame ? 28 : 4;
      const availableWidth = Math.max((mobileGame ? mobileWidth : measuredWidth) - boardChromeSpace, 240);
      const availableHeight = Math.max((mobileGame ? mobileHeight : measuredHeight) - 4, 240);
      let widthForMainBoard = availableWidth;
      if (this.mode === 'online' && !mobileOnline) {
        const gap = window.innerWidth <= 480 ? 8 : 16;
        const onlineWidthLimitedCellSize = Math.floor((availableWidth - gap - 20) / 12.6);
        widthForMainBoard = Math.max(onlineWidthLimitedCellSize * this.GRID_SIZE, 0);
      }
      let cs = Math.floor(Math.min(widthForMainBoard, availableHeight) / this.GRID_SIZE);
      const mobileMaxCell = viewportHeight <= 760 ? 30 : (viewportHeight <= 860 ? 32 : 34);
      cs = Math.min(cs, this.mode === 'online' ? (mobileOnline ? mobileMaxCell : 68) : (mobileSolo ? mobileMaxCell : 82));
      cs = Math.max(cs, this.mode === 'online' ? (mobileOnline ? 29 : 20) : (mobileSolo ? 29 : 30));
      this.cellSize = cs;
      const gp = this.GRID_SIZE * cs;
    
      this.canvas.width = gp + 12;
      this.canvas.height = gp + 12;
      this.canvas.style.width = '';
      this.canvas.style.height = '';
      this.canvasRect = this.canvas.getBoundingClientRect();
      this.gridOffset = { x: 6, y: 6 };
      this.markRenderDirty();
    
      if (this.mode === 'online') {
        this.opponentCellSize = mobileOnline ? Math.max(Math.floor(cs * 0.18), 6) : Math.max(Math.floor(cs * 0.4), 12);
        const op = this.GRID_SIZE * this.opponentCellSize;
        this.opponentCanvas.width = op + 8;
        this.opponentCanvas.height = op + 8;
        this.opponentCanvas.style.width = '';
        this.opponentCanvas.style.height = '';
        this.opponentBoardDirty = true;
      }
    },

    drawCurrentFrame() {
      if (!this.ctx || !this.canvas || !this.grid.length) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.renderer.drawGrid(this.ctx, this.grid, this.cellSize, this.gridOffset.x, this.gridOffset.y, this.ghost);
      this.renderDirty = false;
      this.drawOpponentIfDirty();
    },

    drawOpponentIfDirty() {
      if (this.mode === 'online' && this.opponentCtx && this.opponentBoardDirty) {
        this.opponentCtx.clearRect(0, 0, this.opponentCanvas.width, this.opponentCanvas.height);
        if (this.opponentBoard) {
          this.renderer.drawOpponentGrid(this.opponentCtx, this.opponentBoard, this.opponentCellSize, 4, 4);
        }
        this.opponentBoardDirty = false;
      }
    },

    updateGhost(screenX, screenY, pieceIndex) {
      const piece = this.pieces[pieceIndex];
      if (!piece || piece.placed) {
        if (this.ghost) this.markRenderDirty();
        this.ghost = null;
        return;
      }
    
      const shape = piece.shape; const rows = shape.length; const cols = shape[0].length;
      const rect = this.canvasRect || this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const sx = this.canvas.width / rect.width; const sy = this.canvas.height / rect.height;
      const cx = (screenX - rect.left) * sx - this.gridOffset.x;
      const cy = (screenY - rect.top) * sy - this.gridOffset.y;
      const gc = Math.round(cx / this.cellSize - cols / 2);
      const gr = Math.round(cy / this.cellSize - rows / 2);
      if (this.input._lastGhostRow === gr && this.input._lastGhostCol === gc && this.input._lastGhostPieceIndex === pieceIndex) {
        return;
      }
      this.input._lastGhostX = screenX;
      this.input._lastGhostY = screenY;
      this.input._lastGhostRow = gr;
      this.input._lastGhostCol = gc;
      this.input._lastGhostPieceIndex = pieceIndex;
      const valid = this.canPlace(shape, gr, gc);
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (shape[r][c]) cells.push({ r: gr + r, c: gc + c });
      const prev = this.ghost;
      this.ghost = { row: gr, col: gc, valid, cells };
      if (!prev || prev.row !== gr || prev.col !== gc || prev.valid !== valid) this.markRenderDirty();
    },

    clearGhost() {
      if (this.ghost) this.markRenderDirty();
      this.ghost = null;
    },

    setBombPreviewFromScreenPoint(screenX, screenY) {
      if (!this.canvas) return;
      const rect = this.canvasRect || this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const sx = this.canvas.width / rect.width;
      const sy = this.canvas.height / rect.height;
      const x = (screenX - rect.left) * sx;
      const y = (screenY - rect.top) * sy;
      const col = Math.floor((x - this.gridOffset.x) / this.cellSize);
      const row = Math.floor((y - this.gridOffset.y) / this.cellSize);
      const next = row >= 0 && row < this.GRID_SIZE && col >= 0 && col < this.GRID_SIZE
        ? { row, col }
        : null;
      const prev = this.bombPreviewCell;
      this.bombPreviewCell = next;
      if (!prev || !next || prev.row !== next.row || prev.col !== next.col) this.markRenderDirty();
    },

    clearBombPreview() {
      if (this.bombPreviewCell) this.markRenderDirty();
      this.bombPreviewCell = null;
    },

    canPlace(shape, sr, sc) {
      for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const gr = sr + r, gc = sc + c;
        if (gr < 0 || gr >= this.GRID_SIZE || gc < 0 || gc >= this.GRID_SIZE) return false;
        if (this.grid[gr][gc] !== 0) return false;
      }
      return true;
    },

    tryPlace(screenX, screenY, pieceIndex) {
      if (this.mode === 'online' && this.onlineLocked) {
        this.audio.invalid();
        this.vibrate([30, 25, 30]);
        return false;
      }
      if (!this.ghost || !this.ghost.valid) {
        this.audio.invalid();
        this.vibrate([30, 25, 30]);
        return false;
      }
      const piece = this.pieces[pieceIndex]; const shape = piece.shape; const colorVal = piece.colorIndex + 1;
      for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) if (shape[r][c]) this.grid[this.ghost.row + r][this.ghost.col + c] = colorVal;
      this.markRenderDirty();
      this.score += getShapeCells(shape).length;
      piece.placed = true; this.audio.place(); this.vibrate(14);
      const slot = document.querySelector(`.piece-slot[data-index="${pieceIndex}"]`);
      if (slot) slot.classList.add('placed');
      const clearedLines = this.checkAndClearLines();
      if (this.pieces.every(p => p.placed)) this.generatePieces();
      if (this.mode === 'solo' && this.currentLevel && this.score >= this.currentLevel.target) {
        this.updateScoreDisplay();
        this.completeCurrentLevel();
        return true;
      }
      if (clearedLines) {
        if (this.mode === 'online') this.network.sendBoardUpdate(this.grid, this.score);
        this.updateScoreDisplay();
        setTimeout(() => this.checkGameOverAfterClear(), 320);
        return true;
      }
      if (this.checkGameOver()) {
        if (this.mode === 'online') {
          this.onOnlineLocked();
          this.network.sendBoardUpdate(this.grid, this.score);
          this.updateScoreDisplay();
          return true;
        }
        this.onGameOver();
        return true;
      }
      if (this.mode === 'online') this.network.sendBoardUpdate(this.grid, this.score);
      this.updateScoreDisplay();
      return true;
    },

    checkAndClearLines() {
      const clearRows = [], clearCols = [];
      for (let r = 0; r < this.GRID_SIZE; r++) if (this.grid[r].every(c => c !== 0)) clearRows.push(r);
      for (let c = 0; c < this.GRID_SIZE; c++) { let full = true; for (let r = 0; r < this.GRID_SIZE; r++) if (this.grid[r][c] === 0) { full = false; break; } if (full) clearCols.push(c); }
      const total = clearRows.length + clearCols.length;
      if (total === 0) { this.combo = 0; return false; }
    
      // Award coins: 10 per line, 20 bonus for each combo level
      const coinsEarned = (total * 10) + (this.combo > 1 ? (this.combo - 1) * 20 : 0);
      // Performance: Firebase'e tek tek yazmak yerine batch'le, oyun sonunda gönder
      this.queueCoins(coinsEarned);
    
      this.combo++;
      const cells = new Set();
      for (const r of clearRows) for (let c = 0; c < this.GRID_SIZE; c++) cells.add(`${r},${c}`);
      for (const c of clearCols) for (let r = 0; r < this.GRID_SIZE; r++) cells.add(`${r},${c}`);
      const arr = [];
      for (const k of cells) { const [r, c] = k.split(',').map(Number); this.renderer.addClearParticles(r, c, this.cellSize, this.gridOffset.x, this.gridOffset.y, this.grid[r][c]); arr.push({ r, c }); }
      this.renderer.addFlashCells(arr);
      this.renderer.addClearWave(clearRows, clearCols, this.cellSize, this.gridOffset.x, this.gridOffset.y);
      this.pulseBoardClear(total > 1 ? 'strong' : 'normal');
      this.markRenderDirty();
      const pts = cells.size + total * 18 + (this.combo > 1 ? this.combo * 15 : 0);
      this.score += pts;
      this.showScorePopup(pts);
      if (this.combo > 1) { this.showCombo(this.combo); this.audio.combo(this.combo); }
      this.audio.clear(total);
      this.vibrate(total > 1 ? [22, 25, 36] : 24);
      for (const k of cells) { const [r, c] = k.split(',').map(Number); this.grid[r][c] = 0; }
      this.markRenderDirty();
      this.animatingClear = true;
      setTimeout(() => {
        this.animatingClear = false;
        this.renderer.flashCells = [];
        this.markRenderDirty();
      }, this.isMobile ? 320 : 420);
      return true;
    },

    checkGameOverAfterClear() {
      if (this.state !== 'playing') return;
      if (this.mode === 'solo' && this.currentLevel && this.score >= this.currentLevel.target) {
        this.completeCurrentLevel();
        return;
      }
      if (!this.checkGameOver()) return;
      if (this.mode === 'online') {
        this.onOnlineLocked();
        this.network.sendBoardUpdate(this.grid, this.score);
        this.updateScoreDisplay();
        return;
      }
      this.onGameOver();
    },

    useBombAt(row, col) {
      if (this.powerUps.bomb <= 0) return;
      this.powerUps.bomb--;
      if (this.rewardBombs > 0) this.rewardBombs--;
      else this.authManager.decrementInventory('bomb');
      this.bombMode = false;
      this.clearBombPreview();
    
      const cells = [];
      for (let c = 0; c < this.GRID_SIZE; c++) cells.push({ r: row, c });
      for (let r = 0; r < this.GRID_SIZE; r++) if (r !== row) cells.push({ r, c: col });
    
      this.renderer.addFlashCells(cells);
      this.renderer.addBombEffect(row, col, this.cellSize, this.gridOffset.x, this.gridOffset.y);
      this.renderer.addClearWave([row], [col], this.cellSize, this.gridOffset.x, this.gridOffset.y);
      this.pulseBoardClear('strong');
    
      for (const cell of cells) {
        this.grid[cell.r][cell.c] = 0;
      }
      this.markRenderDirty();
    
      this.audio.pickup();
      this.vibrate([28, 30, 46]);
      this.updatePowerUpUI();
      this.checkAndClearLines();
    }
  });
}
