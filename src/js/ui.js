export function applyUi(Game) {
  Object.assign(Game.prototype, {
    async init() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.opponentCanvas = document.getElementById('opponent-canvas');
      this.opponentCtx = this.opponentCanvas.getContext('2d');
      this.input.init();
      this.setupAuthUI();
      this.setupUI();
      if (this.iap) this.iap.init();
      this.setupNativeBackButton();
      this.setupDeepLinks();
      this.applyUiTheme(localStorage.getItem('uiTheme') || 'dark');
    
      // Initialize Ads
      await this.ad.init();
    
      window.addEventListener('resize', () => {
        if (this.state === 'playing') {
          this.resizeCanvas();
          this.markRenderDirty();
          this.opponentBoardDirty = true;
        }
      });
    
      const params = new URLSearchParams(window.location.search);
      const roomCode = params.get('room');
      if (roomCode) this._pendingRoom = roomCode;
    
      // Init auth - direkt ekrana gec (loading screen kaldirildi)
      this.authManager.init((user) => {
        if (user || this.isGuestSession()) {
          this.enterMainMenuAfterAuth();
        } else {
          this.updateAdBannerState();
          this.showScreen('login-screen');
        }
      });
    
      this.startGameLoop();
    },

    isGuestSession() {
      return !!(this.authManager && this.authManager.isGuestSession && this.authManager.isGuestSession());
    },

    hasAccount() {
      return !!(this.authManager && this.authManager.user);
    },

    setupUI() {
      const globalBack = document.getElementById('global-back');
      if (globalBack) globalBack.onclick = () => this.goBack();
      this.setupGameMenu();
      this.setupAvatarPicker();
      this.setupBoardBackgroundPicker();
      this.setupCoinTopUpButtons();
    
      document.getElementById('btn-solo').onclick = () => this.startEndlessGame();
      const themeToggle = document.getElementById('btn-theme-toggle');
      if (themeToggle) {
        themeToggle.onclick = () => {
          const current = document.documentElement.dataset.uiTheme || 'dark';
          this.applyUiTheme(current === 'dark' ? 'light' : 'dark');
        };
      }
      const headerSettings = document.getElementById('btn-header-settings');
      if (headerSettings) headerSettings.onclick = () => this.openSettingsModal();
      const profileSettings = document.getElementById('profile-settings-btn');
      if (profileSettings) profileSettings.onclick = () => this.openSettingsModal();
      const storeSettings = document.getElementById('store-settings-shortcut');
      if (storeSettings) storeSettings.onclick = () => this.openSettingsModal();
      const leaderboardSettings = document.getElementById('leaderboard-settings-shortcut');
      if (leaderboardSettings) leaderboardSettings.onclick = () => this.openSettingsModal();
      const musicToggle = document.getElementById('btn-music-toggle');
      if (musicToggle) {
        musicToggle.onclick = () => {
          const enabled = !this.isMusicEnabled();
          this.audio.init();
          this.audio.resume();
          localStorage.setItem('blockBattleMusic', enabled ? '1' : '0');
          this.audio.setMusic(enabled);
          this.updateSettingsButtons();
        };
      }
      const notificationsToggle = document.getElementById('btn-notifications-toggle');
      if (notificationsToggle) {
        notificationsToggle.onclick = () => {
          this.toggleNotifications();
        };
      }
      const btnOnline = document.getElementById('btn-online');
      if (btnOnline) {
        btnOnline.onclick = null; // Clear previous
        btnOnline.addEventListener('click', () => {
          console.log('Online click triggered');
          if (!this.requireAccount('Online maç için giriş yap veya ücretsiz hesap oluştur.')) return;
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
        const enabled = !this.isSoundEnabled();
        this.audio.enabled = enabled;
        localStorage.setItem('blockBattleSound', enabled ? '1' : '0');
        this.updateSettingsButtons();
        if (enabled) this.audio.pickup();
      };
      const settingsLogout = document.getElementById('btn-logout');
      if (settingsLogout) settingsLogout.onclick = () => this.logoutToLogin();
      const profileLogout = document.getElementById('profile-logout-btn');
      if (profileLogout) profileLogout.onclick = () => this.logoutToLogin();
      const dailyRewardTrack = document.getElementById('daily-reward-track');
      if (dailyRewardTrack) {
        dailyRewardTrack.onclick = (e) => {
          const item = e.target.closest('span.active');
          if (!item || !dailyRewardTrack.contains(item)) return;
          this.claimDailyReward();
        };
        dailyRewardTrack.onkeydown = (e) => {
          if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches('span.active')) return;
          e.preventDefault();
          this.claimDailyReward();
        };
      }
    
      // Leaderboard
      document.getElementById('btn-leaderboard').onclick = () => {
        if (this.requireAccount('Sıralamayı görmek için giriş yap veya hesap oluştur.')) this.showLeaderboard();
      };
    
      // Profile
      document.getElementById('btn-profile').onclick = () => {
        this.closeGameMenu();
        if (this.requireAccount('Profil ve maç geçmişi için giriş yap veya hesap oluştur.')) this.showProfile();
      };
    
      // Bottom Navigation Logic
      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.onclick = () => {
          const target = btn.dataset.target;
          if (target === 'online-screen') {
            const onlineBtn = document.getElementById('btn-online');
            if (onlineBtn) onlineBtn.click();
            else this.showScreen('online-screen');
            return;
          }
          if (target === 'profile-screen') {
            if (this.requireAccount('Profil ve maç geçmişi için giriş yap veya hesap oluştur.')) this.showProfile();
            return;
          }
          if (target === 'store-screen') this.showStore();
          else if (target === 'map-screen') this.showScreen('map-screen');
          else this.showScreen(target);
        };
      });
    
      document.querySelectorAll('[data-back-target]').forEach(btn => {
        btn.onclick = () => {
          const target = btn.dataset.backTarget || 'menu-screen';
          if (target === 'store-screen') this.showStore(btn.dataset.storeTab || 'currency');
          else this.showScreen(target);
        };
      });
    
      document.querySelectorAll('[data-shop-tab]').forEach(btn => {
        btn.onclick = () => {
          this.selectStoreTab(btn.dataset.shopTab);
        };
      });
    
      document.querySelectorAll('.btn-buy').forEach(btn => {
        btn.onclick = async () => {
          if (btn.dataset.iapProduct) {
            if (this.iap) await this.iap.purchase(btn.dataset.iapProduct, btn);
            return;
          }
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
      document.getElementById('btn-quick-match').onclick = () => { if (this.requireAccount('Hızlı maç için giriş yap veya hesap oluştur.')) this.network.quickMatch(this.onlineMode); };
      const battleInfinite = document.getElementById('btn-battle-infinite');
      if (battleInfinite) battleInfinite.onclick = () => this.startEndlessGame();
      document.getElementById('btn-create-room').onclick = () => { if (this.requireAccount('Oda oluşturmak için giriş yap veya hesap oluştur.')) this.network.createRoom(this.onlineMode); };
      document.getElementById('btn-join-room').onclick = () => {
        if (!this.requireAccount('Odaya katılmak için giriş yap veya hesap oluştur.')) return;
        const c = document.getElementById('room-code-input').value.trim();
        if (c.length >= 4) this.network.joinRoom(c);
      };
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
        this.mode === 'online' ? this.showScreen('online-screen') : (this.currentLevel && !this.isGuestSession() ? this.startSoloGame(this.currentLevel.id) : this.startEndlessGame());
      };
      document.getElementById('btn-next-level').onclick = () => this.startNextLevel();
      document.getElementById('btn-reward-continue').onclick = () => this.continueAfterRewardAd();
      document.getElementById('btn-go-menu').onclick = () => { this.network.leaveRoom(); this.showScreen('menu-screen'); };
    
      const btnSendFeedback = document.getElementById('btn-send-feedback');
      if (btnSendFeedback) {
        btnSendFeedback.onclick = () => this.submitFeedback();
      }
      const profileIdCopy = document.getElementById('profile-id-copy');
      if (profileIdCopy) {
        profileIdCopy.onclick = () => this.copyProfileId();
      }
    },

    setupGameMenu() {
      const openBtn = document.getElementById('btn-open-game-menu');
      const closeBtn = document.getElementById('btn-close-game-menu');
      const backdrop = document.getElementById('game-menu-backdrop');
      if (openBtn) {
        // Ana sayfa avatar menusu ileride gerekirse geri acilabilir.
        // openBtn.onclick = () => this.openGameMenu();
        openBtn.onclick = null;
        openBtn.setAttribute('aria-label', 'Profil avatarı');
        openBtn.classList.add('avatar-menu-disabled');
      }
      if (closeBtn) closeBtn.onclick = () => this.closeGameMenu();
      if (backdrop) backdrop.onclick = () => this.closeGameMenu();
    
      const go = (fn) => {
        this.closeGameMenu();
        fn();
      };
    
      const drawerStore = document.getElementById('drawer-store');
      if (drawerStore) drawerStore.onclick = () => go(() => this.showStore());
      const drawerMap = document.getElementById('drawer-map');
      if (drawerMap) drawerMap.onclick = () => go(() => this.showScreen('map-screen'));
      const drawerQuests = document.getElementById('drawer-quests');
      if (drawerQuests) drawerQuests.onclick = () => go(() => this.showScreen('quests-screen'));
      const drawerLeaderboard = document.getElementById('drawer-leaderboard');
      if (drawerLeaderboard) {
        drawerLeaderboard.onclick = () => go(() => {
          if (this.requireAccount('Sıralamayı görmek için giriş yap veya hesap oluştur.')) this.showLeaderboard();
        });
      }
      const drawerTutorial = document.getElementById('drawer-tutorial');
      if (drawerTutorial) drawerTutorial.onclick = () => go(() => this.openTutorial());
      const drawerFeedback = document.getElementById('drawer-feedback');
      if (drawerFeedback) {
        drawerFeedback.onclick = () => go(() => {
          if (!this.requireAccount('Geri bildirim göndermek için giriş yap veya hesap oluştur.')) return;
          this.openFeedbackModal();
        });
      }
      const drawerSettings = document.getElementById('drawer-settings');
      if (drawerSettings) drawerSettings.onclick = () => go(() => this.openSettingsModal());
    
      const vibrationToggle = document.getElementById('btn-vibration-toggle');
      if (vibrationToggle) vibrationToggle.onclick = () => this.toggleVibration();
      this.updateSettingsButtons();
    
      const settingsTutorial = document.getElementById('settings-tutorial');
      if (settingsTutorial) {
        settingsTutorial.onclick = () => {
          this.closeSettingsModal();
          this.openTutorial();
        };
      }
      const settingsFeedback = document.getElementById('settings-feedback');
      if (settingsFeedback) {
        settingsFeedback.onclick = () => {
          this.closeSettingsModal();
          this.openFeedbackModal();
        };
      }
    },

    openGameMenu() {
      const drawer = document.getElementById('main-menu-drawer');
      if (!drawer) return;
      this.updatePlayerHeader();
      document.body.classList.add('game-menu-open');
      drawer.classList.remove('hidden');
      drawer.setAttribute('aria-hidden', 'false');
    },

    closeGameMenu() {
      const drawer = document.getElementById('main-menu-drawer');
      if (!drawer) return;
      document.body.classList.remove('game-menu-open');
      drawer.classList.add('hidden');
      drawer.setAttribute('aria-hidden', 'true');
    },

    setDrawerButtonMeta(button, text) {
      if (!button) return;
      if (text === 'KAPALI' || text === 'YOK' || text === 'ENGELLİ') button.dataset.enabled = '0';
      if (text === 'AÇIK' || text === 'SES' || text === 'LIGHT' || text === 'DARK') button.dataset.enabled = '1';
      const meta = button.querySelector('em');
      if (meta) meta.textContent = text;
      else button.textContent = text;
    },

    openTutorial() {
      const overlay = document.getElementById('tutorial-overlay');
      if (!overlay) return;
      overlay.classList.remove('hidden');
      overlay.classList.add('active');
    },

    openFeedbackModal() {
      const modal = document.getElementById('feedback-modal');
      const status = document.getElementById('feedback-status');
      const message = document.getElementById('feedback-message');
      if (!modal) return;
      if (status) {
        status.textContent = '';
        status.classList.remove('success');
      }
      if (message) message.value = '';
      modal.classList.remove('hidden');
      setTimeout(() => {
        if (message) message.focus();
      }, 80);
    },

    closeFeedbackModal() {
      const modal = document.getElementById('feedback-modal');
      if (modal) modal.classList.add('hidden');
    },

    openSettingsModal() {
      const modal = document.getElementById('settings-modal');
      if (!modal) return;
      this.updateSettingsButtons();
      document.body.classList.add('modal-open');
      modal.classList.remove('hidden');
    },

    closeSettingsModal() {
      const modal = document.getElementById('settings-modal');
      if (modal) modal.classList.add('hidden');
      document.body.classList.remove('modal-open');
    },

    createAvatarPresets() {
      return [
        { id: 'mint', bg: '#13cfa0', shade: '#2467d8', skin: '#ffd7a8', hair: '#172033', shirt: '#00ff88', glasses: false },
        { id: 'violet', bg: '#8b5cf6', shade: '#12d6b2', skin: '#f1b98d', hair: '#351b4f', shirt: '#38bdf8', glasses: true },
        { id: 'amber', bg: '#f59e0b', shade: '#ef4444', skin: '#f4c095', hair: '#211827', shirt: '#a855f7', glasses: false },
        { id: 'cyan', bg: '#06b6d4', shade: '#2563eb', skin: '#ffe2bd', hair: '#102a43', shirt: '#facc15', glasses: true },
        { id: 'rose', bg: '#fb7185', shade: '#7c3aed', skin: '#d9a178', hair: '#1f2937', shirt: '#22c55e', glasses: false },
        { id: 'lime', bg: '#84cc16', shade: '#14b8a6', skin: '#f5cba7', hair: '#3f2418', shirt: '#0ea5e9', glasses: true },
        { id: 'blue', bg: '#3b82f6', shade: '#0f172a', skin: '#c98a61', hair: '#111827', shirt: '#c084fc', glasses: false },
        { id: 'gold', bg: '#fbbf24', shade: '#0f766e', skin: '#ffddb0', hair: '#5c2e12', shirt: '#ef4444', glasses: true },
        { id: 'night', bg: '#334155', shade: '#a855f7', skin: '#e0b08c', hair: '#020617', shirt: '#10b981', glasses: false },
        { id: 'aqua', bg: '#2dd4bf', shade: '#6366f1', skin: '#f0c2a0', hair: '#273449', shirt: '#fb923c', glasses: true },
        { id: 'ruby', bg: '#dc2626', shade: '#f97316', skin: '#f3b484', hair: '#2b1a12', shirt: '#22d3ee', glasses: false },
        { id: 'indigo', bg: '#4f46e5', shade: '#111827', skin: '#b98262', hair: '#111827', shirt: '#f472b6', glasses: true },
        { id: 'leaf', bg: '#16a34a', shade: '#0e7490', skin: '#ffd2a1', hair: '#422006', shirt: '#60a5fa', glasses: false },
        { id: 'sunset', bg: '#f97316', shade: '#be185d', skin: '#eab08c', hair: '#1e293b', shirt: '#34d399', glasses: true },
        { id: 'steel', bg: '#64748b', shade: '#06b6d4', skin: '#f6d0aa', hair: '#334155', shirt: '#facc15', glasses: false },
        { id: 'plasma', bg: '#a855f7', shade: '#ec4899', skin: '#ffdfc4', hair: '#2e1065', shirt: '#14b8a6', glasses: true },
        { id: 'forest', bg: '#15803d', shade: '#84cc16', skin: '#d8a47f', hair: '#172554', shirt: '#f97316', glasses: false },
        { id: 'sky', bg: '#0ea5e9', shade: '#22c55e', skin: '#f8caa6', hair: '#0f172a', shirt: '#e879f9', glasses: true }
      ];
    },

    loadAccountVisualPreferences() {
      const data = this.authManager?.userData || {};
      if (data.avatar && this.authManager?.user) {
        localStorage.setItem(this.getAvatarStorageKey(), JSON.stringify(data.avatar));
      }
      if (data.boardBackground && this.authManager?.user) {
        localStorage.setItem(this.getBoardBackgroundStorageKey(), data.boardBackground);
        this.boardBackgroundSrc = data.boardBackground;
        this.loadBoardBackground(data.boardBackground);
      } else {
        this.boardBackgroundSrc = localStorage.getItem(this.getBoardBackgroundStorageKey()) || localStorage.getItem('blockBattleBoardBackground') || '';
        if (this.boardBackgroundSrc) this.loadBoardBackground(this.boardBackgroundSrc);
      }
      this.applySelectedAvatar();
    },

    getSelectedAvatar() {
      try {
        const saved = localStorage.getItem(this.getAvatarStorageKey());
        if (saved) return JSON.parse(saved);
      } catch (err) {
        console.warn('Avatar okunamadi', err);
      }
      return { type: 'preset', id: this.avatarPresets[0]?.id || 'mint' };
    },

    saveSelectedAvatar(avatar) {
      localStorage.setItem(this.getAvatarStorageKey(), JSON.stringify(avatar));
      this.applySelectedAvatar();
      this.renderAvatarPicker();
      this.persistVisualPreference({ avatar });
    },

    async persistVisualPreference(update) {
      if (!this.authManager || !this.authManager.user || this.isGuestSession()) return;
      if (!this.authManager.userData) this.authManager.userData = {};
      Object.assign(this.authManager.userData, update);
      try {
        await db.collection('users').doc(this.authManager.user.uid).set(update, { merge: true });
      } catch (err) {
        console.warn('Gorsel tercih hesapta kaydedilemedi', err);
      }
    },

    buildAvatarSvg(preset, selected = false) {
      const p = preset || this.avatarPresets[0];
      const ring = selected ? '#ffd166' : 'rgba(255,255,255,0.72)';
      const glasses = p.glasses
        ? '<path d="M30 45h13M53 45h13M43 45h10" stroke="#101827" stroke-width="4" stroke-linecap="round"/><circle cx="35" cy="45" r="7" fill="none" stroke="#101827" stroke-width="4"/><circle cx="61" cy="45" r="7" fill="none" stroke="#101827" stroke-width="4"/>'
        : '<circle cx="39" cy="45" r="3.5" fill="#101827"/><circle cx="57" cy="45" r="3.5" fill="#101827"/>';
      return `
        <svg class="avatar-art" viewBox="0 0 96 96" aria-hidden="true">
          <rect width="96" height="96" rx="48" fill="${p.bg}"/>
          <circle cx="78" cy="20" r="35" fill="${p.shade}" opacity="0.58"/>
          <circle cx="22" cy="82" r="34" fill="#03101f" opacity="0.18"/>
          <circle cx="48" cy="45" r="24" fill="${p.skin}"/>
          <path d="M25 45c2-20 17-28 31-25 11 2 18 11 17 25-8-10-18-13-29-11-8 1-14 5-19 11z" fill="${p.hair}"/>
          ${glasses}
          <path d="M39 59c5 5 13 5 18 0" fill="none" stroke="#101827" stroke-width="4" stroke-linecap="round"/>
          <path d="M21 96c3-20 14-31 27-31s24 11 27 31H21z" fill="${p.shirt}"/>
          <circle cx="48" cy="48" r="43" fill="none" stroke="${ring}" stroke-width="4" opacity="0.85"/>
        </svg>
      `;
    },

    buildAvatarMarkup(avatar = this.getSelectedAvatar(), selected = false) {
      if (avatar.type === 'image' && avatar.src) {
        const safeSrc = String(avatar.src).startsWith('data:image/') ? avatar.src : '';
        if (safeSrc) return `<img class="avatar-art avatar-photo" src="${safeSrc}" alt="">`;
      }
      const preset = this.avatarPresets.find((item) => item.id === avatar.id) || this.avatarPresets[0];
      return this.buildAvatarSvg(preset, selected);
    },

    applySelectedAvatar() {
      const avatar = this.getSelectedAvatar();
      document.querySelectorAll('.figma-avatar-btn, .profile-avatar-xl').forEach((el) => {
        el.innerHTML = this.buildAvatarMarkup(avatar);
        el.classList.toggle('has-photo-avatar', avatar.type === 'image');
      });
    },

    setupAvatarPicker() {
      const avatarButton = document.getElementById('profile-avatar-button');
      if (avatarButton) avatarButton.onclick = () => this.openAvatarPicker();
    
      const grid = document.getElementById('avatar-picker-grid');
      if (grid) {
        grid.onclick = (e) => {
          const option = e.target.closest('[data-avatar-id]');
          if (!option) return;
          this.saveSelectedAvatar({ type: 'preset', id: option.dataset.avatarId });
        };
      }
    
      const input = document.getElementById('avatar-file-input');
      if (input) {
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (file) this.saveUploadedAvatar(file);
          input.value = '';
        };
      }
    
      this.applySelectedAvatar();
    },

    openAvatarPicker() {
      const modal = document.getElementById('avatar-picker-modal');
      if (!modal) return;
      this.renderAvatarPicker();
      modal.classList.remove('hidden');
    },

    closeAvatarPicker() {
      const modal = document.getElementById('avatar-picker-modal');
      if (modal) modal.classList.add('hidden');
    },

    renderAvatarPicker() {
      const grid = document.getElementById('avatar-picker-grid');
      if (!grid) return;
      const selected = this.getSelectedAvatar();
      grid.innerHTML = this.avatarPresets.map((preset) => {
        const isSelected = selected.type === 'preset' && selected.id === preset.id;
        return `
          <button class="avatar-option ${isSelected ? 'selected' : ''}" type="button" data-avatar-id="${preset.id}" aria-label="Avatar seç">
            ${this.buildAvatarSvg(preset, isSelected)}
          </button>
        `;
      }).join('');
    },

    async saveUploadedAvatar(file) {
      const status = document.getElementById('avatar-picker-status');
      if (status) status.textContent = '';
      if (!file.type.startsWith('image/')) {
        if (status) status.textContent = 'Lütfen bir fotoğraf seç.';
        return;
      }
      try {
        const src = await this.resizeAvatarFile(file);
        this.saveSelectedAvatar({ type: 'image', src });
        if (status) status.textContent = 'Fotoğraf avatar olarak kaydedildi.';
      } catch (err) {
        console.error('Avatar yukleme hatasi', err);
        if (status) status.textContent = 'Fotoğraf yüklenemedi, başka bir görsel dene.';
      }
    },

    resizeAvatarFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const image = new Image();
          image.onerror = reject;
          image.onload = () => {
            const size = 160;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const side = Math.min(image.width, image.height);
            const sx = (image.width - side) / 2;
            const sy = (image.height - side) / 2;
            ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.78));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    setupBoardBackgroundPicker() {
      const button = document.getElementById('btn-board-bg');
      const input = document.getElementById('board-bg-input');
      if (button && input) {
        button.onclick = () => input.click();
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (file) this.saveBoardBackgroundFile(file);
          input.value = '';
        };
      }
      if (this.boardBackgroundSrc) this.loadBoardBackground(this.boardBackgroundSrc);
    },

    async saveBoardBackgroundFile(file) {
      if (!file.type.startsWith('image/')) return;
      try {
        const src = await this.resizeBoardBackgroundFile(file);
        localStorage.setItem(this.getBoardBackgroundStorageKey(), src);
        localStorage.setItem('blockBattleBoardBackground', src);
        this.persistVisualPreference({ boardBackground: src });
        this.loadBoardBackground(src);
      } catch (err) {
        console.error('Izgara arka plan yuklenemedi', err);
      }
    },

    loadBoardBackground(src) {
      if (!src || !String(src).startsWith('data:image/')) return;
      const image = new Image();
      image.onload = () => {
        this.boardBackgroundImage = image;
        this.boardBackgroundSrc = src;
        this.markRenderDirty();
      };
      image.src = src;
    },

    resizeBoardBackgroundFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const image = new Image();
          image.onerror = reject;
          image.onload = () => {
            const maxSize = 420;
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * scale));
            const height = Math.max(1, Math.round(image.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.68));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    updateSettingsButtons() {
      this.audio.enabled = this.isSoundEnabled();
      const soundBtn = document.getElementById('btn-sound-toggle');
      this.setDrawerButtonMeta(soundBtn, this.isSoundEnabled() ? 'AÇIK' : 'KAPALI');
      if (soundBtn) soundBtn.title = this.isSoundEnabled() ? 'Sesi kapat' : 'Sesi aç';
    
      const musicBtn = document.getElementById('btn-music-toggle');
      this.audio.setMusic(this.isMusicEnabled() && this.audio.initialized);
      this.setDrawerButtonMeta(musicBtn, this.isMusicEnabled() ? 'AÇIK' : 'KAPALI');
      if (musicBtn) musicBtn.title = this.isMusicEnabled() ? 'Müziği kapat' : 'Müziği aç';
    
      this.updateVibrationButton();
    
      const notificationsBtn = document.getElementById('btn-notifications-toggle');
      let notificationLabel = this.isNotificationsEnabled() ? 'AÇIK' : 'KAPALI';
      if (!('Notification' in window)) notificationLabel = 'YOK';
      else if (Notification.permission === 'denied') notificationLabel = 'ENGELLİ';
      this.setDrawerButtonMeta(notificationsBtn, notificationLabel);
      if (notificationsBtn) notificationsBtn.title = 'Tarayıcı bildirimi iznine bağlıdır.';
    },

    updateVibrationButton() {
      const btn = document.getElementById('btn-vibration-toggle');
      this.setDrawerButtonMeta(btn, this.isVibrationEnabled() ? 'AÇIK' : 'KAPALI');
    },

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
    
      const playerMeta = [
        '',
        '---',
        `Oyuncu: ${this.authManager && this.authManager.getUsername ? this.authManager.getUsername() : 'Oyuncu'}`,
        `Oyuncu ID: ${this.getPlayerPublicId()}`
      ].join('\n');
      const result = await this.authManager.submitFeedback(typeEl ? typeEl.value : 'other', `${message}${playerMeta}`);
      if (result && result.ok) {
        if (messageEl) messageEl.value = '';
        if (statusEl) {
          statusEl.textContent = 'Teşekkürler, mesajın alındı.';
          statusEl.classList.add('success');
        }
      } else if (statusEl) {
        statusEl.classList.remove('success');
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
    },

    applyUiTheme(theme) {
      const selected = theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.uiTheme = selected;
      localStorage.setItem('uiTheme', selected);
      const btn = document.getElementById('btn-theme-toggle');
      if (btn) {
        this.setDrawerButtonMeta(btn, selected === 'light' ? 'DARK' : 'LIGHT');
        btn.title = selected === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç';
      }
    },

    updatePlayerHeader(activeScreenId) {
      const screenId = activeScreenId || (typeof UiHeader !== 'undefined' ? UiHeader.getActiveScreenId() : null);
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
      const onlineUsername = document.getElementById('online-header-username');
      const onlineLevel = document.getElementById('online-header-level');
      const onlineXp = document.getElementById('online-header-xp');
      const storeUsername = document.getElementById('store-header-username');
      const storeLevel = document.getElementById('store-header-level');
      const storeXp = document.getElementById('store-header-xp');
      const mapUsername = document.getElementById('map-header-username');
      const mapLevel = document.getElementById('map-header-level');
      const mapXp = document.getElementById('map-header-xp');
      const leaderboardUsername = document.getElementById('leaderboard-header-username');
      const leaderboardLevel = document.getElementById('leaderboard-header-level');
      const leaderboardXp = document.getElementById('leaderboard-header-xp');
      const questsUsername = document.getElementById('quests-header-username');
      const questsLevel = document.getElementById('quests-header-level');
      const questsXp = document.getElementById('quests-header-xp');
      const homeLevel = document.getElementById('home-level');
      const homeXpLabel = document.getElementById('home-xp-label');
      const homeXpCurrent = document.getElementById('home-xp-current');
      const homeXpNext = document.getElementById('home-xp-next');
      const homeXpBar = document.getElementById('home-xp-bar');
      const drawerUsername = document.getElementById('drawer-username');
      const setText = (el, value) => { if (el) el.textContent = value; };
      setText(headerUsername, username);
      setText(onlineUsername, username);
      setText(storeUsername, username);
      setText(mapUsername, username);
      setText(leaderboardUsername, username);
      setText(questsUsername, username);
      if (drawerUsername) drawerUsername.textContent = username;
      setText(headerLevel, level);
      setText(headerXp, `${currentXp}/500`);
      setText(onlineLevel, level);
      setText(onlineXp, `${currentXp}/500`);
      setText(storeLevel, level);
      setText(storeXp, `${currentXp}/500`);
      setText(mapLevel, level);
      setText(mapXp, `${currentXp}/500`);
      setText(leaderboardLevel, level);
      setText(leaderboardXp, `${currentXp}/500`);
      setText(questsLevel, level);
      setText(questsXp, `${currentXp}/500`);
      setText(homeLevel, level);
      setText(homeXpLabel, `${currentXp}/500 XP`);
      setText(homeXpCurrent, `${currentXp} XP`);
      setText(homeXpNext, `${500 - currentXp} XP kaldı`);
      if (homeXpBar) homeXpBar.style.width = `${Math.min(100, Math.max(0, (currentXp / 500) * 100))}%`;
      this.applySelectedAvatar();
    },

    maybeShowTutorial() {
      if (localStorage.getItem('blockBattleTutorialSeen') === '1') return;
      setTimeout(() => {
        const overlay = document.getElementById('tutorial-overlay');
        if (!overlay || this.state === 'playing') return;
        overlay.classList.remove('hidden');
        overlay.classList.add('active');
      }, 450);
    },

    closeTutorial() {
      localStorage.setItem('blockBattleTutorialSeen', '1');
      const overlay = document.getElementById('tutorial-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('active');
      }
    },

    pulsePieceTray() {
      const tray = document.getElementById('piece-tray');
      if (!tray) return;
      tray.classList.remove('power-pulse');
      void tray.offsetWidth;
      tray.classList.add('power-pulse');
      setTimeout(() => tray.classList.remove('power-pulse'), 360);
    },

    pulseBoardClear(intensity = 'normal') {
      const board = document.getElementById('main-board-wrap');
      if (!board) return;
      board.classList.remove('line-clear-kick', 'line-clear-kick-strong');
      void board.offsetWidth;
      board.classList.add(intensity === 'strong' ? 'line-clear-kick-strong' : 'line-clear-kick');
      setTimeout(() => board.classList.remove('line-clear-kick', 'line-clear-kick-strong'), 420);
    }
  });
}
