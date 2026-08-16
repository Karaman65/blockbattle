export function applyScoring(Game) {
  Object.assign(Game.prototype, {
    async recordCompletedGame(won = false) {
      if (this.gameCompletionRecorded) return;
      this.gameCompletionRecorded = true;
      this.updateQuestProgress(won);
      this.renderHomeQuestPreview();
      if (this.isGuestSession()) {
        const best = Math.max(parseInt(localStorage.getItem('blockBattleGuestHighScore') || '0', 10), this.score || 0);
        localStorage.setItem('blockBattleGuestHighScore', String(best));
        if (this.authManager.userData) this.authManager.userData.highScore = best;
        this.highScore = best;
        this.updatePlayerHeader();
        return;
      }
      if (!this.authManager.isLoggedIn()) return;
      try {
        await this.dbManager.updateHighScore(this.authManager.user.uid, this.score, this.authManager.getUsername(), won);
        await this.authManager.loadUserData();
        this.highScore = Math.max(this.highScore, (this.authManager.userData && this.authManager.userData.highScore) || 0);
        this.updateCoinDisplays();
        this.updatePlayerHeader();
      } catch (e) {
        console.error(e);
      }
    },

    createLevels() {
      const titles = [
        'Isınma', 'Hat Temizliği', 'Köşe Baskısı', 'Dar Koridor', 'Çift Cephe',
        'Neon Kilit', 'Yoğun Alan', 'Siber Kuşatma', 'Son Hat', 'Final Çekirdeği',
        'Denge Taşı', 'Kırık Rota', 'Çapraz Baskı', 'Sıkışan Alan', 'Kristal Hat',
        'Gölge Blok', 'Çifte Kilit', 'Keskin Dönüş', 'Dar Boğaz', 'Sert Zemin',
        'Neon Geçit', 'Basınç Odası', 'Kapanan Yol', 'Derin Izgara', 'Kilitli Merkez',
        'Sıfır Hata', 'Hız Koridoru', 'Parça Fırtınası', 'Ağır Alan', 'Kritik Hat',
        'Karanlık Çekirdek', 'Yan Duvar', 'Sert Kombolar', 'Son Savunma', 'Aşırı Baskı',
        'Yüksek Voltaj', 'Çöküş Noktası', 'Kırmızı Alarm', 'Daralan Çember', 'Usta Alanı',
        'Siber Kapan', 'Kilit Yağmuru', 'Gölge Kuşatma', 'Keskin Final', 'Kabus Koridoru',
        'Son Düğüm', 'Çekirdek Savaşı', 'Mutlak Baskı', 'Efsane Hat', 'Block Battle'
      ];
      const baseLevels = [
        { target: 120, blockers: 0 },
        { target: 220, blockers: 4 },
        { target: 340, blockers: 7 },
        { target: 480, blockers: 10 },
        { target: 650, blockers: 13 },
        { target: 850, blockers: 16 },
        { target: 1100, blockers: 19 },
        { target: 1400, blockers: 22 },
        { target: 1750, blockers: 25 },
        { target: 2200, blockers: 28 }
      ];
      const difficultyFor = (id) => {
        if (id <= 2) return 'Kolay';
        if (id <= 5) return 'Orta';
        if (id <= 8) return 'Zor';
        if (id <= 14) return 'Usta';
        if (id <= 24) return 'Elit';
        if (id <= 36) return 'Efsane';
        return 'Kabus';
      };
    
      return Array.from({ length: 50 }, (_, index) => {
        const id = index + 1;
        const base = baseLevels[index];
        const extra = Math.max(0, id - 10);
        return {
          id,
          title: titles[index],
          target: base ? base.target : Math.round(2200 + extra * 170 + Math.pow(extra, 1.35) * 45),
          blockers: base ? base.blockers : Math.min(44, 28 + Math.floor(extra * 0.4)),
          difficulty: difficultyFor(id)
        };
      });
    },

    renderLevelMap() {
      const map = document.getElementById('level-map');
      if (!map) return;
      this.unlockedLevel = this.getSavedUnlockedLevel();
      map.innerHTML = '';
      this.levels.forEach(level => {
        const isUnlocked = level.id <= Math.min(this.unlockedLevel, this.levels.length);
        const isCompleted = level.id < this.unlockedLevel;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `level-card${isCompleted ? ' completed' : ''}${level.id === Math.min(this.unlockedLevel, this.levels.length) ? ' active' : ''}${!isUnlocked ? ' locked' : ''}`;
        btn.disabled = !isUnlocked && !this.isGuestSession();
        btn.innerHTML = `
          <span class="level-card-art" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <div class="level-card-top">
            <span class="level-number">${level.id}</span>
            <span class="level-state">${isCompleted ? 'BİTTİ' : isUnlocked ? 'OYNA' : 'KİLİT'}</span>
          </div>
          <div class="level-title">${level.title}</div>
          <div class="level-card-bottom">
            <span class="level-target">${level.target} skor</span>
            <span class="level-difficulty">${level.difficulty}</span>
          </div>`;
        btn.onclick = () => {
          if (this.isGuestSession()) {
            this.requireAccount('Level modunu oynamak için giriş yap veya hesap oluştur.');
            return;
          }
          this.startSoloGame(level.id);
        };
        map.appendChild(btn);
      });
    },

    applyLevelSetup(level) {
      if (!level || level.blockers <= 0) return;
      const rng = new SeededRandom(9000 + level.id * 97);
      let placed = 0;
      let guard = 0;
      while (placed < level.blockers && guard < 400) {
        guard++;
        const r = rng.nextInt(0, this.GRID_SIZE - 1);
        const c = rng.nextInt(0, this.GRID_SIZE - 1);
        const keepCenterOpen = r >= 3 && r <= 5 && c >= 3 && c <= 5;
        if (keepCenterOpen || this.grid[r][c] !== 0) continue;
        this.grid[r][c] = (placed % BLOCK_COLORS.length) + 1;
        placed++;
      }
    },

    async completeCurrentLevel() {
      if (!this.currentLevel) return;
      await this._flushCoins(); // Performance: birikmiş coin'leri tek seferde yaz
      const nextLevel = Math.min(this.currentLevel.id + 1, this.levels.length + 1);
      if (this.currentLevel.id >= this.unlockedLevel) {
        await this.saveUnlockedLevel(nextLevel);
      }
      this.state = 'gameover';
      this.audio.win();
      this.vibrate([30, 35, 55]);
      this.recordCompletedGame(true);
      if (this.hasAccount()) {
        const bonus = 75 + this.currentLevel.id * 25;
        this.authManager.addCoins(bonus, 'level_complete', { levelId: this.currentLevel.id }).then(() => this.updateCoinDisplays());
      }
      this.updatePlayerHeader();
      this.showGameOverScreen(true, `${this.currentLevel.id}. bölüm tamamlandı!`);
    },

    startNextLevel() {
      if (!this.currentLevel) return;
      const nextLevelId = this.currentLevel.id + 1;
      if (nextLevelId > this.levels.length) {
        this.showScreen('map-screen');
        return;
      }
      this.startSoloGame(nextLevelId);
    },

    startSoloGame(levelId = 1) {
      if (this.isGuestSession()) {
        this.requireAccount('Level modunu oynamak için giriş yap veya hesap oluştur.');
        return;
      }
      this.audio.init(); this.audio.resume();
      const requestedLevel = this.levels.find(level => level.id === levelId) || this.levels[0];
      const highestPlayable = Math.min(this.unlockedLevel, this.levels.length);
      this.currentLevel = requestedLevel.id <= highestPlayable ? requestedLevel : this.levels[highestPlayable - 1];
      this.targetScore = this.currentLevel.target;
      this.mode = 'solo'; this.state = 'playing'; this.score = 0; this.combo = 0; this.animatingClear = false;
      this.rewardContinueUsed = false; this.rewardBombs = 0;
      this.gameCompletionRecorded = false; this.gameOverHandled = false;
      this.seed = Date.now(); this.rng = new SeededRandom(this.seed); this.blockSetIndex = 0;
      this.resetGrid(); this.applyLevelSetup(this.currentLevel); this.generatePieces();
      this.resetPowerUps();
      document.getElementById('opponent-board-wrap').classList.add('hidden');
      document.getElementById('opponent-score-box').classList.add('hidden');
      document.getElementById('timer-box').classList.add('hidden');
      this.updateLevelBadge();
      this.updateScoreDisplay();
      this.enterGameScreen(`Level ${this.currentLevel.id}`, `${this.currentLevel.target} hedef skor`);
    },

    startEndlessGame() {
      this.audio.init(); this.audio.resume();
      this.currentLevel = null;
      this.targetScore = 0;
      this.mode = 'solo';
      this.state = 'playing';
      this.score = 0;
      this.combo = 0;
      this.animatingClear = false;
      this.rewardContinueUsed = false;
      this.rewardBombs = 0;
      this.gameCompletionRecorded = false;
      this.gameOverHandled = false;
      this.seed = Date.now();
      this.rng = new SeededRandom(this.seed);
      this.blockSetIndex = 0;
      this.resetGrid();
      this.generatePieces();
      this.resetPowerUps();
      document.getElementById('opponent-board-wrap').classList.add('hidden');
      document.getElementById('opponent-score-box').classList.add('hidden');
      document.getElementById('timer-box').classList.add('hidden');
      this.updateLevelBadge();
      this.updateScoreDisplay();
      this.enterGameScreen('Sonsuz arena', 'En iyi skorunu kur');
    },

    showScorePopup(pts) {
      const c = document.getElementById('score-popup-container');
      const p = document.createElement('div'); p.className = 'score-popup'; p.textContent = `+${pts}`;
      p.style.left = '50%'; p.style.top = '40%'; p.style.transform = 'translateX(-50%)';
      c.appendChild(p); setTimeout(() => p.remove(), 1000);
    },

    showCombo(level) {
      const d = document.getElementById('combo-display'); const t = document.getElementById('combo-text');
      t.textContent = `COMBO x${level}`; d.className = 'combo-display show';
      setTimeout(() => { d.className = 'combo-display hidden'; }, 900);
    },

    showGameStatus(message) {
      const d = document.getElementById('combo-display');
      const t = document.getElementById('combo-text');
      if (!d || !t) return;
      t.textContent = message;
      d.className = 'combo-display show status-message';
      setTimeout(() => { d.className = 'combo-display hidden'; }, 2200);
    },

    checkGameOver() {
      const rem = this.pieces.filter(p => !p.placed);
      if (rem.length === 0) return false;
      for (const piece of rem) for (let r = 0; r < this.GRID_SIZE; r++) for (let c = 0; c < this.GRID_SIZE; c++) if (this.canPlace(piece.shape, r, c)) return false;
      return true;
    },

    async onGameOver() {
      this.stopOnlineTimer();
      await this._flushCoins(); // Performance: birikmiş coin'leri tek seferde yaz
      this.state = 'gameover'; this.audio.gameOver(); this.vibrate([45, 35, 70]);
      if (this.mode === 'online') this.network.sendGameOver();
      if (this.mode === 'online') this.recordOnlineMatchResult(false);
    
      const isPremium = !!(this.authManager && this.authManager.isPremium && this.authManager.isPremium());
      if (!isPremium) this.ad.showInterstitial();
    
      // Save to Firebase
      await this.recordCompletedGame(false);
      if (this.score > this.highScore) this.highScore = this.score;
      // Award coins for solo play (1 coin per 10 points)
      if (this.mode === 'solo') {
        const soloCoins = Math.floor(this.score / 10);
        if (soloCoins > 0) this.authManager.addCoins(soloCoins, 'solo_game').then(() => this.updateCoinDisplays());
      }
    
      setTimeout(() => this.endGame(), 800);
    },

    endGame() { this.showGameOverScreen(false, this.mode === 'online' ? 'Kaybettin!' : ''); },

    showGameOverScreen(won, resultMsg) {
      const title = document.getElementById('gameover-title');
      const scoreEl = document.getElementById('gameover-score');
      const highEl = document.getElementById('gameover-high');
      const resultEl = document.getElementById('gameover-result');
      const detailEl = document.getElementById('gameover-detail');
      const nextLevelBtn = document.getElementById('btn-next-level');
      const rewardContinueBtn = document.getElementById('btn-reward-continue');
      const canPlayNextLevel = won && this.mode === 'solo' && this.currentLevel && this.currentLevel.id < this.levels.length;
      const canRewardContinue = !won && this.mode === 'solo' && !this.rewardContinueUsed;
      const isPremium = !!(this.authManager && this.authManager.isPremium && this.authManager.isPremium());
      if (nextLevelBtn) nextLevelBtn.classList.toggle('hidden', !canPlayNextLevel);
      if (rewardContinueBtn) {
        rewardContinueBtn.classList.toggle('hidden', !canRewardContinue);
        rewardContinueBtn.disabled = false;
        rewardContinueBtn.textContent = isPremium ? 'Premium devam: +1 bomba' : 'Reklam izle, +1 bomba ile devam et';
      }
      if (resultMsg) {
        title.textContent = won ? 'Zafer!' : 'Oyun Bitti!';
        title.className = 'gameover-title ' + (won ? 'win' : 'lose');
        resultEl.textContent = resultMsg; resultEl.className = 'gameover-result ' + (won ? 'win' : 'lose');
        document.getElementById('go-high-score-wrap').classList.toggle('hidden', this.mode === 'online');
        if (this.mode !== 'online') highEl.textContent = this.highScore;
        if (detailEl) this.renderGameOverDetail(detailEl);
      } else {
        title.textContent = 'Oyun Bitti!'; title.className = 'gameover-title';
        resultEl.className = 'gameover-result hidden';
        if (detailEl) detailEl.className = 'gameover-detail hidden';
        document.getElementById('go-high-score-wrap').classList.remove('hidden');
        highEl.textContent = this.highScore;
      }
      scoreEl.textContent = this.score; this.showScreen('gameover-screen');
    },

    async continueAfterRewardAd() {
      if (this.mode !== 'solo' || this.rewardContinueUsed) return;
      const btn = document.getElementById('btn-reward-continue');
      const isPremium = !!(this.authManager && this.authManager.isPremium && this.authManager.isPremium());
      if (btn) {
        btn.disabled = true;
        btn.textContent = isPremium ? 'Premium devam açılıyor...' : 'Reklam hazırlanıyor...';
      }
    
      const rewarded = isPremium ? true : await this.ad.showRewarded();
      if (!rewarded) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Reklam hazır değil';
          setTimeout(() => {
            if (!btn.classList.contains('hidden')) btn.textContent = 'Reklam izle, +1 bomba ile devam et';
          }, 1400);
        }
        return;
      }
    
      this.rewardContinueUsed = true;
      this.rewardBombs++;
      this.powerUps.bomb = (this.powerUps.bomb || 0) + 1;
      this.bombMode = false;
      this.state = 'playing';
      this.updatePowerUpUI();
      this.updateScoreDisplay();
      this.showScreen('game-screen');
      this.startGameLoop(); // Performance: reklam sonrası devamda döngüyü yeniden başlat
      requestAnimationFrame(() => this.resizeCanvas());
    },

    renderGameOverDetail(detailEl) {
      const isOnline = this.mode === 'online';
      const modeLabel = !isOnline
        ? (this.currentLevel ? `Level ${this.currentLevel.id}` : 'Sonsuz')
        : this.onlineMode === 'time'
          ? 'Zamana Karşı'
          : 'Skor Yarışı';
      const targetLabel = !isOnline
        ? (this.currentLevel ? `${this.currentLevel.target} hedef` : 'En yüksek skor')
        : this.onlineMode === 'time'
          ? '90 saniye'
          : '1000 puan';
      const thirdLabel = isOnline ? 'Skor' : 'Bakiye';
      const thirdValue = isOnline ? `${this.score} - ${this.opponentScore}` : `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
      detailEl.innerHTML = `
        <div class="gameover-detail-item"><span>Mod</span><strong>${modeLabel}</strong></div>
        <div class="gameover-detail-item"><span>Hedef</span><strong>${targetLabel}</strong></div>
        <div class="gameover-detail-item"><span>${thirdLabel}</span><strong>${thirdValue}</strong></div>
      `;
      detailEl.className = 'gameover-detail';
    },

    updateScoreDisplay() {
      const scoreText = this.mode === 'solo' && this.currentLevel
        ? `${this.score}/${this.currentLevel.target}`
        : this.mode === 'online' && this.onlineMode === 'score'
          ? `${this.score}/${this.targetScore}`
          : this.score;
      document.getElementById('score-value').textContent = scoreText;
      this.updateLevelBadge();
    },

    updateLevelBadge() {
      const badge = document.getElementById('level-badge');
      if (!badge) return;
      const show = this.mode === 'solo' && this.currentLevel;
      badge.classList.toggle('hidden', !show);
      if (!show) return;
      const title = document.getElementById('level-badge-title');
      if (title) title.textContent = `LEVEL ${this.currentLevel.id}`;
    },

    updateTimerDisplay() {
      const m = Math.floor(this.timerRemaining / 60); const s = Math.floor(this.timerRemaining % 60);
      document.getElementById('timer-value').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    },

    gameLoop(timestamp) {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); this.lastTime = timestamp;
      if (this.state === 'playing') {
        const hadAnimation = this.renderer.isAnimating || (this.particlesEnabled && this.renderer.particles.length > 0);
        if (hadAnimation) {
          this.renderer.updateParticles(dt);
          this.markRenderDirty();
        }
    
        if (this.renderDirty || this.renderer.isAnimating || (this.particlesEnabled && this.renderer.particles.length > 0)) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.renderer.drawGrid(this.ctx, this.grid, this.cellSize, this.gridOffset.x, this.gridOffset.y, this.ghost);
    
          if (this.particlesEnabled) {
            this.renderer.drawParticles(this.ctx);
          }
          this.renderDirty = false;
        }
    
        this.drawOpponentIfDirty();
    
        if (this.mode === 'online' && this.onlineMode === 'time' && this.timerRemaining > 0) {
          const timerText = `${Math.floor(this.timerRemaining / 60)}:${Math.floor(this.timerRemaining % 60).toString().padStart(2, '0')}`;
          if (timerText !== this._lastTimerDisplay) {
            this._lastTimerDisplay = timerText;
            this.updateTimerDisplay();
          }
        }
        if (this.mode === 'online' && this.onlineMode === 'score' && this.score >= this.targetScore && !this.gameOverHandled) {
          this.gameOverHandled = true;
          this.stopOnlineTimer();
          this.state = 'gameover'; this.audio.win(); this.vibrate([30, 35, 55]); this.network.sendGameOver();
          this.recordCompletedGame(true);
          this.recordOnlineMatchResult(true);
          this.authManager.addCoins(100, 'online_win').then(() => this.updateCoinDisplays());
          this.showGameOverScreen(true, `${this.targetScore} puana ilk sen ulaştın!`);
        }
      }
      // Performance: Oyun yoksa ve animasyon bittiyse donguyu durdur (menude CPU/GPU serbest)
      const needsLoop = this.state === 'playing' || this.renderer.isAnimating;
      if (needsLoop) {
        this._rafId = requestAnimationFrame((t) => this.gameLoop(t));
      } else {
        this._rafId = null; // Dongu durdu - startGameLoop() ile yeniden baslatilacak
      }
    }
  });
}
