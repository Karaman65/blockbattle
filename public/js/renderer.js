// ═══════════════════════════════════════════
//  BLOCK BATTLE — Canvas Renderer
// ═══════════════════════════════════════════

class Renderer {
  constructor(game) {
    this.game = game;
    this.particles = [];
    this.flashCells = []; // {r, c, alpha, time}
    this.shockwaves = [];
    this.clearBursts = [];

    // Performance: Gradient cache
    this.gradientCache = new Map();

    // Performance: Particle limits
    this.MAX_PARTICLES = this.game.isMobile ? 36 : 90;
    this.MAX_FLASH_CELLS = this.game.isMobile ? 28 : 72;
    this.MAX_SHOCKWAVES = this.game.isMobile ? 6 : 24;
  }

  drawGrid(ctx, grid, cellSize, offsetX, offsetY, ghost) {
    const G = 9;
    const totalSize = G * cellSize;
    const boardImage = this.game.boardBackgroundImage;
    const hasBoardImage = boardImage && boardImage.complete && boardImage.naturalWidth > 0;

    // Background
    ctx.fillStyle = '#071226';
    ctx.beginPath();
    ctx.roundRect(offsetX - 4, offsetY - 4, totalSize + 8, totalSize + 8, 10);
    ctx.fill();

    if (hasBoardImage) {
      this.drawGridBackgroundImage(ctx, boardImage, offsetX, offsetY, totalSize);
    }

    // Grid cells
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        const val = grid[r][c];

        // Cell background
        const is3x3 = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0;
        ctx.fillStyle = hasBoardImage
          ? (is3x3 ? 'rgba(16, 32, 58, 0.38)' : 'rgba(5, 14, 30, 0.34)')
          : (is3x3 ? '#10203a' : '#0b172d');
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
      const pulse = Math.sin(Math.min(1, fc.time / fc.life) * Math.PI);
      ctx.save();
      ctx.globalAlpha = fc.alpha;
      ctx.fillStyle = this.game.isMobile
        ? `rgba(255, 228, 104, ${0.34 + pulse * 0.18})`
        : `rgba(104, 255, 218, ${0.30 + pulse * 0.28})`;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      ctx.strokeStyle = this.game.isMobile
        ? `rgba(255, 255, 210, ${0.52 + pulse * 0.24})`
        : `rgba(255, 255, 255, ${0.48 + pulse * 0.32})`;
      ctx.lineWidth = this.game.isMobile ? 2 : 2.4;
      ctx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
      ctx.restore();
    }

    // Grid lines — Performance: tüm çizgileri tek path'te birleştir (20x daha az stroke() çağrısı)
    ctx.strokeStyle = hasBoardImage ? 'rgba(96, 255, 218, 0.50)' : 'rgba(52, 211, 153, 0.18)';
    ctx.lineWidth = hasBoardImage ? 1.35 : 1;
    ctx.beginPath();
    for (let i = 0; i <= G; i++) {
      ctx.moveTo(offsetX + i * cellSize, offsetY);
      ctx.lineTo(offsetX + i * cellSize, offsetY + totalSize);
      ctx.moveTo(offsetX, offsetY + i * cellSize);
      ctx.lineTo(offsetX + totalSize, offsetY + i * cellSize);
    }
    ctx.stroke(); // tek seferde çiz

    // Bomb Mode Overlay
    if (this.game.bombMode) {
      this.drawLineBombPreview(ctx, cellSize, offsetX, offsetY);
    }

    this.drawClearBursts(ctx);
    this.drawShockwaves(ctx);
  }

  drawGridBackgroundImage(ctx, image, offsetX, offsetY, totalSize) {
    const imgRatio = image.naturalWidth / image.naturalHeight;
    const boardRatio = 1;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    let sx = 0;
    let sy = 0;

    if (imgRatio > boardRatio) {
      sw = image.naturalHeight * boardRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / boardRatio;
      sy = (image.naturalHeight - sh) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(offsetX, offsetY, totalSize, totalSize, 8);
    ctx.clip();
    ctx.globalAlpha = 0.72;
    ctx.drawImage(image, sx, sy, sw, sh, offsetX, offsetY, totalSize, totalSize);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(2, 8, 20, 0.28)';
    ctx.fillRect(offsetX, offsetY, totalSize, totalSize);
    ctx.restore();
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
      ctx.fillText('💣', offsetX + col * cellSize + cellSize / 2, offsetY + row * cellSize + cellSize / 2);
    }
  }

  drawLineBombPreview(ctx, cellSize, offsetX, offsetY) {
    const target = this.game.bombPreviewCell;
    if (!target) return;
    const { row, col } = target;
    if (row < 0 || row >= 9 || col < 0 || col >= 9) return;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 184, 44, 0.18)';
    for (let c = 0; c < 9; c++) {
      const x = offsetX + c * cellSize;
      const y = offsetY + row * cellSize;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
    for (let r = 0; r < 9; r++) {
      const x = offsetX + col * cellSize;
      const y = offsetY + r * cellSize;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }

    const cx = offsetX + col * cellSize;
    const cy = offsetY + row * cellSize;
    ctx.fillStyle = 'rgba(255, 95, 64, 0.34)';
    ctx.strokeStyle = 'rgba(255, 241, 148, 0.95)';
    ctx.lineWidth = 2;
    ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
    ctx.strokeRect(cx + 3, cy + 3, cellSize - 6, cellSize - 6);

    ctx.strokeStyle = 'rgba(255, 241, 148, 0.72)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(offsetX, cy + cellSize / 2);
    ctx.lineTo(offsetX + 9 * cellSize, cy + cellSize / 2);
    ctx.moveTo(cx + cellSize / 2, offsetY);
    ctx.lineTo(cx + cellSize / 2, offsetY + 9 * cellSize);
    ctx.stroke();
    ctx.restore();
  }

  drawBlock(ctx, x, y, w, h, color) {
    // Ana renk her zaman
    ctx.fillStyle = color.base;
    ctx.fillRect(x, y, w, h);

    if (this.game.isMobile) {
      // Performance: Mobile'da gradient + save/restore atlatılıyor (en büyük GPU tasarrufu)
      // Sadece basit bir parlama efekti — görünüm neredeyse aynı
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 1, y + 1, w - 2, Math.floor(h * 0.38));
    } else {
      // Desktop: tam gradient (cache ile)
      const gradKey = `${color.base}-${h}`;
      let grad = this.gradientCache.get(gradKey);
      if (!grad) {
        grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, color.light);
        grad.addColorStop(0.4, color.base);
        grad.addColorStop(1, color.dark);
        this.gradientCache.set(gradKey, grad);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // İç parlama
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 2, y + 2, w - 4, h * 0.35);
    }

    // Alt gölge (mobile dahil, çok hafif)
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x, y + h - 3, w, 3);
  }

  drawOpponentGrid(ctx, grid, cellSize, offsetX, offsetY) {
    const G = 9;
    const totalSize = G * cellSize;

    ctx.fillStyle = '#071226';
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
          ctx.fillStyle = '#0b172d';
          ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
        }
      }
    }
  }

  // Particle system for line clear effects
  addClearParticles(row, col, cellSize, offsetX, offsetY, colorIndex) {
    if (!this.game.particlesEnabled) return;
    if (this.particles.length >= this.MAX_PARTICLES) return;

    const color = BLOCK_COLORS[(colorIndex - 1) % BLOCK_COLORS.length];
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;

    const particleCount = this.game.isMobile ? 3 : 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.55;
      const speed = (this.game.isMobile ? 58 : 95) + Math.random() * (this.game.isMobile ? 70 : 145);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (this.game.isMobile ? 2.5 : 3.5) + Math.random() * (this.game.isMobile ? 3.5 : 5),
        color: Math.random() > 0.45 ? color.light : '#fff2a6',
        alpha: 1,
        life: (this.game.isMobile ? 0.34 : 0.56) + Math.random() * 0.26,
        age: 0,
      });
    }
  }

  addFlashCells(cells) {
    for (const { r, c } of cells) {
      if (this.flashCells.length >= this.MAX_FLASH_CELLS) break;
      this.flashCells.push({
        r,
        c,
        alpha: this.game.isMobile ? 0.72 : 0.86,
        time: 0,
        life: this.game.isMobile ? 0.32 : 0.42,
      });
    }
  }

  addClearWave(rows, cols, cellSize, offsetX, offsetY) {
    const burstLimit = this.game.isMobile ? 4 : this.MAX_SHOCKWAVES;
    for (const r of rows) {
      if (this.shockwaves.length >= this.MAX_SHOCKWAVES) break;
      if (this.clearBursts.length < burstLimit) {
        this.clearBursts.push({
          kind: 'h',
          row: r,
          col: null,
          cellSize,
          offsetX,
          offsetY,
          alpha: 1,
          life: this.game.isMobile ? 0.34 : 0.48,
          age: 0,
        });
      }
      this.shockwaves.push({
        kind: 'line-h',
        x: offsetX + 4.5 * cellSize,
        y: offsetY + (r + 0.5) * cellSize,
        radius: cellSize,
        maxRadius: cellSize * 4.8,
        width: this.game.isMobile ? 4 : 5,
        color: this.game.isMobile ? 'rgba(255, 232, 120, 0.90)' : 'rgba(0, 243, 255, 0.88)',
        alpha: this.game.isMobile ? 0.82 : 0.78,
        life: this.game.isMobile ? 0.32 : 0.42,
        age: 0,
      });
    }
    for (const c of cols) {
      if (this.shockwaves.length >= this.MAX_SHOCKWAVES) break;
      if (this.clearBursts.length < burstLimit) {
        this.clearBursts.push({
          kind: 'v',
          row: null,
          col: c,
          cellSize,
          offsetX,
          offsetY,
          alpha: 1,
          life: this.game.isMobile ? 0.34 : 0.48,
          age: 0,
        });
      }
      this.shockwaves.push({
        kind: 'line-v',
        x: offsetX + (c + 0.5) * cellSize,
        y: offsetY + 4.5 * cellSize,
        radius: cellSize,
        maxRadius: cellSize * 4.8,
        width: this.game.isMobile ? 4 : 5,
        color: this.game.isMobile ? 'rgba(96, 255, 218, 0.88)' : 'rgba(190, 96, 255, 0.82)',
        alpha: this.game.isMobile ? 0.80 : 0.76,
        life: this.game.isMobile ? 0.32 : 0.42,
        age: 0,
      });
    }
  }

  addBombEffect(row, col, cellSize, offsetX, offsetY) {
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;
    const style = this.game.getBombEffectStyle ? this.game.getBombEffectStyle() : COSMETICS.bombEffect.smoke;

    // Shockwaves always visible (lightweight)
    if (this.shockwaves.length < this.MAX_SHOCKWAVES) {
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
    }

    if (!this.game.particlesEnabled) return;
    if (this.particles.length >= this.MAX_PARTICLES) return;

    const particleCount = this.game.isMobile ? 12 : 30;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (this.game.isMobile ? 62 : 78) + Math.random() * (this.game.isMobile ? 110 : 150);
      const smoke = i % 3 !== 0;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: smoke ? 4 + Math.random() * (this.game.isMobile ? 5 : 8) : 2 + Math.random() * 3,
        color: smoke ? style.smoke[i % style.smoke.length] : style.spark,
        alpha: smoke ? 0.72 : 1,
        life: smoke ? 0.46 + Math.random() * 0.28 : 0.24 + Math.random() * 0.18,
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
    if (this.shockwaves.length >= this.MAX_SHOCKWAVES) return;
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
      const life = fc.life || 0.34;
      fc.alpha = Math.max(0, (1 - fc.time / life) * (this.game.isMobile ? 0.72 : 0.86));
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

    for (let i = this.clearBursts.length - 1; i >= 0; i--) {
      const b = this.clearBursts[i];
      b.age += dt;
      const t = Math.min(1, b.age / b.life);
      b.alpha = Math.max(0, (1 - t) * 0.95);
      if (t >= 1) this.clearBursts.splice(i, 1);
    }
  }

  drawClearBursts(ctx) {
    for (const b of this.clearBursts) {
      const total = 9 * b.cellSize;
      const x = b.offsetX;
      const y = b.offsetY;
      const sweep = Math.min(1, b.age / b.life);
      ctx.save();
      ctx.globalAlpha = b.alpha;
      if (!this.game.isMobile) {
        ctx.shadowBlur = 26;
        ctx.shadowColor = 'rgba(96, 255, 218, 0.65)';
      }

      if (this.game.isMobile) {
        ctx.fillStyle = b.kind === 'h'
          ? `rgba(96, 255, 218, ${0.30 * b.alpha})`
          : `rgba(255, 220, 96, ${0.28 * b.alpha})`;
        if (b.kind === 'h') {
          const yy = y + b.row * b.cellSize;
          ctx.fillRect(x, yy + 1, total, b.cellSize - 2);
          ctx.fillStyle = `rgba(255, 255, 220, ${0.78 * b.alpha})`;
          ctx.fillRect(x + total * sweep - 3, yy + 1, 6, b.cellSize - 2);
        } else {
          const xx = x + b.col * b.cellSize;
          ctx.fillRect(xx + 1, y, b.cellSize - 2, total);
          ctx.fillStyle = `rgba(255, 255, 220, ${0.78 * b.alpha})`;
          ctx.fillRect(xx + 1, y + total * sweep - 3, b.cellSize - 2, 6);
        }
        ctx.restore();
        continue;
      }

      if (b.kind === 'h') {
        const yy = y + b.row * b.cellSize;
        const grad = ctx.createLinearGradient(x, yy, x + total, yy);
        grad.addColorStop(0, 'rgba(96, 255, 218, 0.02)');
        grad.addColorStop(Math.max(0.05, sweep - 0.18), 'rgba(96, 255, 218, 0.12)');
        grad.addColorStop(sweep, 'rgba(255, 250, 190, 0.92)');
        grad.addColorStop(Math.min(1, sweep + 0.18), 'rgba(96, 255, 218, 0.10)');
        grad.addColorStop(1, 'rgba(96, 255, 218, 0.02)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, yy + 1, total, b.cellSize - 2);
        ctx.strokeStyle = 'rgba(255, 244, 174, 0.88)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, yy + b.cellSize / 2);
        ctx.lineTo(x + total, yy + b.cellSize / 2);
        ctx.stroke();
      } else {
        const xx = x + b.col * b.cellSize;
        const grad = ctx.createLinearGradient(xx, y, xx, y + total);
        grad.addColorStop(0, 'rgba(168, 85, 247, 0.02)');
        grad.addColorStop(Math.max(0.05, sweep - 0.18), 'rgba(168, 85, 247, 0.12)');
        grad.addColorStop(sweep, 'rgba(255, 250, 190, 0.92)');
        grad.addColorStop(Math.min(1, sweep + 0.18), 'rgba(168, 85, 247, 0.10)');
        grad.addColorStop(1, 'rgba(168, 85, 247, 0.02)');
        ctx.fillStyle = grad;
        ctx.fillRect(xx + 1, y, b.cellSize - 2, total);
        ctx.strokeStyle = 'rgba(255, 244, 174, 0.88)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xx + b.cellSize / 2, y);
        ctx.lineTo(xx + b.cellSize / 2, y + total);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  drawShockwaves(ctx) {
    for (const w of this.shockwaves) {
      ctx.save();
      ctx.globalAlpha = w.alpha;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width;
      if (!this.game.isMobile) {
        ctx.shadowBlur = 16;
        ctx.shadowColor = w.color;
      }
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
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (!this.game.isMobile) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  get isAnimating() {
    return this.particles.length > 0 || this.flashCells.length > 0 || this.shockwaves.length > 0 || this.clearBursts.length > 0;
  }
}
