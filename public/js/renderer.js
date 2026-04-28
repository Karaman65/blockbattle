// ═══════════════════════════════════════════
//  BLOCK BATTLE — Canvas Renderer
// ═══════════════════════════════════════════

class Renderer {
  constructor(game) {
    this.game = game;
    this.particles = [];
    this.flashCells = []; // {r, c, alpha, time}
  }

  drawGrid(ctx, grid, cellSize, offsetX, offsetY, ghost) {
    const G = 9;
    const totalSize = G * cellSize;

    // Background
    ctx.fillStyle = '#0e0e28';
    ctx.beginPath();
    ctx.roundRect(offsetX - 4, offsetY - 4, totalSize + 8, totalSize + 8, 10);
    ctx.fill();

    // Grid cells
    for (let r = 0; r < G; r++) {
      for (let c = 0; c < G; c++) {
        const x = offsetX + c * cellSize;
        const y = offsetY + r * cellSize;
        const val = grid[r][c];

        // Cell background
        const is3x3 = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0;
        ctx.fillStyle = is3x3 ? '#13132e' : '#16163a';
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
    ctx.strokeStyle = 'rgba(108, 92, 231, 0.12)';
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

    // Bomb Mode Overlay
    if (this.game.bombMode) {
      this.drawBombPreview(ctx, cellSize, offsetX, offsetY);
    }
  }

  drawBombPreview(ctx, cellSize, offsetX, offsetY) {
    const pos = this.game.input._getPos(this.game.input.lastEvent || {});
    const rect = document.getElementById('game-canvas').getBoundingClientRect();
    const x = pos.x - rect.left;
    const y = pos.y - rect.top;

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
    return this.particles.length > 0 || this.flashCells.length > 0;
  }
}
