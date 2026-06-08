// Shared coin display + player header updates (visible screen only).

const COIN_ELEMENT_IDS = [
  'menu-coins', 'store-coins', 'map-coins', 'online-coins',
  'leaderboard-coins', 'quests-coins', 'drawer-coins',
];

const UiHeader = {
  updateCoins(coins, activeScreenId) {
    const value = String(coins);
    const localeValue = Number(coins).toLocaleString('tr-TR');
    COIN_ELEMENT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'map-coins' || id === 'online-coins' || id === 'leaderboard-coins' || id === 'quests-coins') {
        el.textContent = localeValue;
      } else {
        el.textContent = value;
      }
    });
  },

  getActiveScreenId() {
    const visible = document.querySelector('.screen.active');
    return visible ? visible.id : null;
  },
};
