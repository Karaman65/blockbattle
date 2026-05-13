// ═══════════════════════════════════════════
//  BLOCK BATTLE — Canvas Renderer
// ═══════════════════════════════════════════

class Renderer {
  constructor(game) {
    this.game = game;
    this.particles = [];
    this.flashCells = []; // {r, c, alpha, time}
    this.shockwaves = [];
  }

  drawGrid(ctx, grid, cellSize, offsetX, offsetY, ghost) {
    const G = 9;
    const totalSize = G * cellSize;
    const hasBoardPhoto = Boolean(this.game.boardBgImage && this.game.boardBgImage.complete);

    // Background
    ctx.fillStyle = '#0b0b24';
    ctx.beginPath();
    ctx.roundRect(offsetX - 4, offsetY - 4, totalSize + 8, totalSize + 8, 10);
    ctx.fill();

    if (hasBoardPhoto) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(offsetX, offsetY, totalSize, totalSize, 8);
      ctx.clip();
      const img = this.game.boardBgImage;
      const scale = Math.max(totalSize / img.width, totalSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = offsetX + (totalSize - dw) / 2;
      const dy = offsetY + (totalSize - dh) / 2;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(7, 8, 30, 0.24)';
      ctx.fillRect(offsetX, offsetY, totalSize, totalSize);
      ctx.restore();
    }

    // Grid cells
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        const val = grid[r][c];

        // Cell background
        const is3x3 = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0;
        ctx.fillStyle = hasBoardPhoto
          ? (is3x3 ? 'rgba(20, 20, 48, 0.32)' : 'rgba(27, 27, 64, 0.24)')
          : (is3x3 ? '#13132e' : '#16163a');
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        // Filled cell
        if (val > 0) {
          this.drawBlock(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, BLOCK_COLORS[(val - 1) % BLOCK_COLORS.length]);
        }
      }
    }

    // Ghost preview
    if (ghost && ghost.cells) {
      for (const cell of ghost.cells) {
        const x = offsetX + cell.c * cellSize;
        const y = offsetY + cell.r * cellSize;
        if (ghost.valid) {
          ctx.fillStyle = 'rgba(0, 255, 136, 0.25)';
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
        } else {
          ctx.fillStyle = 'rgba(255, 71, 87, 0.2)';
          ctx.strokeStyle = 'rgba(255, 71, 87, 0.5)';
        }
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }
    }

    // Flash cells (clearing animation)
    for (const fc of this.flashCells) {
      const x = offsetX + fc.c * cellSize;
      const y = offsetY + fc.r * cellSize;
      ctx.fillStyle = `rgba(255, 255, 255, ${fc.alpha})`;
      ctx.fillRect(x, y, cellSize, cellSize);
    }

    // Grid lines
    ctx.strokeStyle = hasBoardPhoto ? 'rgba(126, 238, 255, 0.34)' : 'rgba(108, 92, 231, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= G; i++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + i * cellSize, offsetY);
      ctx.lineTo(offsetX + i * cellSize, offsetY + totalSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + i * cellSize);
      ctx.lineTo(offsetX + totalSize, offsetY + i * cellSize);
      ctx.stroke();
    }

    ctx.strokeStyle = hasBoardPhoto ? 'rgba(126, 238, 255, 0.52)' : 'rgba(126, 238, 255, 0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= G; i += 3) {
      ctx.beginPath();
      ctx.moveTo(offsetX + i * cellSize, offsetY);
      ctx.lineTo(offsetX + i * cellSize, offsetY + totalSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + i * cellSize);
      ctx.lineTo(offsetX + totalSize, offsetY + i * cellSize);
      ctx.stroke();
    }

    // Bomb Mode Overlay
    if (this.game.bombMode) {
      this.drawBombPreview(ctx, cellSize, offsetX, offsetY);
    }

    this.drawShockwaves(ctx);
  }

  drawBombPreview(ctx, cellSize, offsetX, offsetY) {
    if (!this.game.input.lastEvent) return;
    const pos = this.game.input._getPos(this.game.input.lastEvent);
    if (pos.x == null || pos.y == null) return;
    const rect = document.getElementById('game-canvas').getBoundingClientRect();
    const x = (pos.x - rect.left) * (this.game.canvas.width / rect.width);
    const y = (pos.y - rect.top) * (this.game.canvas.height / rect.height);

    const col = Math.floor((x - offsetX) / cellSize);
    const row = Math.floor((y - offsetY) / cellSize);

    if (row >= 0 && row < 9 && col >= 0 && col < 9) {
      ctx.fillStyle = 'rgba(255, 71, 87, 0.3)';
      ctx.strokeStyle = 'rgba(255, 71, 87, 0.8)';
      ctx.lineWidth = 3;
      
      const rStart = Math.max(0, row - 1);
      const rEnd = Math.min(8, row + 1);
      const cStart = Math.max(0, col - 1);
      const cEnd = Math.min(8, col + 1);

      const bx = offsetX + cStart * cellSize;
      const by = offsetY + rStart * cellSize;
      const bw = (cEnd - cStart + 1) * cellSize;
      const bh = (rEnd - rStart + 1) * cellSize;

      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);

      // Draw crosshair icon
      ctx.font = '24px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', offsetX + col * cellSize + cellSize/2, offsetY + row * cellSize + cellSize/2);
    }
  }

  drawBlock(ctx, x, y, w, h, color) {
    if (this.game.lowPowerMode) {
      ctx.fillStyle = color.base;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.22));
      return;
    }

    // Main color
    ctx.fillStyle = color.base;
    ctx.fillRect(x, y, w, h);

    // Top highlight
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, color.light);
    grad.addColorStop(0.4, color.base);
    grad.addColorStop(1, color.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    // Inner shine
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 2, y + 2, w - 4, h * 0.35);

    // Bottom shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x, y + h - 3, w, 3);
  }

  drawOpponentGrid(ctx, grid, cellSize, offsetX, offsetY) {
    const G = 9;
    const totalSize = G * cellSize;

    ctx.fillStyle = '#0b0b22';
    ctx.beginPath();
    ctx.roundRect(offsetX - 2, offsetY - 2, totalSize + 4, totalSize + 4, 6);
    ctx.fill();

    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        const val = grid[r][c];

        if (val > 0) {
          ctx.fillStyle = BLOCK_COLORS[(val - 1) % BLOCK_COLORS.length].base;
          ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
        } else {
          ctx.fillStyle = '#111130';
          ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
        }
      }
    }
  }

  // Particle system for line clear effects
  addClearParticles(row, col, cellSize, offsetX, offsetY, colorIndex) {
    const color = BLOCK_COLORS[(colorIndex - 1) % BLOCK_COLORS.length];
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: color.base,
        alpha: 1,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
      });
    }
  }

  addFlashCells(cells) {
    for (const { r, c } of cells) {
      this.flashCells.push({ r, c, alpha: 0.9, time: 0 });
    }
  }

  addClearWave(rows, cols, cellSize, offsetX, offsetY) {
    for (const r of rows) {
      this.shockwaves.push({
        kind: 'line-h',
        x: offsetX + 4.5 * cellSize,
        y: offsetY + (r + 0.5) * cellSize,
        radius: cellSize,
        maxRadius: cellSize * 4.8,
        width: 3,
        color: 'rgba(0, 243, 255, 0.75)',
        alpha: 0.65,
        life: 0.35,
        age: 0,
      });
    }
    for (const c of cols) {
      this.shockwaves.push({
        kind: 'line-v',
        x: offsetX + (c + 0.5) * cellSize,
        y: offsetY + 4.5 * cellSize,
        radius: cellSize,
        maxRadius: cellSize * 4.8,
        width: 3,
        color: 'rgba(157, 0, 255, 0.68)',
        alpha: 0.6,
        life: 0.35,
        age: 0,
      });
    }
  }

  addBombEffect(row, col, cellSize, offsetX, offsetY) {
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;
    const style = this.game.getBombEffectStyle ? this.game.getBombEffectStyle() : COSMETICS.bombEffect.smoke;
    this.shockwaves.push({
      kind: 'circle',
      x: cx,
      y: cy,
      radius: cellSize * 0.2,
      maxRadius: cellSize * 2.25,
      width: 6,
      color: style.ring,
      alpha: 0.82,
      life: 0.42,
      age: 0,
    });
    this.shockwaves.push({
      kind: 'circle',
      x: cx,
      y: cy,
      radius: cellSize * 0.12,
      maxRadius: cellSize * 0.95,
      width: 5,
      color: style.core,
      alpha: 0.7,
      life: 0.22,
      age: 0,
    });

    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 135;
      const smoke = i % 3 !== 0;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: smoke ? 4 + Math.random() * 7 : 2 + Math.random() * 3,
        color: smoke ? style.smoke[i % style.smoke.length] : style.spark,
        alpha: smoke ? 0.72 : 1,
        life: smoke ? 0.55 + Math.random() * 0.28 : 0.24 + Math.random() * 0.16,
        age: 0,
      });
    }
  }

  addPowerBurst(type) {
    const tray = document.getElementById('piece-tray');
    const canvas = document.getElementById('game-canvas');
    if (!tray || !canvas) return;
    const trayRect = tray.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const cx = trayRect.left - canvasRect.left + trayRect.width / 2;
    const cy = trayRect.top - canvasRect.top + trayRect.height / 2;
    this.shockwaves.push({
      kind: 'circle',
      x: cx,
      y: cy,
      radius: 14,
      maxRadius: 72,
      width: 3,
      color: type === 'rotate' ? 'rgba(0, 243, 255, 0.72)' : 'rgba(0, 255, 157, 0.72)',
      alpha: 0.55,
      life: 0.38,
      age: 0,
    });
  }

  updateParticles(dt) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      p.alpha = 1 - p.age / p.life;
      p.size *= 0.98;
    }

    // Update flash cells
    for (let i = this.flashCells.length - 1; i >= 0; i--) {
      const fc = this.flashCells[i];
      fc.time += dt;
      fc.alpha = Math.max(0, 0.9 - fc.time * 3);
      if (fc.alpha <= 0) {
        this.flashCells.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.age += dt;
      const t = Math.min(1, w.age / w.life);
      w.radius += (w.maxRadius - w.radius) * Math.min(1, dt * 9);
      w.alpha = (1 - t) * 0.75;
      w.width = Math.max(1, w.width * 0.985);
      if (t >= 1) this.shockwaves.splice(i, 1);
    }
  }

  drawShockwaves(ctx) {
    for (const w of this.shockwaves) {
      ctx.save();
      ctx.globalAlpha = w.alpha;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width;
      ctx.beginPath();
      if (w.kind === 'line-h') {
        ctx.moveTo(w.x - w.radius, w.y);
        ctx.lineTo(w.x + w.radius, w.y);
      } else if (w.kind === 'line-v') {
        ctx.moveTo(w.x, w.y - w.radius);
        ctx.lineTo(w.x, w.y + w.radius);
      } else {
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  get isAnimating() {
    return this.particles.length > 0 || this.flashCells.length > 0 || this.shockwaves.length > 0;
  }
}
