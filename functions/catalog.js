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

const QUEST_REQUIREMENTS = {
  d1: { metric: 'highScore', target: 150 }, d2: { metric: 'highScore', target: 300 },
  d3: { metric: 'totalGames', target: 2 }, d4: { metric: 'totalGames', target: 5 },
  d5: { metric: 'totalWins', target: 1 }, d6: { metric: 'unlockedLevel', target: 2 },
  d7: { metric: 'coins', target: 500 }, d8: { metric: 'powerUps', target: 3 },
  d9: { metric: 'highScore', target: 500 }, d10: { metric: 'unlockedLevel', target: 3 },
  w1: { metric: 'totalGames', target: 10 }, w2: { metric: 'totalWins', target: 3 },
  w3: { metric: 'highScore', target: 1000 }, w4: { metric: 'unlockedLevel', target: 4 },
  w5: { metric: 'coins', target: 1500 }, w6: { metric: 'powerUps', target: 8 },
  w7: { metric: 'totalGames', target: 15 }, w8: { metric: 'highScore', target: 1500 },
  w9: { metric: 'unlockedLevel', target: 6 }, w10: { metric: 'totalWins', target: 6 },
  m1: { metric: 'totalGames', target: 30 }, m2: { metric: 'totalWins', target: 10 },
  m3: { metric: 'highScore', target: 2500 }, m4: { metric: 'unlockedLevel', target: 8 },
  m5: { metric: 'coins', target: 4000 }, m6: { metric: 'powerUps', target: 20 },
  m7: { metric: 'totalGames', target: 50 }, m8: { metric: 'highScore', target: 4000 },
  m9: { metric: 'unlockedLevel', target: 10 }, m10: { metric: 'totalWins', target: 25 },
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
  QUEST_REQUIREMENTS,
  DAILY_REWARDS,
  COIN_GRANT_CAPS,
  ANDROID_PACKAGE,
};
