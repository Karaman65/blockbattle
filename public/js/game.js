// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  BLOCK BATTLE â€” Main Game Controller
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
    this.opponentUid = null;
    this.opponentUsername = 'Rakip';
    this.onlineMatchRecorded = false;
    this.opponentCellSize = 18;
    this.timerRemaining = 0;
    this.targetScore = 1000;
    this.onlineLocked = false;
    this.onlineTimer = null;
    this.levels = this.createLevels();
    this.currentLevel = null;
    this.levelProgressKey = 'blockBattleUnlockedLevel';
    this.unlockedLevel = 1;
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
    this.ad = new AdManager();
    this.lastTime = 0;
    this.nativeBackHandlerRegistered = false;
    this.rewardContinueUsed = false;
    this.rewardBombs = 0;
    this.pendingRoomJoinStarted = false;

    // Power-ups
    this.powerUps = {
      bomb: 1,
      rotate: 2,
      skip: 1
    };
    this.bombMode = false;
  }

  async init() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.opponentCanvas = document.getElementById('opponent-canvas');
    this.opponentCtx = this.opponentCanvas.getContext('2d');
    this.input.init();
    this.setupAuthUI();
    this.setupUI();
    this.setupNativeBackButton();
    this.setupDeepLinks();
    this.applyUiTheme(localStorage.getItem('uiTheme') || 'dark');

    // Initialize Ads
    await this.ad.init();
    this.ad.showBanner();

    window.addEventListener('resize', () => {
      if (this.state === 'playing') this.resizeCanvas();
    });

    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode) this._pendingRoom = roomCode;

    // Init auth â€” show loading, then route based on auth state
    this.showScreen('loading-screen');
    this.authManager.init((user) => {
      if (user) {
        this.highScore = (this.authManager.userData && this.authManager.userData.highScore) || 0;
        let displayName = this.authManager.getUsername();
        document.getElementById('menu-username').textContent = displayName;
        
        const savedTheme = localStorage.getItem('selectedTheme') || 'default';
        this.setTheme(savedTheme);
        this.unlockedLevel = this.getSavedUnlockedLevel();
        this.updateCoinDisplays();
        this.updatePlayerHeader();
        if (!this.handlePendingRoomLink()) {
          this.showScreen('menu-screen'); // Default to main menu after login
          this.maybeShowTutorial();
        }
      } else {
        this.showScreen('login-screen');
      }
    });

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  handlePendingRoomLink() {
    if (!this._pendingRoom) return false;
    if (this.pendingRoomJoinStarted) return true;
    this.pendingRoomJoinStarted = true;
    const roomCode = this._pendingRoom.trim().toUpperCase();
    this._pendingRoom = null;
    this.showScreen('online-screen');
    const input = document.getElementById('room-code-input');
    if (input) input.value = roomCode;
    setTimeout(() => {
      this.network.joinRoom(roomCode).finally(() => {
        this.pendingRoomJoinStarted = false;
      });
    }, 250);
    return true;
  }

  setupDeepLinks() {
    const app = window.Capacitor?.Plugins?.App;
    if (!app) return;

    const handleUrl = (url) => {
      const roomCode = this.getRoomCodeFromUrl(url);
      if (!roomCode) return;
      this._pendingRoom = roomCode;
      if (this.authManager && this.authManager.user) this.handlePendingRoomLink();
      else this.showScreen('login-screen');
    };

    if (typeof app.getLaunchUrl === 'function') {
      app.getLaunchUrl().then(data => {
        if (data && data.url) handleUrl(data.url);
      }).catch(() => {});
    }

    if (typeof app.addListener === 'function') {
      app.addListener('appUrlOpen', data => {
        if (data && data.url) handleUrl(data.url);
      });
    }
  }

  getRoomCodeFromUrl(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const room = parsed.searchParams.get('room');
      return room ? room.trim().toUpperCase() : '';
    } catch (err) {
      const match = String(url).match(/[?&]room=([^&]+)/i);
      return match ? decodeURIComponent(match[1]).trim().toUpperCase() : '';
    }
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      if (!s.classList.contains('overlay')) s.classList.remove('active');
    });
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    if (id === 'game-screen' && this.canvas) {
      requestAnimationFrame(() => this.resizeCanvas());
    }
    if (id === 'map-screen') this.renderLevelMap();
    if (id === 'quests-screen') this.renderQuests();
    if (id === 'online-screen') {
      const roomInfo = document.getElementById('room-info');
      if (roomInfo) roomInfo.classList.remove('hidden');
    }
    this.updateBackButton(id);

    // Bottom Nav Visibility
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
      const showNavScreens = ['menu-screen', 'store-screen', 'quests-screen', 'profile-screen', 'leaderboard-screen', 'map-screen'];
      if (showNavScreens.includes(id) && this.authManager && this.authManager.user) {
        bottomNav.classList.remove('hidden');
        // Update active state
        document.querySelectorAll('.nav-item').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.target === id);
        });
      } else {
        bottomNav.classList.add('hidden');
      }
    }
  }

  updateBackButton(id) {
    const backBtn = document.getElementById('global-back');
    if (!backBtn) return;
    const visibleScreens = [
      'map-screen',
      'quests-screen',
      'store-screen',
      'leaderboard-screen',
      'profile-screen',
      'online-screen',
      'waiting-screen',
      'register-screen',
      'gameover-screen',
    ];
    backBtn.classList.toggle('hidden', !visibleScreens.includes(id));
  }

  goBack() {
    const active = document.querySelector('.screen.active:not(.overlay)');
    const id = active ? active.id : 'menu-screen';
    if (id === 'register-screen') return this.showScreen('login-screen');
    if (id === 'waiting-screen') {
      this.network.leaveRoom();
      return this.showScreen('online-screen');
    }
    if (id === 'online-screen') return this.showScreen('menu-screen');
    if (id === 'gameover-screen') return this.showScreen(this.mode === 'online' ? 'online-screen' : 'map-screen');
    return this.showScreen('menu-screen');
  }

  setupNativeBackButton() {
    if (this.nativeBackHandlerRegistered) return;
    const app = window.Capacitor?.Plugins?.App;
    if (!app || typeof app.addListener !== 'function') return;

    app.addListener('backButton', () => {
      const quickShop = document.getElementById('quick-shop-modal');
      if (quickShop && !quickShop.classList.contains('hidden')) {
        this.closeQuickShop();
        return;
      }

      const tutorial = document.getElementById('tutorial-overlay');
      if (tutorial && tutorial.classList.contains('active')) {
        this.closeTutorial();
        return;
      }

      const pauseOverlay = document.getElementById('pause-overlay');
      if (pauseOverlay && pauseOverlay.classList.contains('active')) {
        this.closePauseMenu();
        return;
      }

      const active = document.querySelector('.screen.active:not(.overlay)');
      const id = active ? active.id : 'menu-screen';
      if (id === 'game-screen') {
        this.openPauseMenu();
        return;
      }

      const backBtn = document.getElementById('global-back');
      if (backBtn && !backBtn.classList.contains('hidden')) {
        this.goBack();
        return;
      }

      if (typeof app.exitApp === 'function') app.exitApp();
    });
    this.nativeBackHandlerRegistered = true;
  }

  openPauseMenu() {
    const pauseTitle = document.getElementById('pause-title');
    if (pauseTitle) pauseTitle.textContent = this.mode === 'online' ? 'Maç Menüsü' : 'Duraklatıldı';
    const pauseOverlay = document.getElementById('pause-overlay');
    if (!pauseOverlay) return;
    pauseOverlay.classList.remove('hidden');
    pauseOverlay.classList.add('active');
  }

  closePauseMenu() {
    const pauseOverlay = document.getElementById('pause-overlay');
    if (!pauseOverlay) return;
    pauseOverlay.classList.add('hidden');
    pauseOverlay.classList.remove('active');
  }

  // â”€â”€ Auth UI â”€â”€
  setupAuthUI() {
    document.getElementById('goto-register').onclick = (e) => { e.preventDefault(); this.showScreen('register-screen'); };
    document.getElementById('goto-login').onclick = (e) => { e.preventDefault(); this.showScreen('login-screen'); };
    document.getElementById('forgot-password').onclick = (e) => {
      e.preventDefault();
      this.openPasswordResetModal();
    };
    const passwordResetClose = document.getElementById('password-reset-close');
    if (passwordResetClose) passwordResetClose.onclick = () => this.closePasswordResetModal();
    const passwordResetModal = document.getElementById('password-reset-modal');
    if (passwordResetModal) {
      passwordResetModal.onclick = (e) => {
        if (e.target === passwordResetModal) this.closePasswordResetModal();
      };
    }
    const passwordResetSend = document.getElementById('btn-password-reset-send');
    if (passwordResetSend) passwordResetSend.onclick = () => this.sendPasswordResetFromModal();
    const googleLogin = document.getElementById('btn-google-login');
    if (googleLogin) googleLogin.onclick = () => this.loginWithGoogle();

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      document.getElementById('btn-login').disabled = true;
      document.getElementById('btn-login').textContent = 'Giriş yapılıyor...';
      const res = await this.authManager.login(email, pw);
      document.getElementById('btn-login').disabled = false;
      document.getElementById('btn-login').textContent = 'GİRİŞ YAP';
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
      document.getElementById('btn-register').textContent = 'Kayıt olunuyor...';
      const res = await this.authManager.register(username, email, pw);
      document.getElementById('btn-register').disabled = false;
      document.getElementById('btn-register').textContent = 'KAYIT OL';
      if (!res.success) { errEl.textContent = res.error; errEl.classList.remove('hidden'); }
    };
  }

  openPasswordResetModal() {
    const modal = document.getElementById('password-reset-modal');
    const input = document.getElementById('password-reset-email');
    const status = document.getElementById('password-reset-status');
    if (!modal || !input || !status) return;
    input.value = '';
    status.classList.add('hidden');
    status.classList.remove('success');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => input.focus());
  }

  closePasswordResetModal() {
    const modal = document.getElementById('password-reset-modal');
    if (modal) modal.classList.add('hidden');
  }

  setAuthStatus(id, message, success = false) {
    const status = document.getElementById(id);
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('success', success);
    status.classList.toggle('hidden', !message);
  }

  async loginWithGoogle() {
    const btn = document.getElementById('btn-google-login');
    const errEl = document.getElementById('login-error');
    if (errEl) errEl.classList.add('hidden');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Google açılıyor...';
    }
    const res = await this.authManager.loginWithGoogle();
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Google ile giriş';
    }
    if (!res.success && errEl) {
      errEl.textContent = res.error;
      errEl.classList.remove('hidden');
    }
  }

  async sendPasswordResetFromModal() {
    const input = document.getElementById('password-reset-email');
    const status = document.getElementById('password-reset-status');
    const btn = document.getElementById('btn-password-reset-send');
    if (!input || !status || !btn) return;

    const emailOrUsername = input.value.trim();
    status.classList.add('hidden');
    status.classList.remove('success');
    if (!emailOrUsername) {
      status.textContent = 'Email veya kullanıcı adını yaz.';
      status.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Link gönderiliyor...';
    const res = await this.authManager.sendPasswordReset(emailOrUsername);
    btn.disabled = false;
    btn.textContent = 'Link Gönder';
    status.textContent = res.success
      ? `Şifre yenileme linki gönderildi: ${res.email}. Mailden yeni şifreni belirleyebilirsin.`
      : res.error;
    if (res.success) status.classList.add('success');
    status.classList.remove('hidden');
  }

  setupUI() {
    const globalBack = document.getElementById('global-back');
    if (globalBack) globalBack.onclick = () => this.goBack();

    document.getElementById('btn-solo').onclick = () => this.startEndlessGame();
    const themeToggle = document.getElementById('btn-theme-toggle');
    if (themeToggle) {
      themeToggle.onclick = () => {
        const current = document.documentElement.dataset.uiTheme || 'dark';
        this.applyUiTheme(current === 'dark' ? 'light' : 'dark');
      };
    }
    const btnOnline = document.getElementById('btn-online');
    if (btnOnline) {
      btnOnline.onclick = null; // Clear previous
      btnOnline.addEventListener('click', () => {
        console.log('Online click triggered');
        // Immediate visual feedback
        btnOnline.style.opacity = '0.5';
        
        try {
          // Switch screen first to ensure user sees progress
          this.showScreen('online-screen');
          
          // Then attempt connection
          this.network.connect().catch(err => console.warn('Online connection pending:', err.message));
          
          this.handlePendingRoomLink();
          
          // Reset opacity if successful
          btnOnline.style.opacity = '1';
        } catch (err) {
          console.error('Online setup error:', err);
          btnOnline.style.opacity = '1';
          btnOnline.style.background = '#ff4757';
          btnOnline.textContent = 'Hata: ' + err.message;
          btnOnline.style.fontSize = '12px';
        }
      });
    }
    document.getElementById('btn-sound-toggle').onclick = () => {
      this.audio.init();
      const on = this.audio.toggle();
      const soundBtn = document.getElementById('btn-sound-toggle');
      soundBtn.textContent = on ? 'SES' : 'KAPALI';
      soundBtn.title = on ? 'Sesi kapat' : 'Sesi aç';
    };
    document.getElementById('btn-logout').onclick = async () => {
      await this.authManager.logout();
    };

    // Leaderboard
    document.getElementById('btn-leaderboard').onclick = () => this.showLeaderboard();

    // Profile
    document.getElementById('btn-profile').onclick = () => this.showProfile();

    // Bottom Navigation Logic
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => {
        const target = btn.dataset.target;
        if (target === 'store-screen') this.showStore();
        else if (target === 'map-screen') this.showScreen('map-screen');
        else this.showScreen(target);
      };
    });

    document.querySelectorAll('.btn-buy').forEach(btn => {
      btn.onclick = async () => {
        const type = btn.dataset.type;
        const price = parseInt(btn.dataset.price);

        if (type === 'theme') {
          const themeId = btn.dataset.id;
          if (price > 0) {
            const success = await this.authManager.buyTheme(themeId, price);
            if (!success) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500); return; }
          }
          this.setTheme(themeId);
          this.updateCoinDisplays();
          this.updateStoreThemesUI();
          this.audio.pickup();
          return;
        }

        if (type === 'cosmetic') {
          const category = btn.dataset.category;
          const cosmeticId = btn.dataset.id;
          if (price > 0) {
            const success = await this.authManager.buyCosmetic(category, cosmeticId, price);
            if (!success) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500); return; }
          }
          this.setCosmetic(category, cosmeticId);
          this.updateCoinDisplays();
          this.updateStoreCosmeticsUI();
          this.audio.pickup();
          return;
        }

        if (type === 'bundle') {
          const items = {
            bomb: parseInt(btn.dataset.bomb || '0', 10),
            rotate: parseInt(btn.dataset.rotate || '0', 10),
            skip: parseInt(btn.dataset.skip || '0', 10),
          };
          const success = await this.authManager.buyBundle(items, price);
          if (!success) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500); return; }
          this.updateCoinDisplays();
          this.updatePowerUpUI();
          this.audio.pickup();
          const originalText = btn.textContent;
          btn.textContent = 'ALINDI';
          btn.style.background = '#27ae60';
          setTimeout(() => { btn.textContent = originalText; btn.style.background = ''; }, 1000);
          return;
        }

        const success = await this.authManager.buyPowerUp(type, price);
        if (success) {
          this.updateCoinDisplays();
          this.updatePowerUpUI();
          this.audio.pickup();
          const originalText = btn.textContent;
          btn.textContent = 'ALINDI';
          btn.style.background = '#27ae60';
          setTimeout(() => { btn.textContent = originalText; btn.style.background = ''; }, 1000);
        } else {
          btn.classList.add('shake');
          setTimeout(() => btn.classList.remove('shake'), 500);
        }
      };
    });

    // Online menu
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.onclick = () => { modeBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); this.onlineMode = btn.dataset.mode; };
    });
    document.getElementById('btn-quick-match').onclick = () => this.network.quickMatch(this.onlineMode);
    document.getElementById('btn-create-room').onclick = () => this.network.createRoom(this.onlineMode);
    document.getElementById('btn-join-room').onclick = () => { const c = document.getElementById('room-code-input').value.trim(); if (c.length >= 4) this.network.joinRoom(c); };
    document.getElementById('online-back').onclick = () => this.showScreen('menu-screen');

    // Waiting
    document.getElementById('waiting-back').onclick = () => { this.network.leaveRoom(); this.showScreen('online-screen'); };
    document.getElementById('btn-copy-code').onclick = () => {
      const btn = document.getElementById('btn-copy-code');
      this.copyText(document.getElementById('room-code-display').textContent, btn, 'KOPYALA');
    };
    document.getElementById('btn-copy-link').onclick = () => {
      const btn = document.getElementById('btn-copy-link');
      this.copyText(this.network.getRoomLink(), btn, 'LİNK');
    };

    // Game screen
    document.getElementById('btn-game-menu').onclick = () => this.openPauseMenu();
    document.getElementById('btn-resume').onclick = () => this.closePauseMenu();
    document.getElementById('btn-quit').onclick = () => {
      this.closePauseMenu();
      if (this.mode === 'online') {
        this.network.leaveRoom();
        this.state = 'menu';
        this.showScreen('menu-screen');
      } else {
        this.endGame();
      }
    };

    // Power-ups
    document.getElementById('btn-bomb').onclick = () => {
      if (this.input.suppressBombClick) return;
      this.powerUps.bomb <= 0 ? this.openQuickShop('bomb') : this.toggleBombMode();
    };
    document.getElementById('btn-rotate').onclick = () => this.powerUps.rotate <= 0 ? this.openQuickShop('rotate') : this.useRotate();
    document.getElementById('btn-skip').onclick = () => this.powerUps.skip <= 0 ? this.openQuickShop('skip') : this.useSkip();
    const quickShopClose = document.getElementById('quick-shop-close');
    if (quickShopClose) quickShopClose.onclick = () => this.closeQuickShop();
    const quickShopModal = document.getElementById('quick-shop-modal');
    if (quickShopModal) {
      quickShopModal.onclick = (e) => {
        if (e.target === quickShopModal) this.closeQuickShop();
      };
    }
    const tutorialOk = document.getElementById('btn-tutorial-ok');
    if (tutorialOk) tutorialOk.onclick = () => this.closeTutorial();

    // Game over
    document.getElementById('btn-play-again').onclick = () => {
      this.mode === 'online' ? this.showScreen('online-screen') : (this.currentLevel ? this.startSoloGame(this.currentLevel.id) : this.startEndlessGame());
    };
    document.getElementById('btn-next-level').onclick = () => this.startNextLevel();
    document.getElementById('btn-reward-continue').onclick = () => this.continueAfterRewardAd();
    document.getElementById('btn-go-menu').onclick = () => { this.network.leaveRoom(); this.showScreen('menu-screen'); };

    const btnSendFeedback = document.getElementById('btn-send-feedback');
    if (btnSendFeedback) {
      btnSendFeedback.onclick = () => this.submitFeedback();
    }
  }

  async submitFeedback() {
    const typeEl = document.getElementById('feedback-type');
    const messageEl = document.getElementById('feedback-message');
    const statusEl = document.getElementById('feedback-status');
    const btn = document.getElementById('btn-send-feedback');
    const message = messageEl ? messageEl.value.trim() : '';

    if (message.length < 5) {
      if (statusEl) statusEl.textContent = 'Lütfen biraz daha detay yaz.';
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'GÖNDERİLİYOR...';
    }
    if (statusEl) statusEl.textContent = '';

    const result = await this.authManager.submitFeedback(typeEl ? typeEl.value : 'other', message);
    if (result && result.ok) {
      if (messageEl) messageEl.value = '';
      if (statusEl) statusEl.textContent = 'Teşekkürler, mesajın alındı.';
    } else if (statusEl) {
      if (result && result.reason === 'auth') {
        statusEl.textContent = 'Göndermek için giriş yapmalısın.';
      } else if (result && result.reason === 'permission-denied') {
        statusEl.textContent = 'Feedback izni kapalı. Firebase Rules ayarı gerekiyor.';
      } else {
        statusEl.textContent = 'Gönderilemedi. Bağlantını kontrol edip tekrar dene.';
      }
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'GÖNDER';
    }
  }

  async copyText(text, btn, originalText) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      if (btn) {
        btn.textContent = 'KOPYALANDI';
        setTimeout(() => { btn.textContent = originalText; }, 1500);
      }
    } catch (err) {
      if (btn) {
        btn.textContent = 'KOPYALANAMADI';
        setTimeout(() => { btn.textContent = originalText; }, 1500);
      }
    }
  }

  getQuestPeriodKey(type) {
    const now = new Date();
    const uid = this.authManager && this.authManager.user ? this.authManager.user.uid : 'guest';
    if (type === 'daily') return `${uid}:daily:${now.toISOString().slice(0, 10)}`;
    const start = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
    if (type === 'weekly') return `${uid}:weekly:${now.getFullYear()}-${week}`;
    return `${uid}:monthly:${now.getFullYear()}-${now.getMonth() + 1}`;
  }

  getQuestProgressKey(type) {
    return `questStats:${this.getQuestPeriodKey(type)}`;
  }

  getPeriodQuestStats(type) {
    return JSON.parse(localStorage.getItem(this.getQuestProgressKey(type)) || '{"games":0,"wins":0,"highScore":0}');
  }

  updateQuestProgress(won = false) {
    ['daily', 'weekly', 'monthly'].forEach(type => {
      const key = this.getQuestProgressKey(type);
      const stats = JSON.parse(localStorage.getItem(key) || '{"games":0,"wins":0,"highScore":0}');
      stats.games = (stats.games || 0) + 1;
      stats.wins = (stats.wins || 0) + (won ? 1 : 0);
      stats.highScore = Math.max(stats.highScore || 0, this.score || 0);
      localStorage.setItem(key, JSON.stringify(stats));
    });
  }

  getQuestStats(type = 'daily') {
    const d = this.authManager.userData || {};
    const inv = this.authManager.getInventory ? this.authManager.getInventory() : {};
    const period = this.getPeriodQuestStats(type);
    return {
      highScore: Math.max(period.highScore || 0, this.score || 0),
      totalGames: period.games || 0,
      totalWins: period.wins || 0,
      unlockedLevel: this.getSavedUnlockedLevel(),
      coins: this.authManager.getCoins ? this.authManager.getCoins() : 0,
      powerUps: (inv.bomb || 0) + (inv.rotate || 0) + (inv.skip || 0),
    };
  }

  async recordCompletedGame(won = false) {
    this.updateQuestProgress(won);
    if (!this.authManager.isLoggedIn()) return;
    try {
      await this.dbManager.updateHighScore(this.authManager.user.uid, this.score, this.authManager.getUsername(), false);
      await this.authManager.loadUserData();
      this.highScore = Math.max(this.highScore, (this.authManager.userData && this.authManager.userData.highScore) || 0);
      this.updateCoinDisplays();
      this.updatePlayerHeader();
    } catch (e) {
      console.error(e);
    }
  }

  setOnlineOpponent(data) {
    if (!data) return;
    if (data.uid) this.opponentUid = data.uid;
    if (data.username) this.opponentUsername = data.username;
  }

  async recordOnlineMatchResult(won) {
    if (this.onlineMatchRecorded || this.mode !== 'online') return;
    if (!this.authManager.user || !this.opponentUid) return;
    const myUid = this.authManager.user.uid;
    const matchType = this.network.matchType === 'quick' ? 'quick' : 'room';
    const shouldWriteMatch = won === true || (won === null && myUid < this.opponentUid);
    this.onlineMatchRecorded = true;
    await this.dbManager.recordOnlineMatch({
      matchType,
      mode: this.onlineMode || this.network.gameMode || 'score',
      roomId: this.network.roomId || '',
      currentUid: myUid,
      writeMatch: shouldWriteMatch,
      player1: {
        uid: myUid,
        username: this.authManager.getUsername(),
        score: this.score,
      },
      player2: {
        uid: this.opponentUid,
        username: this.opponentUsername || 'Rakip',
        score: this.opponentScore || 0,
      },
      winnerUid: won === true ? myUid : won === false ? this.opponentUid : null,
    });
    await this.authManager.loadUserData();
    this.updatePlayerHeader();
  }

  buildQuests() {
    const dailyStats = this.getQuestStats('daily');
    const weeklyStats = this.getQuestStats('weekly');
    const monthlyStats = this.getQuestStats('monthly');
    const by = (stats, metric) => Math.max(0, stats[metric] || 0);
    return {
      daily: [
        ['d1', 'Skor 150 yap', 'Bugün tek oyunda 150 skora ulaş.', by(dailyStats, 'highScore'), 150, 80],
        ['d2', 'Skor 300 yap', 'Bugün tek oyunda 300 skora ulaş.', by(dailyStats, 'highScore'), 300, 120],
        ['d3', '2 maç oyna', 'Bugün 2 maç tamamla.', by(dailyStats, 'totalGames'), 2, 100],
        ['d4', '5 maç oyna', 'Bugün 5 maç tamamla.', by(dailyStats, 'totalGames'), 5, 160],
        ['d5', '1 galibiyet al', 'Bugün 1 galibiyet al.', by(dailyStats, 'totalWins'), 1, 140],
        ['d6', 'Level 2 aç', 'Level haritasında 2. bölüme ulaş.', by(dailyStats, 'unlockedLevel'), 2, 130],
        ['d7', '500 coin biriktir', 'Hesabında 500 coin bulunsun.', by(dailyStats, 'coins'), 500, 90],
        ['d8', '3 güçlendirici taşı', 'Envanterinde toplam 3 güçlendirici olsun.', by(dailyStats, 'powerUps'), 3, 110],
        ['d9', 'Skor 500 yap', 'Bugün tek oyunda 500 skora ulaş.', by(dailyStats, 'highScore'), 500, 180],
        ['d10', 'Level 3 aç', 'Level haritasında 3. bölüme ulaş.', by(dailyStats, 'unlockedLevel'), 3, 200],
      ],
      weekly: [
        ['w1', '10 maç oyna', 'Bu hafta 10 maç tamamla.', by(weeklyStats, 'totalGames'), 10, 350],
        ['w2', '3 galibiyet al', 'Bu hafta 3 galibiyet al.', by(weeklyStats, 'totalWins'), 3, 420],
        ['w3', 'Skor 1000 yap', 'Bu hafta tek oyunda 1000 skora ulaş.', by(weeklyStats, 'highScore'), 1000, 450],
        ['w4', 'Level 4 aç', 'Level haritasında 4. bölüme ulaş.', by(weeklyStats, 'unlockedLevel'), 4, 480],
        ['w5', '1500 coin biriktir', 'Hesabında 1500 coin bulunsun.', by(weeklyStats, 'coins'), 1500, 500],
        ['w6', '8 güçlendirici taşı', 'Envanterinde toplam 8 güçlendirici olsun.', by(weeklyStats, 'powerUps'), 8, 520],
        ['w7', '15 maç oyna', 'Bu hafta 15 maç tamamla.', by(weeklyStats, 'totalGames'), 15, 560],
        ['w8', 'Skor 1500 yap', 'Bu hafta tek oyunda 1500 skora ulaş.', by(weeklyStats, 'highScore'), 1500, 620],
        ['w9', 'Level 6 aç', 'Level haritasında 6. bölüme ulaş.', by(weeklyStats, 'unlockedLevel'), 6, 700],
        ['w10', '6 galibiyet al', 'Bu hafta 6 galibiyet al.', by(weeklyStats, 'totalWins'), 6, 760],
      ],
      monthly: [
        ['m1', '30 maç oyna', 'Bu ay 30 maç tamamla.', by(monthlyStats, 'totalGames'), 30, 1000],
        ['m2', '10 galibiyet al', 'Bu ay 10 galibiyet al.', by(monthlyStats, 'totalWins'), 10, 1200],
        ['m3', 'Skor 2500 yap', 'Bu ay tek oyunda 2500 skora ulaş.', by(monthlyStats, 'highScore'), 2500, 1400],
        ['m4', 'Level 8 aç', 'Level haritasında 8. bölüme ulaş.', by(monthlyStats, 'unlockedLevel'), 8, 1500],
        ['m5', '4000 coin biriktir', 'Hesabında 4000 coin bulunsun.', by(monthlyStats, 'coins'), 4000, 1600],
        ['m6', '20 güçlendirici taşı', 'Envanterinde toplam 20 güçlendirici olsun.', by(monthlyStats, 'powerUps'), 20, 1700],
        ['m7', '50 maç oyna', 'Bu ay 50 maç tamamla.', by(monthlyStats, 'totalGames'), 50, 1900],
        ['m8', 'Skor 4000 yap', 'Bu ay tek oyunda 4000 skora ulaş.', by(monthlyStats, 'highScore'), 4000, 2200],
        ['m9', 'Level 10 aç', 'Final bölümüne ulaş.', by(monthlyStats, 'unlockedLevel'), 10, 2500],
        ['m10', '25 galibiyet al', 'Bu ay 25 galibiyet al.', by(monthlyStats, 'totalWins'), 25, 3000],
      ],
    };
  }

  renderQuests() {
    const list = document.getElementById('quests-list');
    const summary = document.getElementById('quest-summary');
    if (!list || !summary) return;
    const groups = this.buildQuests();
    {
      const labels = { daily: 'GUNLUK', weekly: 'HAFTALIK', monthly: 'AYLIK' };
      const subtitles = {
        daily: 'Bugun bitecek kisa gorevler.',
        weekly: 'Daha uzun hedefler, daha guclu oduller.',
        monthly: 'En zor gorevler ve en yuksek coin odulleri.',
      };
      let activeType = this.activeQuestType || localStorage.getItem('activeQuestType') || 'daily';
      if (!groups[activeType]) activeType = 'daily';
      const claimed = {};
      const counts = {};
      let doneCount = 0;
      let totalCount = 0;

      Object.entries(groups).forEach(([type, quests]) => {
        const periodKey = this.getQuestPeriodKey(type);
        claimed[type] = JSON.parse(localStorage.getItem(`claimedQuests:${periodKey}`) || '[]');
        counts[type] = { ready: 0, claimed: 0, total: quests.length };
        quests.forEach(([id, title, desc, value, target]) => {
          totalCount++;
          const ready = value >= target;
          const isClaimed = claimed[type].includes(id);
          if (isClaimed) doneCount++;
          if (ready && !isClaimed) counts[type].ready++;
          if (isClaimed) counts[type].claimed++;
        });
      });

      summary.innerHTML = `
        <h3>Gorev Merkezi</h3>
        <p>${doneCount}/${totalCount} odul alindi. ${subtitles[activeType]}</p>
        <div class="quest-tabs">
          ${Object.keys(groups).map(type => `
            <button class="quest-tab ${type === activeType ? 'active' : ''}" data-type="${type}">
              <span>${labels[type]}</span>
              <small>${counts[type].claimed}/${counts[type].total}</small>
              ${counts[type].ready > 0 ? `<b>${counts[type].ready}</b>` : ''}
            </button>
          `).join('')}
        </div>`;

      summary.querySelectorAll('.quest-tab').forEach(tab => {
        tab.onclick = () => {
          this.activeQuestType = tab.dataset.type;
          localStorage.setItem('activeQuestType', this.activeQuestType);
          this.renderQuests();
        };
      });

      const periodKey = this.getQuestPeriodKey(activeType);
      list.innerHTML = '';
      const section = document.createElement('section');
      section.className = `quest-section quest-${activeType}`;
      groups[activeType].forEach(([id, title, desc, value, target, reward]) => {
        const ready = value >= target;
        const isClaimed = claimed[activeType].includes(id);
        const pct = Math.min(100, Math.floor((value / target) * 100));
        const row = document.createElement('div');
        row.className = `quest-card ${ready ? 'ready' : ''} ${isClaimed ? 'claimed' : ''}`;
        row.innerHTML = `
          <div class="quest-main">
            <strong>${title}</strong>
            <span>${desc}</span>
            <div class="quest-bar"><div style="width:${pct}%"></div></div>
            <small>${Math.min(value, target)} / ${target}</small>
          </div>
          <div class="quest-reward">
            <b>${reward}</b>
            <span>coin</span>
            <button class="btn btn-buy btn-small quest-claim" ${!ready || isClaimed ? 'disabled' : ''}>${isClaimed ? 'ALINDI' : 'AL'}</button>
          </div>`;
        const btn = row.querySelector('.quest-claim');
        btn.onclick = async () => {
          if (!ready || isClaimed) return;
          const success = await this.authManager.addCoins(reward);
          if (!success) return;
          const current = JSON.parse(localStorage.getItem(`claimedQuests:${periodKey}`) || '[]');
          if (!current.includes(id)) current.push(id);
          localStorage.setItem(`claimedQuests:${periodKey}`, JSON.stringify(current));
          this.updateCoinDisplays();
          this.audio.pickup();
          this.renderQuests();
        };
        section.appendChild(row);
      });
      list.appendChild(section);
      return;
    }
    const labels = { daily: 'GÜNLÜK', weekly: 'HAFTALIK', monthly: 'AYLIK' };
    const claimed = {};
    let doneCount = 0;
    let totalCount = 0;

    list.innerHTML = '';
    Object.entries(groups).forEach(([type, quests]) => {
      const periodKey = this.getQuestPeriodKey(type);
      claimed[type] = JSON.parse(localStorage.getItem(`claimedQuests:${periodKey}`) || '[]');
      const section = document.createElement('section');
      section.className = `quest-section quest-${type}`;
      section.innerHTML = `<h3 class="section-title-cyber">${labels[type]} GÖREVLER</h3>`;
      quests.forEach(([id, title, desc, value, target, reward]) => {
        totalCount++;
        const ready = value >= target;
        const isClaimed = claimed[type].includes(id);
        if (isClaimed) doneCount++;
        const pct = Math.min(100, Math.floor((value / target) * 100));
        const row = document.createElement('div');
        row.className = `quest-card ${ready ? 'ready' : ''} ${isClaimed ? 'claimed' : ''}`;
        row.innerHTML = `
          <div class="quest-main">
            <strong>${title}</strong>
            <span>${desc}</span>
            <div class="quest-bar"><div style="width:${pct}%"></div></div>
            <small>${Math.min(value, target)} / ${target}</small>
          </div>
          <div class="quest-reward">
            <b>${reward}</b>
            <span>coin</span>
            <button class="btn btn-buy btn-small quest-claim" ${!ready || isClaimed ? 'disabled' : ''}>${isClaimed ? 'ALINDI' : 'AL'}</button>
          </div>`;
        const btn = row.querySelector('.quest-claim');
        btn.onclick = async () => {
          if (!ready || isClaimed) return;
          const success = await this.authManager.addCoins(reward);
          if (!success) return;
          const current = JSON.parse(localStorage.getItem(`claimedQuests:${periodKey}`) || '[]');
          if (!current.includes(id)) current.push(id);
          localStorage.setItem(`claimedQuests:${periodKey}`, JSON.stringify(current));
          this.updateCoinDisplays();
          this.audio.pickup();
          this.renderQuests();
        };
        section.appendChild(row);
      });
      list.appendChild(section);
    });

    summary.innerHTML = `
      <h3>Görev Merkezi</h3>
      <p>${doneCount}/${totalCount} ödül alındı. Günlük görevler kolay, haftalıklar daha güçlü, aylık görevler en zor ve en yüksek ödüllü.</p>`;
  }

  applyUiTheme(theme) {
    const selected = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.uiTheme = selected;
    localStorage.setItem('uiTheme', selected);
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.textContent = selected === 'light' ? 'DARK' : 'LIGHT';
      btn.title = selected === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç';
    }
  }

  // â”€â”€ Leaderboard â”€â”€
  async showLeaderboard() {
    this.showScreen('leaderboard-screen');
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="leaderboard-loading"><div class="spinner-container"><div class="spinner spinner-sm"></div></div></div>';
    const data = await this.dbManager.getLeaderboard(20);
    if (data.length === 0) { list.innerHTML = '<p class="text-muted">Henüz skor yok</p>'; return; }
    const uid = this.authManager.user ? this.authManager.user.uid : '';
    const leader = data[0];
    const rows = data.map((entry, i) => {
      const rankVal = i + 1;
      const rankClass = rankVal <= 3 ? ` rank-${rankVal}` : '';
      const medal = rankVal <= 3 ? `TOP ${rankVal}` : `#${rankVal}`;
      const meClass = entry.uid === uid ? ' me' : '';
      const crown = entry.isPremium ? ' <span class="premium-icon" title="Premium">VIP</span>' : '';
      return `
        <div class="leaderboard-item${rankClass}${meClass}">
          <span class="rank${rankClass}">${medal}</span>
          <div class="player-info">
            <span class="player-name">${entry.username}${crown}</span>
            <small>${entry.uid === uid ? 'Senin skorun' : 'Oyuncu skoru'}</small>
          </div>
          <div class="player-score">
            <span>${entry.highScore}</span>
            <small>PUAN</small>
          </div>
        </div>`;
    }).join('');

    list.innerHTML = `
      <div class="leaderboard-hero">
        <span class="leaderboard-kicker">Haftanın zirvesi</span>
        <strong>${leader.username}</strong>
        <small>${leader.highScore} puanla lider</small>
      </div>
      <div class="leaderboard-list">${rows}</div>`;
  }

  // â”€â”€ Profile â”€â”€
  async showProfile() {
    this.showScreen('profile-screen');
    await this.authManager.loadUserData();
    const d = this.authManager.userData || {};
    document.getElementById('profile-username').textContent = d.username || 'Oyuncu';
    document.getElementById('profile-email').textContent = this.authManager.user ? this.authManager.user.email : '';
    document.getElementById('p-high-score').textContent = d.highScore || 0;
    const onlineWins = d.quickWins || 0;
    const onlineLosses = d.quickLosses || 0;
    const onlineDraws = d.quickDraws || 0;
    const totalOnlineGames = d.quickOnlineGames || d.totalOnlineGames || onlineWins + onlineLosses + onlineDraws;
    document.getElementById('p-total-games').textContent = totalOnlineGames;
    document.getElementById('p-total-wins').textContent = onlineWins;
    const drawsEl = document.getElementById('p-total-draws');
    if (drawsEl) drawsEl.textContent = onlineDraws;
    const lossesEl = document.getElementById('p-total-losses');
    if (lossesEl) lossesEl.textContent = onlineLosses;
    // Load match history
    const hist = document.getElementById('match-history');
    if (!this.authManager.user) { hist.innerHTML = '<p class="text-muted">Giriş yapılmadı</p>'; return; }
    hist.innerHTML = '<div class="spinner-container"><div class="spinner spinner-sm"></div></div>';
    const matches = await this.dbManager.getMatchHistory(this.authManager.user.uid, 10);
    if (matches.length === 0) { hist.innerHTML = '<p class="text-muted">Henüz online maç yok</p>'; return; }
    const uid = this.authManager.user.uid;
    hist.innerHTML = matches.map(m => {
      const isP1 = m.player1 && m.player1.uid === uid;
      const myScore = isP1 ? m.player1.score : m.player2.score;
      const oppName = isP1 ? (m.player2 ? m.player2.username : '?') : (m.player1 ? m.player1.username : '?');
      const oppScore = isP1 ? (m.player2 ? m.player2.score : 0) : (m.player1 ? m.player1.score : 0);
      const draw = !m.winnerUid;
      const won = !draw && m.winnerUid === uid;
      const typeLabel = m.matchType === 'quick' ? 'Hizli Mac' : 'Oda Maci';
      const resultLabel = draw ? 'Berabere' : won ? 'Zafer' : 'Maglubiyet';
      const icon = draw ? 'DRAW' : won ? 'WIN' : 'LOSE';
      return `
        <div class="match-history-item ${draw ? 'draw' : won ? 'win' : 'lose'}">
          <div class="match-result-badge">${icon}</div>
          <div class="match-main">
            <div class="match-topline">
              <span class="match-opponent">vs ${oppName}</span>
              <span class="match-type">${typeLabel}</span>
            </div>
            <span class="match-result-text">${resultLabel}</span>
          </div>
          <div class="match-score-pill">
            <span>${myScore}</span>
            <small>-</small>
            <span>${oppScore}</span>
          </div>
        </div>`;
    }).join('');
  }

  // â”€â”€ Levels â”€â”€
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
  }

  getLevelProgressKey() {
    const uid = this.authManager && this.authManager.user ? this.authManager.user.uid : 'guest';
    return `${this.levelProgressKey}:${uid}`;
  }

  getSavedUnlockedLevel() {
    const accountLevel = this.authManager && this.authManager.getUnlockedLevel ? this.authManager.getUnlockedLevel() : 1;
    const deviceLevel = parseInt(localStorage.getItem(this.getLevelProgressKey()) || '1', 10);
    return Math.max(1, Math.min(this.levels.length + 1, Math.max(accountLevel, deviceLevel)));
  }

  async saveUnlockedLevel(level) {
    const safeLevel = Math.max(1, Math.min(this.levels.length + 1, level));
    this.unlockedLevel = safeLevel;
    localStorage.setItem(this.getLevelProgressKey(), String(safeLevel));
    if (this.authManager && this.authManager.setUnlockedLevel) {
      await this.authManager.setUnlockedLevel(safeLevel);
    }
  }

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
      btn.disabled = !isUnlocked;
      btn.innerHTML = `
        <div class="level-card-top">
          <span class="level-number">${level.id}</span>
          <span class="level-state">${isCompleted ? 'OK' : isUnlocked ? 'PLAY' : 'LOCK'}</span>
        </div>
        <div class="level-title">${level.title}</div>
        <div class="level-card-bottom">
          <span class="level-target">${level.target} skor</span>
          <span class="level-difficulty">${level.difficulty}</span>
        </div>`;
      btn.onclick = () => this.startSoloGame(level.id);
      map.appendChild(btn);
    });
  }

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
  }

  async completeCurrentLevel() {
    if (!this.currentLevel) return;
    const nextLevel = Math.min(this.currentLevel.id + 1, this.levels.length + 1);
    if (this.currentLevel.id >= this.unlockedLevel) {
      await this.saveUnlockedLevel(nextLevel);
    }
    this.state = 'gameover';
    this.audio.win();
    this.recordCompletedGame(true);
    this.authManager.addCoins(75 + this.currentLevel.id * 25).then(() => this.updateCoinDisplays());
    this.updatePlayerHeader();
    this.showGameOverScreen(true, `${this.currentLevel.id}. bölüm tamamlandı!`);
  }

  startNextLevel() {
    if (!this.currentLevel) return;
    const nextLevelId = this.currentLevel.id + 1;
    if (nextLevelId > this.levels.length) {
      this.showScreen('map-screen');
      return;
    }
    this.startSoloGame(nextLevelId);
  }

  // â”€â”€ Game Start â”€â”€
  resetGrid() { this.grid = []; for (let r = 0; r < this.GRID_SIZE; r++) this.grid.push(new Array(this.GRID_SIZE).fill(0)); }

  startSoloGame(levelId = 1) {
    this.audio.init(); this.audio.resume();
    const requestedLevel = this.levels.find(level => level.id === levelId) || this.levels[0];
    const highestPlayable = Math.min(this.unlockedLevel, this.levels.length);
    this.currentLevel = requestedLevel.id <= highestPlayable ? requestedLevel : this.levels[highestPlayable - 1];
    this.targetScore = this.currentLevel.target;
    this.mode = 'solo'; this.state = 'playing'; this.score = 0; this.combo = 0; this.animatingClear = false;
    this.rewardContinueUsed = false; this.rewardBombs = 0;
    this.seed = Date.now(); this.rng = new SeededRandom(this.seed); this.blockSetIndex = 0;
    this.resetGrid(); this.applyLevelSetup(this.currentLevel); this.generatePieces(); this.resizeCanvas();
    this.resetPowerUps();
    document.getElementById('opponent-board-wrap').classList.add('hidden');
    document.getElementById('opponent-score-box').classList.add('hidden');
    document.getElementById('timer-box').classList.add('hidden');
    this.updateLevelBadge();
    this.updateScoreDisplay(); this.showScreen('game-screen');
  }

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
    this.seed = Date.now();
    this.rng = new SeededRandom(this.seed);
    this.blockSetIndex = 0;
    this.resetGrid();
    this.generatePieces();
    this.resizeCanvas();
    this.resetPowerUps();
    document.getElementById('opponent-board-wrap').classList.add('hidden');
    document.getElementById('opponent-score-box').classList.add('hidden');
    document.getElementById('timer-box').classList.add('hidden');
    this.updateLevelBadge();
    this.updateScoreDisplay();
    this.showScreen('game-screen');
  }

  startOnlineGame(seed, mode, timeLimit, targetScore) {
    this.audio.init(); this.audio.resume();
    this.mode = 'online'; this.onlineMode = mode; this.state = 'playing'; this.score = 0; this.combo = 0; this.animatingClear = false;
    this.rewardContinueUsed = false; this.rewardBombs = 0;
    this.seed = seed; this.rng = new SeededRandom(seed); this.blockSetIndex = 0;
    this.timerRemaining = timeLimit || 90; this.targetScore = targetScore || 1000;
    this.opponentBoard = null; this.opponentScore = 0;
    this.onlineLocked = false;
    this.opponentUid = null; this.opponentUsername = 'Rakip'; this.onlineMatchRecorded = false;
    this.resetGrid(); this.generatePieces(); this.resizeCanvas();
    const tray = document.getElementById('piece-tray');
    if (tray) tray.classList.remove('locked');
    this.resetPowerUps();
    document.getElementById('opponent-board-wrap').classList.remove('hidden');
    document.getElementById('opponent-score-box').classList.remove('hidden');
    document.getElementById('opponent-score-value').textContent = '0';
    this.stopOnlineTimer();
    if (mode === 'time') {
      document.getElementById('timer-box').classList.remove('hidden');
      this.updateTimerDisplay();
      this.startOnlineTimer();
    } else {
      document.getElementById('timer-box').classList.add('hidden');
    }
    this.updateLevelBadge();
    this.updateScoreDisplay(); this.showScreen('game-screen');
  }

  startOnlineTimer() {
    this.stopOnlineTimer();
    this.onlineTimer = setInterval(() => {
      if (this.mode !== 'online' || this.onlineMode !== 'time' || this.state !== 'playing') {
        this.stopOnlineTimer();
        return;
      }
      this.timerRemaining = Math.max(0, this.timerRemaining - 1);
      this.updateTimerDisplay();
      if (this.timerRemaining <= 0) {
        this.stopOnlineTimer();
        this.onTimeUp();
      }
    }, 1000);
  }

  stopOnlineTimer() {
    if (this.onlineTimer) {
      clearInterval(this.onlineTimer);
      this.onlineTimer = null;
    }
  }

  // â”€â”€ Pieces â”€â”€
  generatePieces() {
    this.pieces = this.shouldUseEndlessFlow()
      ? this.generateEndlessPieceSet()
      : generatePieceSet(this.rng);
    this.blockSetIndex++;
    this.renderPieceTray();
  }

  shouldUseEndlessFlow() {
    return this.mode === 'solo' && !this.currentLevel;
  }

  getEndlessStage() {
    const byScore = Math.floor(this.score / 450);
    const bySets = Math.floor(this.blockSetIndex / 4);
    return Math.min(8, Math.max(byScore, bySets));
  }

  getShapePlacementCount(shape) {
    let count = 0;
    for (let r = 0; r < this.GRID_SIZE; r++) {
      for (let c = 0; c < this.GRID_SIZE; c++) {
        if (this.canPlace(shape, r, c)) count++;
      }
    }
    return count;
  }

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
  }

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
  }

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
  }

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

  // â”€â”€ Canvas â”€â”€
  resizeCanvas() {
    const ga = document.getElementById('game-area');
    const availableWidth = ga.clientWidth - 4;
    const availableHeight = ga.clientHeight - 4;
    let widthForMainBoard = availableWidth;
    if (this.mode === 'online') {
      const gap = window.innerWidth <= 480 ? 8 : 16;
      const onlineWidthLimitedCellSize = Math.floor((availableWidth - gap - 20) / 12.6);
      widthForMainBoard = Math.max(onlineWidthLimitedCellSize * this.GRID_SIZE, 0);
    }
    let cs = Math.floor(Math.min(widthForMainBoard, availableHeight) / this.GRID_SIZE);
    cs = Math.min(cs, this.mode === 'online' ? 68 : 82);
    cs = Math.max(cs, this.mode === 'online' ? 20 : 30);
    this.cellSize = cs;
    const gp = this.GRID_SIZE * cs;
    this.canvas.width = gp + 12; this.canvas.height = gp + 12; this.gridOffset = { x: 6, y: 6 };
    if (this.mode === 'online') {
      this.opponentCellSize = Math.max(Math.floor(cs * 0.4), 12);
      const op = this.GRID_SIZE * this.opponentCellSize;
      this.opponentCanvas.width = op + 8; this.opponentCanvas.height = op + 8;
    }
  }

  // â”€â”€ Ghost & Placement â”€â”€
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
    if (this.mode === 'online' && this.onlineLocked) {
      this.audio.invalid();
      return false;
    }
    if (!this.ghost || !this.ghost.valid) { this.audio.invalid(); return false; }
    const piece = this.pieces[pieceIndex]; const shape = piece.shape; const colorVal = piece.colorIndex + 1;
    for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) if (shape[r][c]) this.grid[this.ghost.row + r][this.ghost.col + c] = colorVal;
    this.score += getShapeCells(shape).length;
    piece.placed = true; this.audio.place();
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
  }

  // â”€â”€ Line Clearing â”€â”€
  checkAndClearLines() {
    const clearRows = [], clearCols = [];
    for (let r = 0; r < this.GRID_SIZE; r++) if (this.grid[r].every(c => c !== 0)) clearRows.push(r);
    for (let c = 0; c < this.GRID_SIZE; c++) { let full = true; for (let r = 0; r < this.GRID_SIZE; r++) if (this.grid[r][c] === 0) { full = false; break; } if (full) clearCols.push(c); }
    const total = clearRows.length + clearCols.length;
    if (total === 0) { this.combo = 0; return false; }

    // Award coins: 10 per line, 20 bonus for each combo level
    const coinsEarned = (total * 10) + (this.combo > 1 ? (this.combo - 1) * 20 : 0);
    this.authManager.addCoins(coinsEarned).then(() => this.updateCoinDisplays());

    this.combo++;
    const cells = new Set();
    for (const r of clearRows) for (let c = 0; c < this.GRID_SIZE; c++) cells.add(`${r},${c}`);
    for (const c of clearCols) for (let r = 0; r < this.GRID_SIZE; r++) cells.add(`${r},${c}`);
    const arr = [];
    for (const k of cells) { const [r, c] = k.split(',').map(Number); this.renderer.addClearParticles(r, c, this.cellSize, this.gridOffset.x, this.gridOffset.y, this.grid[r][c]); arr.push({ r, c }); }
    this.renderer.addFlashCells(arr);
    this.renderer.addClearWave(clearRows, clearCols, this.cellSize, this.gridOffset.x, this.gridOffset.y);
    const pts = cells.size + total * 18 + (this.combo > 1 ? this.combo * 15 : 0);
    this.score += pts;
    this.showScorePopup(pts);
    if (this.combo > 1) { this.showCombo(this.combo); this.audio.combo(this.combo); }
    this.audio.clear(total);
    for (const k of cells) { const [r, c] = k.split(',').map(Number); this.grid[r][c] = 0; }
    this.animatingClear = true; setTimeout(() => { this.animatingClear = false; }, 300);
    return true;
  }

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
  }

  showScorePopup(pts) {
    const c = document.getElementById('score-popup-container');
    const p = document.createElement('div'); p.className = 'score-popup'; p.textContent = `+${pts}`;
    p.style.left = '50%'; p.style.top = '40%'; p.style.transform = 'translateX(-50%)';
    c.appendChild(p); setTimeout(() => p.remove(), 1000);
  }

  showCombo(level) {
    const d = document.getElementById('combo-display'); const t = document.getElementById('combo-text');
    t.textContent = `COMBO x${level}`; d.className = 'combo-display show';
    setTimeout(() => { d.className = 'combo-display hidden'; }, 900);
  }

  // â”€â”€ Game Over â”€â”€
  checkGameOver() {
    const rem = this.pieces.filter(p => !p.placed);
    if (rem.length === 0) return false;
    for (const piece of rem) for (let r = 0; r < this.GRID_SIZE; r++) for (let c = 0; c < this.GRID_SIZE; c++) if (this.canPlace(piece.shape, r, c)) return false;
    return true;
  }

  onOnlineLocked() {
    if (this.onlineLocked) return;
    this.onlineLocked = true;
    this.network.sendPlayerLocked();
    const tray = document.getElementById('piece-tray');
    if (tray) tray.classList.add('locked');
    const status = this.onlineMode === 'time'
        ? 'Hamlen kalmadı. Süre bitince sonuç açıklanacak.'
        : 'Hamlen kalmadı. Rakip de kilitlenirse veya 1000 puana ulaşılırsa maç bitecek.';
    this.showCombo(status);
  }

  async onGameOver() {
    this.stopOnlineTimer();
    this.state = 'gameover'; this.audio.gameOver();
    if (this.mode === 'online') this.network.sendGameOver();
    if (this.mode === 'online') this.recordOnlineMatchResult(false);
    
    // Show interstitial ad
    this.ad.showInterstitial();
    
    // Save to Firebase
    await this.recordCompletedGame(false);
    if (this.score > this.highScore) this.highScore = this.score;
    // Award coins for solo play (1 coin per 10 points)
    if (this.mode === 'solo') {
      const soloCoins = Math.floor(this.score / 10);
      if (soloCoins > 0) this.authManager.addCoins(soloCoins).then(() => this.updateCoinDisplays());
    }

    setTimeout(() => this.endGame(), 800);
  }

  onOpponentGameOver() {
    this.stopOnlineTimer();
    if (this.onlineMode === 'score' && this.opponentScore >= this.targetScore) {
      this.state = 'gameover';
      this.audio.gameOver();
      this.recordCompletedGame(false);
      this.recordOnlineMatchResult(false);
      this.authManager.addCoins(25).then(() => this.updateCoinDisplays());
      this.showGameOverScreen(false, `Rakip ${this.targetScore} puana ulaştı. ${this.score} - ${this.opponentScore}`);
      return;
    }
    this.state = 'gameover';
    this.audio.win();
    this.recordCompletedGame(true);
    this.recordOnlineMatchResult(true);
    this.authManager.addCoins(100).then(() => this.updateCoinDisplays());
    this.showGameOverScreen(true, 'Rakip kaybetti! Kazandın!');
  }

  onOpponentLeft() {
    if (this.state === 'playing') {
      this.stopOnlineTimer();
      this.state = 'gameover';
      this.recordCompletedGame(true);
      this.recordOnlineMatchResult(true);
      this.authManager.addCoins(100).then(() => this.updateCoinDisplays());
      this.showGameOverScreen(true, 'Rakip ayrıldı. Kazandın!');
    }
  }

  onTimeUp() {
    if (this.state !== 'playing') return;
    this.stopOnlineTimer();
    this.state = 'gameover';
    const won = this.score > this.opponentScore; const tied = this.score === this.opponentScore;
    if (won) { 
      this.audio.win(); 
      this.recordCompletedGame(true);
      this.recordOnlineMatchResult(true);
      this.authManager.addCoins(100).then(() => this.updateCoinDisplays());
      this.showGameOverScreen(true, `Kazandın! ${this.score} - ${this.opponentScore}`); 
    }
    else if (tied) { 
      this.recordCompletedGame(false);
      this.recordOnlineMatchResult(null);
      this.authManager.addCoins(50).then(() => this.updateCoinDisplays());
      this.showGameOverScreen(false, `Berabere! ${this.score} - ${this.opponentScore}`); 
    }
    else { 
      this.audio.gameOver(); 
      this.recordCompletedGame(false);
      this.recordOnlineMatchResult(false);
      this.authManager.addCoins(25).then(() => this.updateCoinDisplays());
      this.showGameOverScreen(false, `Kaybettin! ${this.score} - ${this.opponentScore}`); 
    }
  }

  endGame() { this.showGameOverScreen(false, this.mode === 'online' ? 'Kaybettin!' : ''); }

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
    if (nextLevelBtn) nextLevelBtn.classList.toggle('hidden', !canPlayNextLevel);
    if (rewardContinueBtn) {
      rewardContinueBtn.classList.toggle('hidden', !canRewardContinue);
      rewardContinueBtn.disabled = false;
      rewardContinueBtn.textContent = 'Reklam izle, +1 bomba ile devam et';
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
  }

  async continueAfterRewardAd() {
    if (this.mode !== 'solo' || this.rewardContinueUsed) return;
    const btn = document.getElementById('btn-reward-continue');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Reklam hazirlaniyor...';
    }

    const rewarded = await this.ad.showRewarded();
    if (!rewarded) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Reklam hazir degil';
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
    requestAnimationFrame(() => this.resizeCanvas());
  }

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
  }

  updateScoreDisplay() {
    const scoreText = this.mode === 'solo' && this.currentLevel
      ? `${this.score}/${this.currentLevel.target}`
      : this.mode === 'online' && this.onlineMode === 'score'
        ? `${this.score}/${this.targetScore}`
      : this.score;
    document.getElementById('score-value').textContent = scoreText;
    this.updateLevelBadge();
  }

  updateLevelBadge() {
    const badge = document.getElementById('level-badge');
    if (!badge) return;
    const show = this.mode === 'solo' && this.currentLevel;
    badge.classList.toggle('hidden', !show);
    if (!show) return;
    const title = document.getElementById('level-badge-title');
    if (title) title.textContent = `LEVEL ${this.currentLevel.id}`;
  }
  updateTimerDisplay() {
    const m = Math.floor(this.timerRemaining / 60); const s = Math.floor(this.timerRemaining % 60);
    document.getElementById('timer-value').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  // â”€â”€ Game Loop â”€â”€
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
      if (this.mode === 'online' && this.onlineMode === 'time' && this.timerRemaining > 0) this.updateTimerDisplay();
      if (this.mode === 'online' && this.onlineMode === 'score' && this.score >= this.targetScore) {
        this.stopOnlineTimer();
        this.state = 'gameover'; this.audio.win(); this.network.sendGameOver();
        this.recordCompletedGame(true);
        this.recordOnlineMatchResult(true);
        this.authManager.addCoins(100).then(() => this.updateCoinDisplays());
        this.showGameOverScreen(true, `${this.targetScore} puana ilk sen ulaştın!`);
      }
    }
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // â”€â”€ Power-ups Logic â”€â”€
  resetPowerUps() {
    const inv = this.authManager.getInventory();
    this.powerUps = { 
      bomb: inv.bomb || 0, 
      rotate: inv.rotate || 0, 
      skip: inv.skip || 0 
    };
    this.bombMode = false;
    this.updatePowerUpUI();
  }

  updateCoinDisplays() {
    const coins = this.authManager.getCoins();
    const menuCoins = document.getElementById('menu-coins');
    const storeCoins = document.getElementById('store-coins');
    if (menuCoins) menuCoins.textContent = coins;
    if (storeCoins) storeCoins.textContent = coins;
    this.updatePlayerHeader();
    
    // Keep consumable shop buttons clickable so they can show feedback when coins are low.
    document.querySelectorAll('.btn-buy').forEach(btn => {
      const price = parseInt(btn.dataset.price);
      if (!['theme', 'cosmetic'].includes(btn.dataset.type) && Number.isFinite(price)) btn.disabled = false;
    });
    if (typeof this.updateStoreCosmeticsUI === 'function') this.updateStoreCosmeticsUI();
  }

  updatePlayerHeader() {
    const d = this.authManager.userData || {};
    const username = this.authManager.getUsername ? this.authManager.getUsername() : 'Oyuncu';
    const unlocked = this.unlockedLevel || this.getSavedUnlockedLevel();
    const totalGames = d.totalGames || 0;
    const highScore = d.highScore || this.highScore || 0;
    const xp = Math.max(0, highScore + ((unlocked - 1) * 350) + (totalGames * 75));
    const level = Math.max(1, Math.floor(xp / 500) + 1);
    const currentXp = xp % 500;
    const headerUsername = document.getElementById('header-username');
    const headerLevel = document.getElementById('header-level');
    const headerXp = document.getElementById('header-xp');
    if (headerUsername) headerUsername.textContent = username;
    if (headerLevel) headerLevel.textContent = level;
    if (headerXp) headerXp.textContent = `${currentXp}/500`;
  }

  showStore() {
    this.updateCoinDisplays();
    this.updateStoreThemesUI();
    this.updateStoreCosmeticsUI();
    this.showScreen('store-screen');
  }

  setTheme(themeId) {
    if (THEMES[themeId]) {
      BLOCK_COLORS = THEMES[themeId];
      if (this.state === 'playing') {
        this.renderPieceTray();
      }
      localStorage.setItem('selectedTheme', themeId);
    }
  }

  updateStoreThemesUI() {
    const selected = localStorage.getItem('selectedTheme') || 'default';
    const owned = this.authManager.userData?.ownedThemes || ['default'];
    
    document.querySelectorAll('#store-themes .btn-buy').forEach(btn => {
      const themeId = btn.dataset.id;
      const price = parseInt(btn.dataset.price);
      
      if (themeId === selected) {
        btn.textContent = 'Seçildi';
        btn.disabled = true;
        btn.style.background = 'var(--accent)';
        btn.style.color = 'white';
      } else if (owned.includes(themeId) || price === 0) {
        btn.textContent = 'Seç';
        btn.disabled = false;
        btn.style.background = 'var(--surface)';
        btn.style.color = 'var(--neon-green)';
      } else {
        btn.textContent = `${price} coin`;
        btn.disabled = this.authManager.getCoins() < price;
        btn.style.background = '';
        btn.style.color = '';
      }
    });
  }

  setCosmetic(category, cosmeticId) {
    if (!COSMETICS[category] || !COSMETICS[category][cosmeticId]) return;
    localStorage.setItem(`selectedCosmetic:${category}`, cosmeticId);
  }

  getSelectedCosmetic(category) {
    const selected = localStorage.getItem(`selectedCosmetic:${category}`) || 'classic';
    if (!COSMETICS[category] || !COSMETICS[category][selected]) return 'classic';
    const owned = this.authManager.userData?.ownedCosmetics?.[category] || ['classic'];
    const price = COSMETICS[category][selected].price || 0;
    return owned.includes(selected) || price === 0 ? selected : 'classic';
  }

  getBombEffectStyle() {
    return COSMETICS.bombEffect[this.getSelectedCosmetic('bombEffect')] || COSMETICS.bombEffect.classic;
  }

  updateStoreCosmeticsUI() {
    const ownedCosmetics = this.authManager.userData?.ownedCosmetics || {};
    document.querySelectorAll('#store-bomb-effects .btn-buy').forEach(btn => {
      const category = btn.dataset.category;
      const cosmeticId = btn.dataset.id;
      const price = parseInt(btn.dataset.price || '0', 10);
      const selected = this.getSelectedCosmetic(category);
      const owned = ownedCosmetics[category] || ['classic'];
      const isOwned = owned.includes(cosmeticId) || price === 0;

      if (cosmeticId === selected) {
        btn.textContent = 'Seçildi';
        btn.disabled = true;
        btn.style.background = 'var(--accent)';
        btn.style.color = 'white';
      } else if (isOwned) {
        btn.textContent = 'Seç';
        btn.disabled = false;
        btn.style.background = 'var(--surface)';
        btn.style.color = 'var(--neon-green)';
      } else {
        btn.textContent = `${price} coin`;
        btn.disabled = this.authManager.getCoins() < price;
        btn.style.background = '';
        btn.style.color = '';
      }
    });
  }

  updatePowerUpUI() {
    const bombEl = document.getElementById('count-bomb');
    const rotateEl = document.getElementById('count-rotate');
    const skipEl = document.getElementById('count-skip');
    
    if (bombEl) bombEl.textContent = this.powerUps.bomb;
    if (rotateEl) rotateEl.textContent = this.powerUps.rotate;
    if (skipEl) skipEl.textContent = this.powerUps.skip;

    const bombBtn = document.getElementById('btn-bomb');
    const rotateBtn = document.getElementById('btn-rotate');
    const skipBtn = document.getElementById('btn-skip');
    if (bombBtn) bombBtn.classList.toggle('empty', this.powerUps.bomb <= 0);
    if (rotateBtn) rotateBtn.classList.toggle('empty', this.powerUps.rotate <= 0);
    if (skipBtn) skipBtn.classList.toggle('empty', this.powerUps.skip <= 0);
    
    if (this.bombMode) document.getElementById('btn-bomb').classList.add('active');
    else document.getElementById('btn-bomb').classList.remove('active');
  }

  openQuickShop(focusType = 'bomb') {
    const modal = document.getElementById('quick-shop-modal');
    const itemsEl = document.getElementById('quick-shop-items');
    const balanceEl = document.getElementById('quick-shop-balance');
    const statusEl = document.getElementById('quick-shop-status');
    if (!modal || !itemsEl) return;

    const items = [
      { type: 'bomb', icon: 'B', name: 'Bomba', desc: '3x3 alanı temizler.', price: 280 },
      { type: 'rotate', icon: 'R', name: 'Döndür', desc: 'Parçaları çevirir.', price: 150 },
      { type: 'skip', icon: 'P', name: 'Pas Geç', desc: 'Yeni parçalar getirir.', price: 220 },
    ];
    const ordered = [...items].sort((a, b) => (a.type === focusType ? -1 : 0) + (b.type === focusType ? 1 : 0));
    if (balanceEl) balanceEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
    if (statusEl) statusEl.textContent = '';
    itemsEl.innerHTML = ordered.map(item => `
      <div class="quick-shop-item ${item.type === focusType ? 'focused' : ''}">
        <div class="quick-shop-icon">${item.icon}</div>
        <div>
          <div class="quick-shop-name">${item.name}</div>
          <span class="quick-shop-desc">${item.desc}</span>
        </div>
        <button class="quick-shop-buy" data-type="${item.type}" data-price="${item.price}">${item.price} coin</button>
      </div>
    `).join('');

    itemsEl.querySelectorAll('.quick-shop-buy').forEach(btn => {
      btn.onclick = async () => {
        const type = btn.dataset.type;
        const price = parseInt(btn.dataset.price, 10);
        btn.disabled = true;
        const success = await this.authManager.buyPowerUp(type, price);
        if (success) {
          this.powerUps[type] = (this.powerUps[type] || 0) + 1;
          this.updateCoinDisplays();
          this.updatePowerUpUI();
          if (balanceEl) balanceEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
          if (statusEl) statusEl.textContent = 'Alındı. Oyuna devam edebilirsin.';
          this.audio.pickup();
        } else if (statusEl) {
          statusEl.textContent = 'Coin yetersiz.';
          btn.classList.add('shake');
          setTimeout(() => btn.classList.remove('shake'), 500);
        }
        btn.disabled = false;
      };
    });

    modal.classList.remove('hidden');
  }

  closeQuickShop() {
    const modal = document.getElementById('quick-shop-modal');
    if (modal) modal.classList.add('hidden');
  }

  maybeShowTutorial() {
    if (localStorage.getItem('blockBattleTutorialSeen') === '1') return;
    setTimeout(() => {
      const overlay = document.getElementById('tutorial-overlay');
      if (!overlay || this.state === 'playing') return;
      overlay.classList.remove('hidden');
      overlay.classList.add('active');
    }, 450);
  }

  closeTutorial() {
    localStorage.setItem('blockBattleTutorialSeen', '1');
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.remove('active');
    }
  }

  toggleBombMode() {
    if (this.powerUps.bomb <= 0) return;
    this.bombMode = !this.bombMode;
    this.updatePowerUpUI();
  }

  useBombAt(row, col) {
    if (this.powerUps.bomb <= 0) return;
    this.powerUps.bomb--;
    if (this.rewardBombs > 0) this.rewardBombs--;
    else this.authManager.decrementInventory('bomb');
    this.bombMode = false;
    this.renderer.addBombEffect(row, col, this.cellSize, this.gridOffset.x, this.gridOffset.y);
    
    // Clear 3x3 area
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < this.GRID_SIZE && c >= 0 && c < this.GRID_SIZE) {
          this.grid[r][c] = 0;
        }
      }
    }
    
    this.audio.pickup(); // Or a bomb sound
    this.updatePowerUpUI();
    this.checkAndClearLines();
  }

  useRotate() {
    if (this.powerUps.rotate <= 0) return;
    this.powerUps.rotate--;
    this.authManager.decrementInventory('rotate');
    
    this.pieces.forEach(p => {
      if (!p.placed) p.shape = rotateShape(p.shape);
    });
    
    this.renderPieceTray();
    this.renderer.addPowerBurst('rotate');
    this.pulsePieceTray();
    this.updatePowerUpUI();
    this.audio.pickup();
  }

  useSkip() {
    if (this.powerUps.skip <= 0) return;
    this.powerUps.skip--;
    this.authManager.decrementInventory('skip');
    
    this.generatePieces();
    this.renderer.addPowerBurst('skip');
    this.pulsePieceTray();
    this.updatePowerUpUI();
    this.audio.pickup();
  }

  pulsePieceTray() {
    const tray = document.getElementById('piece-tray');
    if (!tray) return;
    tray.classList.remove('power-pulse');
    void tray.offsetWidth;
    tray.classList.add('power-pulse');
    setTimeout(() => tray.classList.remove('power-pulse'), 360);
  }
}

window.addEventListener('DOMContentLoaded', () => { const game = new Game(); game.init(); window._game = game; });
