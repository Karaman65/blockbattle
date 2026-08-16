export function applyDom(Game) {
  Object.assign(Game.prototype, {
    startGameLoop() {
      if (this._rafId) return; // zaten çalışıyor
      this._rafId = requestAnimationFrame((t) => this.gameLoop(t));
    },

    enterMainMenuAfterAuth() {
      this.highScore = (this.authManager.userData && this.authManager.userData.highScore) || 0;
      this.loadAccountVisualPreferences();
      const displayName = this.authManager.getUsername();
      const menuName = document.getElementById('menu-username');
      if (menuName) menuName.textContent = displayName;
    
      const savedTheme = localStorage.getItem('selectedTheme') || 'default';
      this.setTheme(savedTheme);
      this.unlockedLevel = this.isGuestSession() ? 1 : this.getSavedUnlockedLevel();
      this.updateCoinDisplays();
      this.updatePlayerHeader();
      this.renderDailyReward();
      this.renderHomeQuestPreview();
      if (this.iap) this.iap.updateProductLabels();
      if (!this.isGuestSession() && this.handlePendingRoomLink()) return;
      this.screenHistory = [];
      this.showScreen('menu-screen', { skipHistory: true });
      this.updateAdBannerState();
      this.maybeShowTutorial();
    },

    async updateAdBannerState() {
      const isPremium = !!(this.authManager && this.authManager.isPremium && this.authManager.isPremium());
      const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      const shouldShowBanner = isNative && !isPremium && (this.hasAccount() || this.isGuestSession());
      document.body.classList.toggle('premium-no-ads', isPremium);
      document.body.classList.toggle('ad-banner-visible', shouldShowBanner);
    
      if (!this.ad) return;
      if (!shouldShowBanner) {
        await this.ad.hideBanner();
        return;
      }
    
      await this.ad.showBanner();
    },

    requireAccount(message = 'Bu bölüm için giriş yap veya hesap oluştur.') {
      if (this.hasAccount()) return true;
      this.openAccountRequiredModal(message);
      return false;
    },

    openAccountRequiredModal(message) {
      const modal = document.getElementById('account-required-modal');
      const messageEl = document.getElementById('account-required-message');
      if (messageEl) messageEl.textContent = message || 'Bu bölüm için giriş yap veya hesap oluştur.';
      if (modal) modal.classList.remove('hidden');
    },

    closeAccountRequiredModal() {
      const modal = document.getElementById('account-required-modal');
      if (modal) modal.classList.add('hidden');
    },

    goToLoginFromAccountPrompt() {
      this.closeAccountRequiredModal();
      this.authManager.clearGuestSession();
      this.authManager.isGuest = false;
      this.authManager.userData = null;
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.classList.add('hidden');
      this.screenHistory = [];
      this.showScreen('login-screen', { skipHistory: true });
    },

    showScreen(id, options = {}) {
      const el = document.getElementById(id);
      if (!el) return;
    
      const previous = this.getActiveScreenId();
      if (options.resetHistory) this.screenHistory = [];
      const canTrackHistory = !options.skipHistory
        && !options.resetHistory
        && previous
        && previous !== id
        && !this.isOverlayScreen(previous)
        && !this.isAuthScreen(previous)
        && !this.isAuthScreen(id);
      if (canTrackHistory) {
        const last = this.screenHistory[this.screenHistory.length - 1];
        if (last !== previous) this.screenHistory.push(previous);
        if (this.screenHistory.length > 20) this.screenHistory.shift();
      }
      this.currentScreenId = id;
    
      this.closeTransientOverlays();
    
      el.classList.add('active');
    
      document.querySelectorAll('.screen').forEach(s => {
        if (!s.classList.contains('overlay') && s.id !== id) {
          s.classList.remove('active');
        }
      });
    
      if (id === 'game-screen' && this.canvas) {
        requestAnimationFrame(() => {
          this.resizeCanvas();
          this.drawCurrentFrame();
        });
      }
      if (id === 'map-screen') this.renderLevelMap();
      if (id === 'quests-screen') this.renderQuests();
      if (id === 'online-screen') {
        const roomInfo = document.getElementById('room-info');
        if (roomInfo) roomInfo.classList.remove('hidden');
      }
      if (id === 'menu-screen') this.renderDailyReward();
      if (id === 'menu-screen') this.renderHomeQuestPreview();
      if (this.authManager && this.authManager.userData) this.updateCoinDisplays();
      this.updateBackButton(id);
    
      // Bottom Nav Visibility
      const bottomNav = document.getElementById('bottom-nav');
      if (bottomNav) {
        const showNavScreens = ['menu-screen', 'store-screen', 'quests-screen', 'profile-screen', 'leaderboard-screen', 'map-screen', 'online-screen'];
        if (showNavScreens.includes(id) && (this.hasAccount() || this.isGuestSession())) {
          bottomNav.classList.remove('hidden');
          // Update active state
          document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === id);
          });
        } else {
          bottomNav.classList.add('hidden');
        }
      }
    },

    closeTransientOverlays() {
      document.body.classList.remove('modal-open');
      [
        'main-menu-drawer',
        'quick-shop-modal',
        'password-reset-modal',
        'account-required-modal',
        'feedback-modal',
        'avatar-picker-modal',
        'settings-modal',
        'tutorial-overlay',
        'pause-overlay',
      ].forEach((id) => {
        const node = document.getElementById(id);
        if (!node) return;
        node.classList.add('hidden');
        node.classList.remove('active');
        if (node.hasAttribute('aria-hidden')) node.setAttribute('aria-hidden', 'true');
      });
    },

    getActiveScreenId() {
      const active = document.querySelector('.screen.active:not(.overlay)');
      return active ? active.id : this.currentScreenId || 'menu-screen';
    },

    isOverlayScreen(id) {
      const el = document.getElementById(id);
      return !!(el && el.classList.contains('overlay'));
    },

    isAuthScreen(id) {
      return id === 'login-screen' || id === 'register-screen';
    },

    isMainNavScreen(id) {
      return ['store-screen', 'quests-screen', 'profile-screen', 'leaderboard-screen', 'map-screen', 'online-screen'].includes(id);
    },

    showGameBoot(title, subtitle) {
      clearTimeout(this.gameBootTimer);
      const overlay = document.getElementById('game-boot-overlay');
      const titleEl = document.getElementById('game-boot-title');
      const subtitleEl = document.getElementById('game-boot-subtitle');
      if (titleEl) titleEl.textContent = title || 'Arena hazırlanıyor';
      if (subtitleEl) subtitleEl.textContent = subtitle || 'Bloklar diziliyor...';
      if (overlay) overlay.classList.remove('hidden', 'ready');
    },

    hideGameBoot() {
      const overlay = document.getElementById('game-boot-overlay');
      if (!overlay) return;
      overlay.classList.add('ready');
      this.gameBootTimer = setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('ready');
      }, 220);
    },

    enterGameScreen(title, subtitle) {
      this.showGameBoot(title, subtitle);
      this.showScreen('game-screen');
      requestAnimationFrame(() => {
        this.resizeCanvas();
        this.drawCurrentFrame();
        requestAnimationFrame(() => this.hideGameBoot());
      });
      this.startGameLoop(); // Performance: oyun başlarken döngüyü (yeniden) başlat
    },

    markRenderDirty() {
      this.renderDirty = true;
    },

    updateBackButton(id) {
      const backBtn = document.getElementById('global-back');
      if (!backBtn) return;
      backBtn.classList.add('hidden');
    },

    goBack() {
      return this.handleBackNavigation(false);
    },

    handleBackNavigation(fromNative = false) {
      if (this.closeTopTransientOverlay()) return true;
    
      const id = this.getActiveScreenId();
    
      if (id === 'game-screen') {
        this.openPauseMenu();
        return true;
      }
    
      if (id === 'register-screen') {
        this.showScreen('login-screen', { skipHistory: true });
        return true;
      }
    
      if (id === 'login-screen') {
        return this.maybeExitApp(fromNative);
      }
    
      if (id === 'waiting-screen') {
        this.network.leaveRoom();
        this.showScreen('online-screen', { skipHistory: true });
        return true;
      }
    
      if (id === 'gameover-screen') {
        const target = this.mode === 'online' ? 'online-screen' : (this.currentLevel ? 'map-screen' : 'menu-screen');
        this.showScreen(target, { skipHistory: true });
        return true;
      }
    
      if (id === 'menu-screen') {
        return this.maybeExitApp(fromNative);
      }
    
      if (this.isMainNavScreen(id)) {
        this.showScreen('menu-screen', { skipHistory: true });
        return true;
      }
    
      while (this.screenHistory.length) {
        const previous = this.screenHistory.pop();
        if (!previous || previous === id) continue;
        const node = document.getElementById(previous);
        if (!node || this.isOverlayScreen(previous)) continue;
        if (this.isAuthScreen(previous)) continue;
        if (previous === 'game-screen' && this.state !== 'playing') continue;
        this.showScreen(previous, { skipHistory: true });
        return true;
      }
    
      if (id !== 'menu-screen' && (this.hasAccount() || this.isGuestSession())) {
        this.showScreen('menu-screen', { skipHistory: true });
        return true;
      }
    
      return this.maybeExitApp(fromNative);
    },

    closeTopTransientOverlay() {
      const closers = [
        ['quick-shop-modal', () => this.closeQuickShop()],
        ['account-required-modal', () => this.closeAccountRequiredModal()],
        ['password-reset-modal', () => this.closePasswordResetModal()],
        ['feedback-modal', () => this.closeFeedbackModal()],
        ['avatar-picker-modal', () => this.closeAvatarPicker()],
        ['settings-modal', () => this.closeSettingsModal()],
        ['main-menu-drawer', () => this.closeGameMenu()],
      ];
    
      for (const [id, close] of closers) {
        const node = document.getElementById(id);
        if (node && !node.classList.contains('hidden')) {
          close();
          return true;
        }
      }
    
      const tutorial = document.getElementById('tutorial-overlay');
      if (tutorial && tutorial.classList.contains('active')) {
        this.closeTutorial();
        return true;
      }
    
      const pauseOverlay = document.getElementById('pause-overlay');
      if (pauseOverlay && pauseOverlay.classList.contains('active')) {
        this.closePauseMenu();
        return true;
      }
    
      return false;
    },

    maybeExitApp(fromNative) {
      if (!fromNative) return false;
      const now = Date.now();
      if (now - this.lastExitBackAt < 1600) {
        const app = window.Capacitor?.Plugins?.App;
        if (app && typeof app.exitApp === 'function') app.exitApp();
        return true;
      }
      this.lastExitBackAt = now;
      this.showToast ? this.showToast('Çıkmak için tekrar geri bas') : console.log('Çıkmak için tekrar geri bas');
      return true;
    },

    setupNativeBackButton() {
      if (this.nativeBackHandlerRegistered) return;
      const app = window.Capacitor?.Plugins?.App;
      if (!app || typeof app.addListener !== 'function') return;
    
      app.addListener('backButton', () => this.handleBackNavigation(true));
      this.nativeBackHandlerRegistered = true;
    },

    openPauseMenu() {
      const pauseTitle = document.getElementById('pause-title');
      if (pauseTitle) pauseTitle.textContent = this.mode === 'online' ? 'Maç Menüsü' : 'Duraklatıldı';
      const pauseOverlay = document.getElementById('pause-overlay');
      if (!pauseOverlay) return;
      pauseOverlay.classList.remove('hidden');
      pauseOverlay.classList.add('active');
    },

    closePauseMenu() {
      const pauseOverlay = document.getElementById('pause-overlay');
      if (!pauseOverlay) return;
      pauseOverlay.classList.add('hidden');
      pauseOverlay.classList.remove('active');
    },

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
  });
}
