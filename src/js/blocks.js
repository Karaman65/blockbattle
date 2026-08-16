export function applyBlocks(Game) {
  Object.assign(Game.prototype, {
    generatePieces() {
      this.pieces = this.shouldUseEndlessFlow()
        ? this.generateEndlessPieceSet()
        : generatePieceSet(this.rng);
      this.blockSetIndex++;
      this.renderPieceTray();
      this.markRenderDirty();
    },

    shouldUseEndlessFlow() {
      return this.mode === 'solo' && !this.currentLevel;
    },

    getEndlessStage() {
      const byScore = Math.floor(this.score / 450);
      const bySets = Math.floor(this.blockSetIndex / 4);
      return Math.min(8, Math.max(byScore, bySets));
    },

    getShapePlacementCount(shape) {
      let count = 0;
      for (let r = 0; r < this.GRID_SIZE; r++) {
        for (let c = 0; c < this.GRID_SIZE; c++) {
          if (this.canPlace(shape, r, c)) count++;
        }
      }
      return count;
    },

    getEndlessPieceCandidates(stage, slotIndex, usedNames) {
      const friendlyNames = new Set([
        'h3', 'v3', 'h4', 'v4', 'sq2',
        'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
        'T1', 'T2', 'T3', 'T4',
        'C1', 'C2', 'C3', 'C4',
        'cup1', 'cup2', 'cup3', 'cup4',
        'chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5', 'chunk6', 'chunk7', 'chunk8'
      ]);
      const hardNames = new Set(['sq3', 'plus', 'bridge', 'ring', 'gem1', 'gem2', 'hook1', 'hook2', 'hook3', 'hook4', 'claw1', 'claw2', 'claw3', 'claw4']);
      const maxCells = stage <= 1 ? 5 : stage <= 3 ? 6 : stage <= 5 ? 7 : 9;
      const minCells = stage <= 1 ? 3 : stage <= 4 ? 2 : 1;
      const minPlacements = stage <= 1 ? 10 : stage <= 3 ? 5 : 1;
      const allowHard = stage >= 3 || (stage >= 2 && slotIndex === 2);
    
      let candidates = BLOCK_SHAPES.map(def => ({
        def,
        cells: getShapeCells(def.shape).length,
        placements: this.getShapePlacementCount(def.shape)
      })).filter(item =>
        item.placements >= minPlacements &&
        item.cells >= minCells &&
        item.cells <= maxCells &&
        !usedNames.has(item.def.name) &&
        (allowHard || !hardNames.has(item.def.name))
      );
    
      if (stage <= 1) {
        candidates = candidates.filter(item => friendlyNames.has(item.def.name));
      }
    
      if (candidates.length === 0) {
        candidates = BLOCK_SHAPES.map(def => ({
          def,
          cells: getShapeCells(def.shape).length,
          placements: this.getShapePlacementCount(def.shape)
        })).filter(item => item.placements > 0 && !usedNames.has(item.def.name));
      }
    
      return candidates;
    },

    pickWeightedEndlessShape(candidates, stage) {
      const weights = candidates.map(item => {
        const fitWeight = stage <= 2 ? item.placements * 1.4 : item.placements * 0.7;
        const sizeWeight = stage <= 2 ? item.cells * 4 : item.cells * (2.2 + stage * 0.12);
        const hardBoost = stage >= 4 && item.cells >= 6 ? stage * 1.4 : 0;
        return Math.max(1, fitWeight + sizeWeight + hardBoost);
      });
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let roll = this.rng.next() * total;
      for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return candidates[i].def;
      }
      return candidates[candidates.length - 1].def;
    },

    generateEndlessPieceSet() {
      const pieces = [];
      const usedNames = new Set();
      const stage = this.getEndlessStage();
    
      for (let i = 0; i < 3; i++) {
        const candidates = this.getEndlessPieceCandidates(stage, i, usedNames);
        const shapeDef = this.pickWeightedEndlessShape(candidates, stage);
        usedNames.add(shapeDef.name);
        pieces.push({
          shape: shapeDef.shape,
          colorIndex: this.rng.nextInt(0, BLOCK_COLORS.length - 1),
          placed: false,
          name: shapeDef.name,
        });
      }
    
      return pieces;
    },

    renderPieceTray() {
      const tray = document.getElementById('piece-tray');
      tray.innerHTML = '';
      this.pieces.forEach((piece, i) => {
        const slot = document.createElement('div');
        slot.className = 'piece-slot' + (piece.placed ? ' placed' : '');
        slot.dataset.index = i;
        const grid = document.createElement('div');
        grid.className = 'piece-grid';
        grid.style.gridTemplateColumns = `repeat(${piece.shape[0].length}, 1fr)`;
        const color = BLOCK_COLORS[piece.colorIndex];
        for (let r = 0; r < piece.shape.length; r++) {
          for (let c = 0; c < piece.shape[r].length; c++) {
            const cell = document.createElement('div');
            cell.className = piece.shape[r][c] ? 'piece-cell filled' : 'piece-cell empty';
            if (piece.shape[r][c]) cell.style.background = `linear-gradient(135deg, ${color.light}, ${color.base})`;
            grid.appendChild(cell);
          }
        }
        slot.appendChild(grid); tray.appendChild(slot);
      });
      this.markRenderDirty();
    },

    useRotate() {
      if (this.powerUps.rotate <= 0) return;
      this.powerUps.rotate--;
      this.authManager.decrementInventory('rotate');
    
      this.pieces.forEach(p => {
        if (!p.placed) p.shape = rotateShape(p.shape);
      });
    
      this.renderPieceTray();
      this.renderer.addPowerBurst('rotate');
      this.markRenderDirty();
      this.pulsePieceTray();
      this.updatePowerUpUI();
      this.audio.pickup();
    },

    useSkip() {
      if (this.powerUps.skip <= 0) return;
      this.powerUps.skip--;
      this.authManager.decrementInventory('skip');
    
      this.generatePieces();
      this.renderer.addPowerBurst('skip');
      this.markRenderDirty();
      this.pulsePieceTray();
      this.updatePowerUpUI();
      this.audio.pickup();
    }
  });
}
