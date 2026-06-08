const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const catalog = require('./catalog');

admin.initializeApp();
const db = admin.firestore();

function requireAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Giriş gerekli.');
  }
  return context.auth.uid;
}

function userRef(uid) {
  return db.collection('users').doc(uid);
}

function leaderboardRef(uid) {
  return db.collection('leaderboard').doc(uid);
}

async function syncLeaderboard(uid, username, highScore, isPremium) {
  await leaderboardRef(uid).set({
    username: username || 'Oyuncu',
    highScore: highScore || 0,
    isPremium: isPremium === true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** Grant coins with server-enforced caps (solo, online, level rewards). */
exports.economyGrantCoins = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const reason = String(data?.reason || '');
  let amount = Math.trunc(Number(data?.amount) || 0);
  if (amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz miktar.');
  }

  const cap = catalog.COIN_GRANT_CAPS[reason];
  if (cap != null) {
    amount = Math.min(amount, cap);
  } else if (reason === 'level_complete') {
    const levelId = Math.min(Math.max(Math.trunc(Number(data?.levelId) || 1), 1), 50);
    amount = Math.min(amount, 75 + levelId * 25);
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz ödül nedeni.');
  }

  await userRef(uid).update({
    coins: admin.firestore.FieldValue.increment(amount),
  });
  const snap = await userRef(uid).get();
  return { ok: true, coins: (snap.data() && snap.data().coins) || 0, granted: amount };
});

/** Claim quest reward (idempotent per period). */
exports.economyClaimQuest = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const questId = String(data?.questId || '');
  const periodKey = String(data?.periodKey || '');
  const reward = catalog.QUEST_REWARDS[questId];
  if (!reward || !periodKey || periodKey.length > 120) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz görev.');
  }

  const ref = userRef(uid);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const claimed = doc.data().claimedQuests || {};
    const list = claimed[periodKey] || [];
    if (list.includes(questId)) {
      return { ok: true, alreadyClaimed: true, coins: doc.data().coins || 0 };
    }
    const next = { ...claimed, [periodKey]: [...list, questId] };
    tx.update(ref, {
      claimedQuests: next,
      coins: admin.firestore.FieldValue.increment(reward),
    });
    return { ok: true, alreadyClaimed: false, granted: reward, coins: (doc.data().coins || 0) + reward };
  });
  return result;
});

/** Claim daily reward (server tracks streak / date). */
exports.economyClaimDaily = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const today = String(data?.today || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz tarih.');
  }

  const ref = userRef(uid);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const d = doc.data();
    if (d.dailyRewardLastClaim === today) {
      return { ok: true, alreadyClaimed: true, coins: d.coins || 0 };
    }
    const yesterday = data?.yesterday || '';
    let streak = typeof d.dailyRewardStreak === 'number' ? d.dailyRewardStreak : 0;
    if (d.dailyRewardLastClaim && d.dailyRewardLastClaim !== today && d.dailyRewardLastClaim !== yesterday) {
      streak = 0;
    }
    const reward = catalog.DAILY_REWARDS[Math.min(streak, catalog.DAILY_REWARDS.length - 1)];
    const nextStreak = streak >= catalog.DAILY_REWARDS.length - 1 ? 0 : streak + 1;
    tx.update(ref, {
      coins: admin.firestore.FieldValue.increment(reward),
      dailyRewardLastClaim: today,
      dailyRewardStreak: nextStreak,
      dailyRewardLastIndex: streak,
    });
    return { ok: true, granted: reward, streak, nextStreak, coins: (d.coins || 0) + reward };
  });
  return result;
});

/** In-game shop spend (power-up, bundle, theme, cosmetic). */
exports.economySpendShop = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const action = String(data?.action || '');
  const ref = userRef(uid);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const d = doc.data();
    const coins = d.coins || 0;
    const inv = d.inventory || { bomb: 0, rotate: 0, skip: 0 };
    const ownedThemes = d.ownedThemes || ['default'];
    const ownedCosmetics = d.ownedCosmetics || { bombEffect: ['classic'] };
    const update = {};

    if (action === 'powerUp') {
      const type = String(data?.type || '');
      const price = catalog.POWER_UP_PRICES[type];
      if (!price || coins < price) throw new functions.https.HttpsError('failed-precondition', 'Yetersiz coin.');
      update.coins = admin.firestore.FieldValue.increment(-price);
      update[`inventory.${type}`] = admin.firestore.FieldValue.increment(1);
    } else if (action === 'bundle') {
      const key = String(data?.bundleKey || '');
      const bundle = catalog.BUNDLES[key];
      if (!bundle || coins < bundle.price) throw new functions.https.HttpsError('failed-precondition', 'Yetersiz coin.');
      update.coins = admin.firestore.FieldValue.increment(-bundle.price);
      for (const [type, count] of Object.entries(bundle.items)) {
        if (count > 0) update[`inventory.${type}`] = admin.firestore.FieldValue.increment(count);
      }
    } else if (action === 'theme') {
      const themeId = String(data?.themeId || '');
      const price = catalog.THEMES[themeId];
      if (price == null) throw new functions.https.HttpsError('invalid-argument', 'Geçersiz tema.');
      if (ownedThemes.includes(themeId)) return;
      if (coins < price) throw new functions.https.HttpsError('failed-precondition', 'Yetersiz coin.');
      update.coins = admin.firestore.FieldValue.increment(-price);
      update.ownedThemes = admin.firestore.FieldValue.arrayUnion(themeId);
    } else if (action === 'cosmetic') {
      const category = String(data?.category || '');
      const cosmeticId = String(data?.cosmeticId || '');
      const cat = catalog.COSMETICS[category];
      if (!cat) throw new functions.https.HttpsError('invalid-argument', 'Geçersiz kozmetik.');
      const price = cat[cosmeticId];
      if (price == null) throw new functions.https.HttpsError('invalid-argument', 'Geçersiz kozmetik.');
      const owned = ownedCosmetics[category] || ['classic'];
      if (owned.includes(cosmeticId)) return;
      if (coins < price) throw new functions.https.HttpsError('failed-precondition', 'Yetersiz coin.');
      if (price > 0) update.coins = admin.firestore.FieldValue.increment(-price);
      update[`ownedCosmetics.${category}`] = admin.firestore.FieldValue.arrayUnion(cosmeticId);
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Geçersiz işlem.');
    }
    tx.update(ref, update);
  });

  const snap = await ref.get();
  return { ok: true, user: snap.data() };
});

/** Use one power-up from inventory. */
exports.economyUsePowerUp = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const type = String(data?.type || '');
  if (!['bomb', 'rotate', 'skip'].includes(type)) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz güçlendirici.');
  }
  const ref = userRef(uid);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const count = (doc.data()?.inventory?.[type]) || 0;
    if (count <= 0) throw new functions.https.HttpsError('failed-precondition', 'Envanterde yok.');
    tx.update(ref, { [`inventory.${type}`]: admin.firestore.FieldValue.increment(-1) });
  });
  return { ok: true };
});

/** Unlock level progression. */
exports.economyUnlockLevel = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const level = Math.min(Math.max(Math.trunc(Number(data?.level) || 1), 1), 50);
  const ref = userRef(uid);
  const doc = await ref.get();
  const current = doc.data()?.unlockedLevel || 1;
  if (level <= current) return { ok: true, unlockedLevel: current };
  await ref.update({ unlockedLevel: level });
  return { ok: true, unlockedLevel: level };
});

/** Record game stats + optional high score. */
exports.economyRecordGame = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const score = Math.min(Math.max(Math.trunc(Number(data?.score) || 0), 0), 50000);
  const won = data?.won === true;
  const recordHighScore = data?.recordHighScore !== false;
  const username = String(data?.username || 'Oyuncu').slice(0, 24);

  const ref = userRef(uid);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const d = doc.data();
    const update = {
      totalGames: admin.firestore.FieldValue.increment(1),
    };
    if (won) update.totalWins = admin.firestore.FieldValue.increment(1);

    if (recordHighScore && score > (d.highScore || 0)) {
      update.highScore = score;
    }

    if (data?.onlineStats) {
      update.totalOnlineGames = admin.firestore.FieldValue.increment(1);
      if (data.matchType === 'quick') {
        update.quickOnlineGames = admin.firestore.FieldValue.increment(1);
        if (won) update.quickWins = admin.firestore.FieldValue.increment(1);
        else if (data?.draw) update.quickDraws = admin.firestore.FieldValue.increment(1);
        else if (data?.lost) update.quickLosses = admin.firestore.FieldValue.increment(1);
      }
    }

    tx.update(ref, update);
    const newHigh = recordHighScore && score > (d.highScore || 0) ? score : (d.highScore || 0);
    return {
      highScore: newHigh,
      isPremium: d.isPremium === true,
      username: d.username || username,
    };
  });

  if (result.highScore > 0) {
    await syncLeaderboard(uid, result.username, result.highScore, result.isPremium);
  }
  return { ok: true, highScore: result.highScore };
});

/** Verify Google Play purchase and grant premium/coins. */
exports.verifyPlayPurchase = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const productId = String(data?.productId || '');
  const purchaseToken = String(data?.purchaseToken || '');
  const config = catalog.IAP_PRODUCTS[productId];

  if (!config || !purchaseToken) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz satın alma.');
  }

  const verified = await verifyPurchaseWithPlay(productId, purchaseToken, config.consumable);
  if (!verified) {
    throw new functions.https.HttpsError('failed-precondition', 'Satın alma doğrulanamadı.');
  }

  const ref = userRef(uid);
  const purchaseKey = `${productId}:${purchaseToken.slice(0, 48)}`;

  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const d = doc.data();
    const fulfilled = d.fulfilledPurchases || [];
    if (fulfilled.includes(purchaseKey)) {
      return { ok: true, duplicate: true, isPremium: d.isPremium === true };
    }

    const update = {
      fulfilledPurchases: admin.firestore.FieldValue.arrayUnion(purchaseKey),
    };

    if (config.premium) {
      const bonusAlready = d.premiumBonusGranted === true;
      update.isPremium = true;
      update.premiumBonusGranted = true;
      if (!d.premiumPurchasedAt) {
        update.premiumPurchasedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      if (!bonusAlready && config.coins > 0) {
        update.coins = admin.firestore.FieldValue.increment(config.coins);
      }
    } else if (config.coins > 0) {
      update.coins = admin.firestore.FieldValue.increment(config.coins);
    }

    tx.update(ref, update);
    const username = d.username || 'Oyuncu';
    const highScore = d.highScore || 0;
    return {
      ok: true,
      duplicate: false,
      isPremium: true,
      coinsGranted: config.premium && !d.premiumBonusGranted ? config.coins : (config.coins || 0),
      username,
      highScore,
    };
  });

  if (result.isPremium || config.premium) {
    const snap = await ref.get();
    await syncLeaderboard(uid, snap.data()?.username || result.username, snap.data()?.highScore || 0, true);
  }

  return result;
});

async function verifyPurchaseWithPlay(productId, purchaseToken, consumable) {
  const serviceAccountJson = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    functions.logger.warn('PLAY_SERVICE_ACCOUNT_JSON missing — IAP verification skipped (dev only).');
    if (process.env.FUNCTIONS_EMULATOR === 'true') return true;
    return false;
  }

  try {
    const credentials = JSON.parse(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const androidpublisher = google.androidpublisher({ version: 'v3', auth });
    const packageName = catalog.ANDROID_PACKAGE;

    if (consumable) {
      const res = await androidpublisher.purchases.products.get({
        packageName,
        productId,
        token: purchaseToken,
      });
      return res.data && Number(res.data.purchaseState) === 0;
    }

    const res = await androidpublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });
    return res.data && Number(res.data.purchaseState) === 0;
  } catch (err) {
    functions.logger.error('Play verify failed', err);
    return false;
  }
}
