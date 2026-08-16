export function applyStorage(Game) {
  Object.assign(Game.prototype, {
    getAvatarStorageKey() {
      const userId = this.authManager?.user?.uid || this.authManager?.currentUser?.uid || 'guest';
      return `blockBattleAvatar:${userId}`;
    },

    getBoardBackgroundStorageKey() {
      const userId = this.authManager?.user?.uid || this.authManager?.currentUser?.uid || 'guest';
      return `blockBattleBoardBackground:${userId}`;
    },

    getLevelProgressKey() {
      const uid = this.authManager && this.authManager.user ? this.authManager.user.uid : 'guest';
      return `${this.levelProgressKey}:${uid}`;
    },

    getSavedUnlockedLevel() {
      const accountLevel = this.authManager && this.authManager.getUnlockedLevel ? this.authManager.getUnlockedLevel() : 1;
      const deviceLevel = parseInt(localStorage.getItem(this.getLevelProgressKey()) || '1', 10);
      return Math.max(1, Math.min(this.levels.length + 1, Math.max(accountLevel, deviceLevel)));
    },

    async saveUnlockedLevel(level) {
      if (this.isGuestSession()) return;
      const safeLevel = Math.max(1, Math.min(this.levels.length + 1, level));
      this.unlockedLevel = safeLevel;
      localStorage.setItem(this.getLevelProgressKey(), String(safeLevel));
      if (this.authManager && this.authManager.setUnlockedLevel) {
        await this.authManager.setUnlockedLevel(safeLevel);
      }
    },

    getLocalDateKey(offsetDays = 0) {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },

    getDailyRewardKey() {
      const uid = this.authManager && this.authManager.user ? this.authManager.user.uid : 'guest';
      return `blockBattleDailyReward:${uid}`;
    },

    getDailyRewardState() {
      try {
        const raw = JSON.parse(localStorage.getItem(this.getDailyRewardKey()) || '{}');
        return {
          streak: Math.min(Math.max(parseInt(raw.streak || '0', 10), 0), this.dailyRewards.length - 1),
          lastClaimIndex: Math.min(Math.max(parseInt(raw.lastClaimIndex || '0', 10), 0), this.dailyRewards.length - 1),
          lastClaimDate: typeof raw.lastClaimDate === 'string' ? raw.lastClaimDate : ''
        };
      } catch (err) {
        return { streak: 0, lastClaimIndex: 0, lastClaimDate: '' };
      }
    },

    saveDailyRewardState(state) {
      localStorage.setItem(this.getDailyRewardKey(), JSON.stringify(state));
    },

    getTodayDailyRewardState() {
      const state = this.getDailyRewardState();
      const today = this.getLocalDateKey();
      const yesterday = this.getLocalDateKey(-1);
      const claimedToday = state.lastClaimDate === today;
      const streak = state.lastClaimDate && state.lastClaimDate !== today && state.lastClaimDate !== yesterday
        ? 0
        : state.streak;
      return { ...state, today, claimedToday, streak };
    }
  });
}
