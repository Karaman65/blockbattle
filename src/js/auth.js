export function applyAuth(Game) {
  Object.assign(Game.prototype, {
    async logoutToLogin() {
      this.closeGameMenu();
      this.closeTransientOverlays();
      if (this.network && typeof this.network.leaveRoom === 'function') {
        try { this.network.leaveRoom(); } catch (err) { console.warn('Leave room during logout failed:', err); }
      }
      if (this.authManager) await this.authManager.logout();
      this.state = 'menu';
      this.mode = 'solo';
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.classList.add('hidden');
      this.screenHistory = [];
      this.showScreen('login-screen', { skipHistory: true });
    },

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
      const accountRequiredClose = document.getElementById('account-required-close');
      if (accountRequiredClose) accountRequiredClose.onclick = () => this.closeAccountRequiredModal();
      const accountRequiredCancel = document.getElementById('account-required-cancel');
      if (accountRequiredCancel) accountRequiredCancel.onclick = () => this.closeAccountRequiredModal();
      const accountRequiredLogin = document.getElementById('account-required-login');
      if (accountRequiredLogin) accountRequiredLogin.onclick = () => this.goToLoginFromAccountPrompt();
      const accountRequiredModal = document.getElementById('account-required-modal');
      if (accountRequiredModal) {
        accountRequiredModal.onclick = (e) => {
          if (e.target === accountRequiredModal) this.closeAccountRequiredModal();
        };
      }
      const feedbackClose = document.getElementById('feedback-close');
      if (feedbackClose) feedbackClose.onclick = () => this.closeFeedbackModal();
      const feedbackModal = document.getElementById('feedback-modal');
      if (feedbackModal) {
        feedbackModal.onclick = (e) => {
          if (e.target === feedbackModal) this.closeFeedbackModal();
        };
      }
      const avatarPickerClose = document.getElementById('avatar-picker-close');
      if (avatarPickerClose) avatarPickerClose.onclick = () => this.closeAvatarPicker();
      const avatarPickerModal = document.getElementById('avatar-picker-modal');
      if (avatarPickerModal) {
        avatarPickerModal.onclick = (e) => {
          if (e.target === avatarPickerModal) this.closeAvatarPicker();
        };
      }
      const settingsClose = document.getElementById('settings-close');
      if (settingsClose) settingsClose.onclick = () => this.closeSettingsModal();
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal) {
        settingsModal.onclick = (e) => {
          if (e.target === settingsModal) this.closeSettingsModal();
        };
      }
      document.addEventListener('click', (e) => {
        const settingsButton = e.target.closest('#profile-settings-btn, #btn-header-settings, #store-settings-shortcut, #leaderboard-settings-shortcut');
        if (!settingsButton) return;
        e.preventDefault();
        this.openSettingsModal();
      });
      const googleLogin = document.getElementById('btn-google-login');
      if (googleLogin) googleLogin.onclick = () => this.loginWithGoogle();
      const guestLogin = document.getElementById('btn-guest-login');
      if (guestLogin) guestLogin.onclick = () => this.loginAsGuest();
    
      document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pw = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');
        errEl.classList.add('hidden');
        const loginBtn = document.getElementById('btn-login');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span>Giriş yapılıyor...</span>';
        const res = await this.authManager.login(email, pw);
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span class="auth-login-badge" aria-hidden="true">♛</span><span>Giriş Yap</span>';
        if (res.success) {
          this.enterMainMenuAfterAuth();
          return;
        }
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
    },

    loginAsGuest() {
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.classList.add('hidden');
      this.authManager.startGuestSession(true);
      setTimeout(() => this.updateAdBannerState(), 700);
    },

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
    },

    closePasswordResetModal() {
      const modal = document.getElementById('password-reset-modal');
      if (modal) modal.classList.add('hidden');
    },

    setAuthStatus(id, message, success = false) {
      const status = document.getElementById(id);
      if (!status) return;
      status.textContent = message || '';
      status.classList.toggle('success', success);
      status.classList.toggle('hidden', !message);
    },

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
    },

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
  });
}
