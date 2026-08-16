export function applyAudio(Game) {
  Object.assign(Game.prototype, {
    isVibrationEnabled() {
      return localStorage.getItem('blockBattleVibration') !== '0';
    },

    isSoundEnabled() {
      return localStorage.getItem('blockBattleSound') !== '0';
    },

    isMusicEnabled() {
      return localStorage.getItem('blockBattleMusic') === '1';
    },

    isNotificationsEnabled() {
      return localStorage.getItem('blockBattleNotifications') === '1'
        && 'Notification' in window
        && Notification.permission === 'granted';
    },

    toggleVibration() {
      const enabled = !this.isVibrationEnabled();
      localStorage.setItem('blockBattleVibration', enabled ? '1' : '0');
      this.updateVibrationButton();
      if (enabled && navigator.vibrate) navigator.vibrate(30);
    },

    vibrate(pattern = 18) {
      if (!this.isVibrationEnabled()) return;
      if (!navigator.vibrate) return;
      navigator.vibrate(pattern);
    },

    async toggleNotifications() {
      if (!('Notification' in window)) {
        localStorage.setItem('blockBattleNotifications', '0');
        this.updateSettingsButtons();
        return;
      }
    
      if (this.isNotificationsEnabled()) {
        localStorage.setItem('blockBattleNotifications', '0');
        this.updateSettingsButtons();
        return;
      }
    
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      const enabled = permission === 'granted';
      localStorage.setItem('blockBattleNotifications', enabled ? '1' : '0');
      this.updateSettingsButtons();
      if (enabled) this.sendLocalNotification('Block Battle', 'Bildirimler açıldı.');
    },

    sendLocalNotification(title, body) {
      if (!this.isNotificationsEnabled()) return;
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready
            .then(reg => reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }))
            .catch(() => new Notification(title, { body }));
          return;
        }
        new Notification(title, { body });
      } catch (err) {
        console.warn('Notification failed', err);
      }
    }
  });
}
