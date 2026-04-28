// ═══════════════════════════════════════════
//  BLOCK BATTLE — Main Game Controller
// ═══════════════════════════════════════════

class Game {
  constructor() {
    this.GRID_SIZE = 9;
    this.grid = [];
    this.pieces = [];
    this.score = 0;
    this.combo = 0;
    this.highScore = 0;
    this.state = 'menu';
    this.mode = 'solo';
    this.onlineMode = 'score';
    this.canvas = null;
    this.ctx = null;
    this.opponentCanvas = null;
    this.opponentCtx = null;
    this.cellSize = 48;
    this.gridOffset = { x: 6, y: 6 };
    this.opponentBoard = null;
    this.opponentScore = 0;
    this.opponentCellSize = 18;
    this.timerRemaining = 0;
    this.targetScore = 1000;
    this.ghost = null;
    this.animatingClear = false;
    this.rng = null;
    this.seed = Date.now();
    this.blockSetIndex = 0;
    this.renderer = new Renderer(this);
    this.input = new InputHandler(this);
    this.audio = new AudioManager();
    this.network = new NetworkManager(this);
    this.authManager = new AuthManager();
    this.dbManager = new DatabaseManager();
    this.lastTime = 0;
  }

  init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.opponentCanvas = document.getElementById('opponent-canvas');
    this.opponentCtx = this.opponentCanvas.getContext('2d');
    this.input.init();
    this.setupAuthUI();
    this.setupUI();
    window.addEventListener('resize', () => {
      if (this.state === 'playing') this.resizeCanvas();
    });

    // Init auth — show loading, then route based on auth state
    this.showScreen('loading-screen');
    this.authManager.init((user) => {
      if (user) {
        document.getElementById('menu-username').textContent = this.authManager.getUsername();
        this.highScore = (this.authManager.userData && this.authManager.userData.highScore) || 0;
        this.showScreen('menu-screen');
      } else {
        this.showScreen('login-screen');
      }
    });

    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode) {
      this._pendingRoom = roomCode;
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      if (!s.classList.contains('overlay')) s.classList.remove('active');
    });
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  // ── Auth UI ──
  setupAuthUI() {
    document.getElementById('goto-register').onclick = (e) => { e.preventDefault(); this.showScreen('register-screen'); };
    document.getElementById('goto-login').onclick = (e) => { e.preventDefault(); this.showScreen('login-screen'); };

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      document.getElementById('btn-login').disabled = true;
      document.getElementById('btn-login').textContent = '⏳ Giriş yapılıyor...';
      const res = await this.authManager.login(email, pw);
      document.getElementById('btn-login').disabled = false;
      document.getElementById('btn-login').innerHTML = '🔑 Giriş Yap';
      if (!res.success) { errEl.textContent = res.error; errEl.classList.remove('hidden'); }
    };

    document.getElementById('register-form').onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const pw = document.getElementById('reg-password').value;
      const errEl = document.getElementById('register-error');
      errEl.classList.add('hidden');
      if (username.length < 3) { errEl.textContent = 'Kullanıcı adı en az 3 karakter!'; errEl.classList.remove('hidden'); return; }
      document.getElementById('btn-register').disabled = true;
      document.getElementById('btn-register').textContent = '⏳ Kayıt olunuyor...';
      const res = await this.authManager.register(username, email, pw);
      document.getElementById('btn-register').disabled = false;
      document.getElementById('btn-register').innerHTML = '🚀 Kayıt Ol';
      if (!res.success) { errEl.textContent = res.error; errEl.classList.remove('hidden'); }
    };
  }

  setupUI() {
    document.getElementById('btn-solo').onclick = () => this.startSoloGame();
    document.getElementById('btn-online').onclick = () => {
      this.network.connect();
      this.showScreen('online-screen');
      if (this._pendingRoom) {
        document.getElementById('room-code-input').value = this._pendingRoom;
        this._pendingRoom = null;
      }
    };
    document.getElementById('btn-sound-toggle').onclick = () => {
      this.audio.init();
      const on = this.audio.toggle();
      document.getElementById('btn-sound-toggle').textContent = on ? '🔊' : '🔇';
    };
    document.getElementById('btn-logout').onclick = async () => {
      await this.authManager.logout();
    };

    // Leaderboard
    document.getElementById('btn-leaderboard').onclick = () => this.showLeaderboard();
    document.getElementById('leaderboard-back').onclick = () => this.showScreen('menu-screen');

    // Profile
    document.getElementById('btn-profile').onclick = () => this.showProfile();
    document.getElementById('profile-back').onclick = () => this.showScreen('menu-screen');

    // Online menu
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.onclick = () => { modeBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.onlineMode = btn.dataset.mode; };
    });
    document.getElementById('btn-quick-match').onclick = () => this.network.quickMatch(this.onlineMode);
    document.getElementById('btn-create-room').onclick = () => { this.network.createRoom(this.onlineMode); document.getElementById('room-info').classList.remove('hidden'); };
    document.getElementById('btn-join-room').onclick = () => { const c = document.getElementById('room-code-input').value.trim(); if (c.length >= 4) this.network.joinRoom(c); };
    document.getElementById('online-back').onclick = () => this.showScreen('menu-screen');

    // Waiting
    document.getElementById('waiting-back').onclick = () => { this.network.leaveRoom(); this.showScreen('online-screen'); };
    document.getElementById('btn-copy-code').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('room-code-display').textContent).then(() => {
        document.getElementById('btn-copy-code').textContent = '✅ Kopyalandı!';
        setTimeout(() => { document.getElementById('btn-copy-code').textContent = '📋 Kodu Kopyala'; }, 1500);
      });
    };
    document.getElementById('btn-copy-link').onclick = () => {
      navigator.clipboard.writeText(this.network.getRoomLink()).then(() => {
        document.getElementById('btn-copy-link').textContent = '✅ Kopyalandı!';
        setTimeout(() => { document.getElementById('btn-copy-link').textContent = '🔗 Link Kopyala'; }, 1500);
      });
    };

    // Game screen
    document.getElementById('btn-game-menu').onclick = () => {
      if (this.mode === 'solo') { document.getElementById('pause-overlay').classList.remove('hidden'); document.getElementById('pause-overlay').classList.add('active'); }
    };
    document.getElementById('btn-resume').onclick = () => { document.getElementById('pause-overlay').classList.add('hidden'); document.getElementById('pause-overlay').classList.remove('active'); };
    document.getElementById('btn-quit').onclick = () => { document.getElementById('pause-overlay').classList.add('hidden'); document.getElementById('pause-overlay').classList.remove('active'); this.endGame(); };

    // Game over
    document.getElementById('btn-play-again').onclick = () => { this.mode === 'online' ? this.showScreen('online-screen') : this.startSoloGame(); };
    document.getElementById('btn-go-menu').onclick = () => { this.network.leaveRoom(); this.showScreen('menu-screen'); };
  }

  // ── Leaderboard ──
  async showLeaderboard() {
    this.showScreen('leaderboard-screen');
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="leaderboard-loading"><div class="spinner-container"><div class="spinner spinner-sm"></div></div></div>';
    const data = await this.dbManager.getLeaderboard(20);
    if (data.length === 0) { list.innerHTML = '<p class="text-muted">Henüz skor yok</p>'; return; }
    const uid = this.authManager.user ? this.authManager.user.uid : '';
    list.innerHTML = data.map((entry, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      const meClass = entry.uid === uid ? ' me' : '';
      return `<div class="lb-row"><span class="lb-rank ${rankClass}">${medal}</span><span class="lb-name${meClass}">${entry.username}</span><span class="lb-score">${entry.highScore}</span></div>`;
    }).join('');
  }

  // ── Profile ──
  async showProfile() {
    this.showScreen('profile-screen');
    await this.authManager.loadUserData();
    const d = this.authManager.userData || {};
    document.getElementById('profile-username').textContent = d.username || 'Oyuncu';
    document.getElementById('profile-email').textContent = this.authManager.user ? this.authManager.user.email : '';
    document.getElementById('p-high-score').textContent = d.highScore || 0;
    document.getElementById('p-total-games').textContent = d.totalGames || 0;
    document.getElementById('p-total-wins').textContent = d.totalWins || 0;
    // Load match history
    const hist = document.getElementById('match-history');
    hist.innerHTML = '<div class="spinner-container"><div class="spinner spinner-sm"></div></div>';
    const matches = await this.dbManager.getMatchHistory(this.authManager.user.uid, 10);
    if (matches.length === 0) { hist.innerHTML = '<p class="text-muted">Henüz online maç yok</p>'; return; }
    const uid = this.authManager.user.uid;
    hist.innerHTML = matches.map(m => {
      const isP1 = m.player1 && m.player1.uid === uid;
      const myScore = isP1 ? m.player1.score : m.player2.score;
      const oppName = isP1 ? (m.player2 ? m.player2.username : '?') : (m.player1 ? m.player1.username : '?');
      const oppScore = isP1 ? (m.player2 ? m.player2.score : 0) : (m.player1 ? m.player1.score : 0);
      const won = m.winnerUid === uid;
      return `<div class="match-row ${won ? 'win' : 'lose'}"><span class="match-opponent">vs ${oppName}</span><span class="match-scores">${myScore} - ${oppScore}</span><span class="match-result ${won ? 'w' : 'l'}">${won ? 'GALİBİYET' : 'MAĞLUBİYET'}</span></div>`;
    }).join('');
  }

  // ── Game Start ──
  resetGrid() { this.grid = []; for (let r = 0; r < this.GRID_SIZE; r++) this.grid.push(new Array(this.GRID_SIZE).fill(0)); }

  startSoloGame() {
    this.audio.init(); this.audio.resume();
    this.mode = 'solo'; this.state = 'playing'; this.score = 0; this.combo = 0; this.animatingClear = false;
    this.seed = Date.now(); this.rng = new SeededRandom(this.seed); this.blockSetIndex = 0;
    this.resetGrid(); this.generatePieces(); this.resizeCanvas();
    document.getElementById('opponent-board-wrap').classList.add('hidden');
    document.getElementById('opponent-score-box').classList.add('hidden');
    document.getElementById('timer-box').classList.add('hidden');
    this.updateScoreDisplay(); this.showScreen('game-screen');
  }

  startOnlineGame(seed, mode, timeLimit, targetScore) {
    this.audio.init(); this.audio.resume();
    this.mode = 'online'; this.onlineMode = mode; this.state = 'playing'; this.score = 0; this.combo = 0; this.animatingClear = false;
    this.seed = seed; this.rng = new SeededRandom(seed); this.blockSetIndex = 0;
    this.timerRemaining = timeLimit || 180; this.targetScore = targetScore || 1000;
    this.opponentBoard = null; this.opponentScore = 0;
    this.resetGrid(); this.generatePieces(); this.resizeCanvas();
    document.getElementById('opponent-board-wrap').classList.remove('hidden');
    document.getElementById('opponent-score-box').classList.remove('hidden');
    document.getElementById('opponent-score-value').textContent = '0';
    if (mode === 'score') { document.getElementById('timer-box').classList.remove('hidden'); this.updateTimerDisplay(); }
    else { document.getElementById('timer-box').classList.add('hidden'); }
    this.updateScoreDisplay(); this.showScreen('game-screen');
  }

  // ── Pieces ──
  generatePieces() { this.pieces = generatePieceSet(this.rng); this.blockSetIndex++; this.renderPieceTray(); }

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
  }

  // ── Canvas ──
  resizeCanvas() {
    const ga = document.getElementById('game-area');
    let cs = Math.floor(Math.min(ga.clientWidth - 16, ga.clientHeight - 16) / this.GRID_SIZE);
    cs = Math.min(cs, 62); cs = Math.max(cs, 28); this.cellSize = cs;
    const gp = this.GRID_SIZE * cs;
    this.canvas.width = gp + 12; this.canvas.height = gp + 12; this.gridOffset = { x: 6, y: 6 };
    if (this.mode === 'online') {
      this.opponentCellSize = Math.max(Math.floor(cs * 0.4), 12);
      const op = this.GRID_SIZE * this.opponentCellSize;
      this.opponentCanvas.width = op + 8; this.opponentCanvas.height = op + 8;
    }
  }

  // ── Ghost & Placement ──
  updateGhost(screenX, screenY, pieceIndex) {
    const piece = this.pieces[pieceIndex];
    if (!piece || piece.placed) { this.ghost = null; return; }
    const shape = piece.shape; const rows = shape.length; const cols = shape[0].length;
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width; const sy = this.canvas.height / rect.height;
    const cx = (screenX - rect.left) * sx - this.gridOffset.x;
    const cy = (screenY - rect.top) * sy - this.gridOffset.y;
    const gc = Math.round(cx / this.cellSize - cols / 2);
    const gr = Math.round(cy / this.cellSize - rows / 2);
    const valid = this.canPlace(shape, gr, gc);
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (shape[r][c]) cells.push({ r: gr + r, c: gc + c });
    this.ghost = { row: gr, col: gc, valid, cells };
  }

  clearGhost() { this.ghost = null; }

  canPlace(shape, sr, sc) {
    for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const gr = sr + r, gc = sc + c;
      if (gr < 0 || gr >= this.GRID_SIZE || gc < 0 || gc >= this.GRID_SIZE) return false;
      if (this.grid[gr][gc] !== 0) return false;
    }
    return true;
  }

  tryPlace(screenX, screenY, pieceIndex) {
    if (!this.ghost || !this.ghost.valid) { this.audio.invalid(); return false; }
    const piece = this.pieces[pieceIndex]; const shape = piece.shape; const colorVal = piece.colorIndex + 1;
    for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) if (shape[r][c]) this.grid[this.ghost.row + r][this.ghost.col + c] = colorVal;
    this.score += getShapeCells(shape).length;
    piece.placed = true; this.audio.place();
    const slot = document.querySelector(`.piece-slot[data-index="${pieceIndex}"]`);
    if (slot) slot.classList.add('placed');
    this.checkAndClearLines();
    if (this.pieces.every(p => p.placed)) this.generatePieces();
    if (this.checkGameOver()) { this.onGameOver(); return true; }
    if (this.mode === 'online') this.network.sendBoardUpdate(this.grid, this.score);
    this.updateScoreDisplay();
    return true;
  }

  // ── Line Clearing ──
  checkAndClearLines() {
    const clearRows = [], clearCols = [];
    for (let r = 0; r < this.GRID_SIZE; r++) if (this.grid[r].every(c => c !== 0)) clearRows.push(r);
    for (let c = 0; c < this.GRID_SIZE; c++) { let full = true; for (let r = 0; r < this.GRID_SIZE; r++) if (this.grid[r][c] === 0) { full = false; break; } if (full) clearCols.push(c); }
    const total = clearRows.length + clearCols.length;
    if (total === 0) { this.combo = 0; return; }
    this.combo++;
    const cells = new Set();
    for (const r of clearRows) for (let c = 0; c < this.GRID_SIZE; c++) cells.add(`${r},${c}`);
    for (const c of clearCols) for (let r = 0; r < this.GRID_SIZE; r++) cells.add(`${r},${c}`);
    const arr = [];
    for (const k of cells) { const [r, c] = k.split(',').map(Number); this.renderer.addClearParticles(r, c, this.cellSize, this.gridOffset.x, this.gridOffset.y, this.grid[r][c]); arr.push({ r, c }); }
    this.renderer.addFlashCells(arr);
    const pts = cells.size + total * 18 + (this.combo > 1 ? this.combo * 15 : 0);
    this.score += pts;
    this.showScorePopup(pts);
    if (this.combo > 1) { this.showCombo(this.combo); this.audio.combo(this.combo); }
    this.audio.clear(total);
    for (const k of cells) { const [r, c] = k.split(',').map(Number); this.grid[r][c] = 0; }
    this.animatingClear = true; setTimeout(() => { this.animatingClear = false; }, 300);
  }

  showScorePopup(pts) {
    const c = document.getElementById('score-popup-container');
    const p = document.createElement('div'); p.className = 'score-popup'; p.textContent = `+${pts}`;
    p.style.left = '50%'; p.style.top = '40%'; p.style.transform = 'translateX(-50%)';
    c.appendChild(p); setTimeout(() => p.remove(), 1000);
  }

  showCombo(level) {
    const d = document.getElementById('combo-display'); const t = document.getElementById('combo-text');
    t.textContent = `COMBO ×${level}`; d.className = 'combo-display show';
    setTimeout(() => { d.className = 'combo-display hidden'; }, 900);
  }

  // ── Game Over ──
  checkGameOver() {
    const rem = this.pieces.filter(p => !p.placed);
    if (rem.length === 0) return false;
    for (const piece of rem) for (let r = 0; r < this.GRID_SIZE; r++) for (let c = 0; c < this.GRID_SIZE; c++) if (this.canPlace(piece.shape, r, c)) return false;
    return true;
  }

  async onGameOver() {
    this.state = 'gameover'; this.audio.gameOver();
    if (this.mode === 'online') this.network.sendGameOver();
    // Save to Firebase
    if (this.authManager.isLoggedIn()) {
      try { await this.dbManager.updateHighScore(this.authManager.user.uid, this.score, this.authManager.getUsername()); } catch (e) { console.error(e); }
      await this.authManager.loadUserData();
      this.highScore = (this.authManager.userData && this.authManager.userData.highScore) || this.highScore;
    }
    if (this.score > this.highScore) this.highScore = this.score;
    setTimeout(() => this.endGame(), 800);
  }

  onOpponentGameOver() { this.state = 'gameover'; this.audio.win(); this.showGameOverScreen(true, 'Rakip kaybetti! Kazandın! 🎉'); }
  onOpponentLeft() { if (this.state === 'playing') { this.state = 'gameover'; this.showGameOverScreen(true, 'Rakip ayrıldı. Kazandın!'); } }

  onTimeUp() {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    const won = this.score > this.opponentScore; const tied = this.score === this.opponentScore;
    if (won) { this.audio.win(); this.showGameOverScreen(true, `Kazandın! ${this.score} - ${this.opponentScore}`); }
    else if (tied) { this.showGameOverScreen(false, `Berabere! ${this.score} - ${this.opponentScore}`); }
    else { this.audio.gameOver(); this.showGameOverScreen(false, `Kaybettin! ${this.score} - ${this.opponentScore}`); }
  }

  endGame() { this.showGameOverScreen(false, this.mode === 'online' ? 'Kaybettin!' : ''); }

  showGameOverScreen(won, resultMsg) {
    const title = document.getElementById('gameover-title');
    const scoreEl = document.getElementById('gameover-score');
    const highEl = document.getElementById('gameover-high');
    const resultEl = document.getElementById('gameover-result');
    if (this.mode === 'online' && resultMsg) {
      title.textContent = won ? '🎉 Zafer!' : '💥 Oyun Bitti!';
      title.className = 'gameover-title ' + (won ? 'win' : 'lose');
      resultEl.textContent = resultMsg; resultEl.className = 'gameover-result ' + (won ? 'win' : 'lose');
      document.getElementById('go-high-score-wrap').classList.add('hidden');
    } else {
      title.textContent = 'Oyun Bitti!'; title.className = 'gameover-title';
      resultEl.className = 'gameover-result hidden';
      document.getElementById('go-high-score-wrap').classList.remove('hidden');
      highEl.textContent = this.highScore;
    }
    scoreEl.textContent = this.score; this.showScreen('gameover-screen');
  }

  updateScoreDisplay() { document.getElementById('score-value').textContent = this.score; }
  updateTimerDisplay() {
    const m = Math.floor(this.timerRemaining / 60); const s = Math.floor(this.timerRemaining % 60);
    document.getElementById('timer-value').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Game Loop ──
  gameLoop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); this.lastTime = timestamp;
    if (this.state === 'playing') {
      this.renderer.updateParticles(dt);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.renderer.drawGrid(this.ctx, this.grid, this.cellSize, this.gridOffset.x, this.gridOffset.y, this.ghost);
      this.renderer.drawParticles(this.ctx);
      if (this.mode === 'online' && this.opponentBoard) {
        this.opponentCtx.clearRect(0, 0, this.opponentCanvas.width, this.opponentCanvas.height);
        this.renderer.drawOpponentGrid(this.opponentCtx, this.opponentBoard, this.opponentCellSize, 4, 4);
      }
      if (this.mode === 'online' && this.onlineMode === 'score' && this.timerRemaining > 0) this.updateTimerDisplay();
      if (this.mode === 'online' && this.onlineMode === 'time' && this.score >= this.targetScore) {
        this.state = 'gameover'; this.audio.win(); this.network.sendGameOver();
        this.showGameOverScreen(true, 'Hedefe ilk sen ulaştın! 🏆');
      }
    }
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => { const game = new Game(); game.init(); window._game = game; });
