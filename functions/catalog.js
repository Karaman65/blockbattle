/** Server-side economy catalog — must match client shop / rewards. */

const POWER_UP_PRICES = { bomb: 280, rotate: 150, skip: 220 };

const BUNDLES = {
  '600': { price: 600, items: { bomb: 1, rotate: 2, skip: 1 } },
  '1250': { price: 1250, items: { bomb: 3, rotate: 3, skip: 2 } },
  '1700': { price: 1700, items: { bomb: 4, rotate: 4, skip: 3 } },
  '1050': { price: 1050, items: { bomb: 1, rotate: 5, skip: 2 } },
};

const THEMES = {
  nebula: 800,
  lava: 950,
  matrix: 1100,
  toxic: 1400,
};

const COSMETICS = {
  bombEffect: {
    classic: 0,
    smoke: 1000,
    neon: 1450,
    frost: 1800,
  },
};

const IAP_PRODUCTS = {
  blockbattle_coins_500: { coins: 500, consumable: true },
  blockbattle_coins_1500: { coins: 1500, consumable: true },
  blockbattle_coins_5000: { coins: 5000, consumable: true },
  blockbattle_premium_lifetime: { premium: true, coins: 2000, consumable: false },
};

const QUEST_REWARDS = {
  d1: 80, d2: 120, d3: 100, d4: 160, d5: 140, d6: 130, d7: 90, d8: 110, d9: 180, d10: 200,
  w1: 350, w2: 420, w3: 450, w4: 480, w5: 500, w6: 520, w7: 560, w8: 620, w9: 700, w10: 760,
  m1: 1000, m2: 1200, m3: 1400, m4: 1500, m5: 1600, m6: 1700, m7: 1900, m8: 2200, m9: 2500, m10: 3000,
};

const DAILY_REWARDS = [100, 200, 300, 400, 500, 600, 700];

const COIN_GRANT_CAPS = {
  solo_game: 500,
  level_complete: 2000,
  online_win: 100,
  online_loss: 25,
  online_draw: 50,
};

const ANDROID_PACKAGE = 'com.blockbattle.app';

module.exports = {
  POWER_UP_PRICES,
  BUNDLES,
  THEMES,
  COSMETICS,
  IAP_PRODUCTS,
  QUEST_REWARDS,
  DAILY_REWARDS,
  COIN_GRANT_CAPS,
  ANDROID_PACKAGE,
};
