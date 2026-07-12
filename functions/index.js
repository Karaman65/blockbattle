const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const crypto = require('crypto');
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

function usernameKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9ğüşöçı_-]+/giu, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUsername(value) {
  const username = String(value || '').trim();
  if (!/^[\p{L}\p{N}_-]{3,16}$/u.test(username)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Kullanıcı adı 3-16 karakter olmalı ve yalnızca harf, rakam, _ veya - içermeli.'
    );
  }
  return username;
}

function istanbulDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function periodKeys() {
  const now = new Date();
  const date = istanbulDate();
  const month = date.slice(0, 7);
  const local = new Date(`${date}T12:00:00+03:00`);
  const day = (local.getUTCDay() + 6) % 7;
  const thursday = new Date(local);
  thursday.setUTCDate(local.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((thursday - firstThursday) / 604800000);
  return { daily: date, weekly: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monthly: month, now };
}

function nextPeriodStat(current, key, score, won) {
  const base = current && current.key === key
    ? current
    : { key, totalGames: 0, totalWins: 0, highScore: 0 };
  return {
    key,
    totalGames: Math.max(0, Number(base.totalGames) || 0) + 1,
    totalWins: Math.max(0, Number(base.totalWins) || 0) + (won ? 1 : 0),
    highScore: Math.max(Number(base.highScore) || 0, score),
  };
}

function levelTarget(levelId) {
  const baseTargets = [120, 220, 340, 480, 650, 850, 1100, 1400, 1750, 2200];
  if (levelId <= baseTargets.length) return baseTargets[levelId - 1];
  const extra = Math.max(0, levelId - 10);
  return Math.round(2200 + extra * 170 + Math.pow(extra, 1.35) * 45);
}

function questProgress(user, questId, period) {
  const stats = user.periodStats?.[period] || {};
  const inventory = user.inventory || {};
  const powerUps = Number(inventory.bomb || 0) + Number(inventory.rotate || 0) + Number(inventory.skip || 0);
  const metric = {
    highScore: Number(stats.highScore || 0),
    totalGames: Number(stats.totalGames || 0),
    totalWins: Number(stats.totalWins || 0),
    unlockedLevel: Number(user.unlockedLevel || 1),
    coins: Number(user.coins || 0),
    powerUps,
  };
  const requirement = catalog.QUEST_REQUIREMENTS[questId];
  return !!requirement && metric[requirement.metric] >= requirement.target;
}

function verifyMatchTicket(ticket) {
  const secret = process.env.MATCH_TICKET_SECRET || '';
  if (secret.length < 32) {
    throw new functions.https.HttpsError('failed-precondition', 'Online sonuç doğrulaması yapılandırılmamış.');
  }
  if (typeof ticket !== 'string' || ticket.length > 10000) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz maç bileti.');
  }
  const [encoded, signature, extra] = ticket.split('.');
  if (!encoded || !signature || extra) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz maç bileti.');
  }
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new functions.https.HttpsError('permission-denied', 'Maç bileti doğrulanamadı.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch (err) {
    throw new functions.https.HttpsError('invalid-argument', 'Maç bileti okunamadı.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.v !== 1 || payload.exp < now || payload.iat > now + 60 || payload.iat < now - 600) {
    throw new functions.https.HttpsError('permission-denied', 'Maç biletinin süresi dolmuş.');
  }
  if (!['win', 'loss', 'draw'].includes(payload.result)
      || !['score', 'time'].includes(payload.mode)
      || !['quick', 'room'].includes(payload.matchType)
      || !Array.isArray(payload.players)
      || payload.players.length !== 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Maç bileti içeriği geçersiz.');
  }
  return payload;
}

async function syncLeaderboard(uid, username, highScore, isPremium) {
  await leaderboardRef(uid).set({
    username: username || 'Oyuncu',
    highScore: highScore || 0,
    isPremium: isPremium === true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** Create the authenticated user's profile with server-owned initial values. */
exports.createProfile = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const username = normalizeUsername(data?.username || context.auth.token.name || `Oyuncu${uid.slice(0, 4)}`);
  const key = usernameKey(username);
  const email = String(context.auth.token.email || '').slice(0, 254);
  const ref = userRef(uid);
  const nameRef = db.collection('usernames').doc(key);

  const result = await db.runTransaction(async (tx) => {
    const [existingUser, existingName] = await Promise.all([tx.get(ref), tx.get(nameRef)]);
    if (existingUser.exists) return { created: false, user: existingUser.data() };
    if (existingName.exists && existingName.data()?.uid !== uid) {
      throw new functions.https.HttpsError('already-exists', 'Bu kullanıcı adı alınmış.');
    }
    const profile = {
      username,
      email,
      highScore: 0,
      coins: 500,
      unlockedLevel: 1,
      completedLevels: [],
      inventory: { bomb: 2, rotate: 5, skip: 2 },
      totalGames: 0,
      totalWins: 0,
      totalOnlineGames: 0,
      quickOnlineGames: 0,
      quickWins: 0,
      quickLosses: 0,
      quickDraws: 0,
      ownedThemes: ['default'],
      ownedCosmetics: { bombEffect: ['classic'] },
      claimedQuests: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    tx.create(ref, profile);
    tx.create(nameRef, {
      uid, username, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(leaderboardRef(uid), {
      username, highScore: 0, isPremium: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { created: true, user: profile };
  });
  return { ok: true, ...result };
});

/** Issue a one-use server game session before solo/level gameplay starts. */
exports.economyStartGame = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const mode = data?.mode === 'level' ? 'level' : data?.mode === 'solo' ? 'solo' : '';
  if (!mode) throw new functions.https.HttpsError('invalid-argument', 'Geçersiz oyun modu.');
  const levelId = mode === 'level'
    ? Math.min(Math.max(Math.trunc(Number(data?.levelId) || 1), 1), 50)
    : 0;
  const user = await userRef(uid).get();
  if (!user.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
  if (mode === 'level' && levelId > Number(user.data().unlockedLevel || 1)) {
    throw new functions.https.HttpsError('permission-denied', 'Bu bölüm henüz açık değil.');
  }
  const session = db.collection('gameSessions').doc();
  const startDate = istanbulDate();
  await db.runTransaction(async tx => {
    const freshUser = await tx.get(userRef(uid));
    const profile = freshUser.data() || {};
    const starts = profile.gameStartDate === startDate ? Number(profile.gameStartsToday || 0) : 0;
    if (starts >= 50) {
      throw new functions.https.HttpsError('resource-exhausted', 'Günlük oyun oturumu sınırına ulaşıldı.');
    }
    tx.update(userRef(uid), { gameStartDate: startDate, gameStartsToday: starts + 1 });
    tx.create(session, {
      uid, mode, levelId, status: 'active',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000),
    });
  });
  return { ok: true, gameId: session.id };
});

/** Finish a one-use session; score, stats, level progression and reward are committed atomically. */
exports.economyFinishGame = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const gameId = String(data?.gameId || '');
  const score = Math.min(Math.max(Math.trunc(Number(data?.score) || 0), 0), 50000);
  const claimedWin = data?.won === true;
  if (!/^[A-Za-z0-9]{10,40}$/.test(gameId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz oyun oturumu.');
  }
  const sessionRef = db.collection('gameSessions').doc(gameId);
  const ref = userRef(uid);
  const keys = periodKeys();
  const result = await db.runTransaction(async (tx) => {
    const [sessionDoc, userDoc] = await Promise.all([tx.get(sessionRef), tx.get(ref)]);
    if (!sessionDoc.exists || !userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Oyun oturumu veya profil bulunamadı.');
    }
    const session = sessionDoc.data();
    const user = userDoc.data();
    if (session.uid !== uid || session.status !== 'active') {
      throw new functions.https.HttpsError('failed-precondition', 'Oyun oturumu daha önce kullanılmış.');
    }
    const startedAt = session.startedAt?.toMillis?.() || 0;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (!startedAt || elapsedSeconds < 5 || elapsedSeconds > 21600) {
      throw new functions.https.HttpsError('failed-precondition', 'Oyun süresi doğrulanamadı.');
    }
    const maximumPlausibleScore = Math.min(50000, elapsedSeconds * 20 + 100);
    if (score > maximumPlausibleScore) {
      throw new functions.https.HttpsError('failed-precondition', 'Skor doğrulanamadı.');
    }
    const won = session.mode === 'level'
      ? score >= levelTarget(Number(session.levelId || 1))
      : false;
    if (claimedWin !== won) {
      throw new functions.https.HttpsError('failed-precondition', 'Oyun sonucu doğrulanamadı.');
    }

    const completedLevels = Array.isArray(user.completedLevels) ? user.completedLevels : [];
    let reward = Math.min(Math.floor(score / 10), 500);
    let unlockedLevel = Number(user.unlockedLevel || 1);
    let nextCompletedLevels = completedLevels;
    if (session.mode === 'level') {
      const levelId = Number(session.levelId || 1);
      if (!won || levelId > unlockedLevel) {
        throw new functions.https.HttpsError('failed-precondition', 'Bölüm sonucu doğrulanamadı.');
      }
      if (completedLevels.includes(levelId)) reward = 0;
      else {
        reward = Math.min(75 + levelId * 25, 1325);
        nextCompletedLevels = [...completedLevels, levelId].slice(-50);
      }
      unlockedLevel = Math.max(unlockedLevel, Math.min(levelId + 1, 50));
    }

    const dailyDate = keys.daily;
    const alreadyEarned = user.dailyEarnDate === dailyDate ? Number(user.dailyEarnedCoins || 0) : 0;
    reward = Math.max(0, Math.min(reward, 1000 - alreadyEarned));
    const update = {
      coins: admin.firestore.FieldValue.increment(reward),
      totalGames: admin.firestore.FieldValue.increment(1),
      dailyEarnDate: dailyDate,
      dailyEarnedCoins: alreadyEarned + reward,
      unlockedLevel,
      completedLevels: nextCompletedLevels,
      periodStats: {
        daily: nextPeriodStat(user.periodStats?.daily, keys.daily, score, won),
        weekly: nextPeriodStat(user.periodStats?.weekly, keys.weekly, score, won),
        monthly: nextPeriodStat(user.periodStats?.monthly, keys.monthly, score, won),
      },
    };
    if (won) update.totalWins = admin.firestore.FieldValue.increment(1);
    if (score > Number(user.highScore || 0)) update.highScore = score;
    tx.update(ref, update);
    tx.update(sessionRef, {
      status: 'finished', score, won, reward,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      score: Math.max(score, Number(user.highScore || 0)),
      coins: Number(user.coins || 0) + reward,
      reward,
      unlockedLevel,
      username: user.username || 'Oyuncu',
      isPremium: user.isPremium === true,
    };
  });
  if (result.score > 0) await syncLeaderboard(uid, result.username, result.score, result.isPremium);
  return { ok: true, ...result };
});

/** Claim quest reward (idempotent per period). */
exports.economyClaimQuest = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const questId = String(data?.questId || '');
  const reward = catalog.QUEST_REWARDS[questId];
  const period = questId.startsWith('d') ? 'daily' : questId.startsWith('w') ? 'weekly' : questId.startsWith('m') ? 'monthly' : '';
  const periodKey = period ? periodKeys()[period] : '';
  if (!reward || !periodKey || !catalog.QUEST_REQUIREMENTS[questId]) {
    throw new functions.https.HttpsError('invalid-argument', 'Geçersiz görev.');
  }

  const ref = userRef(uid);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    if (!questProgress(doc.data(), questId, period)) {
      throw new functions.https.HttpsError('failed-precondition', 'Görev henüz tamamlanmadı.');
    }
    const claimed = doc.data().claimedQuests || {};
    const list = claimed[periodKey] || [];
    if (list.includes(questId)) {
      return { ok: true, alreadyClaimed: true, coins: doc.data().coins || 0 };
    }
    const recentKeys = Object.keys(claimed).sort().slice(-39);
    const next = Object.fromEntries(recentKeys.map(key => [key, claimed[key]]));
    next[periodKey] = [...list, questId];
    tx.update(ref, {
      claimedQuests: next,
      coins: admin.firestore.FieldValue.increment(reward),
    });
    return { ok: true, alreadyClaimed: false, granted: reward, coins: (doc.data().coins || 0) + reward };
  });
  return { ...result, periodKey };
});

/** Claim daily reward (server tracks streak / date). */
exports.economyClaimDaily = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const today = istanbulDate();
  const yesterday = istanbulDate(-1);

  const ref = userRef(uid);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const d = doc.data();
    if (d.dailyRewardLastClaim === today) {
      return { ok: true, alreadyClaimed: true, coins: d.coins || 0 };
    }
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

/** Claim a signed online result generated only by the authenticated game server. */
exports.economyClaimOnlineMatch = functions.runWith({
  secrets: ['MATCH_TICKET_SECRET'],
}).https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const payload = verifyMatchTicket(data?.ticket);
  if (payload.uid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Bu maç bileti başka bir hesaba ait.');
  }
  const player = payload.players.find(item => item && item.uid === uid);
  if (!player) throw new functions.https.HttpsError('permission-denied', 'Oyuncu maçta bulunamadı.');
  const score = Math.min(Math.max(Math.trunc(Number(player.score) || 0), 0), 50000);
  const rewardByResult = { win: 100, draw: 50, loss: 25 };
  const claimRef = db.collection('onlineMatchClaims').doc(`${payload.matchId}_${uid}`);
  const matchRef = db.collection('matches').doc(payload.matchId);
  const ref = userRef(uid);
  const today = istanbulDate();
  const keys = periodKeys();

  const result = await db.runTransaction(async tx => {
    const [claim, userDoc, matchDoc] = await Promise.all([
      tx.get(claimRef), tx.get(ref), tx.get(matchRef),
    ]);
    if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    if (claim.exists) return { ok: true, duplicate: true, reward: 0, coins: userDoc.data().coins || 0 };
    const user = userDoc.data();
    const alreadyEarned = user.dailyEarnDate === today ? Number(user.dailyEarnedCoins || 0) : 0;
    const reward = Math.max(0, Math.min(rewardByResult[payload.result], 1000 - alreadyEarned));
    const update = {
      coins: admin.firestore.FieldValue.increment(reward),
      totalGames: admin.firestore.FieldValue.increment(1),
      totalOnlineGames: admin.firestore.FieldValue.increment(1),
      dailyEarnDate: today,
      dailyEarnedCoins: alreadyEarned + reward,
      periodStats: {
        daily: nextPeriodStat(user.periodStats?.daily, keys.daily, score, payload.result === 'win'),
        weekly: nextPeriodStat(user.periodStats?.weekly, keys.weekly, score, payload.result === 'win'),
        monthly: nextPeriodStat(user.periodStats?.monthly, keys.monthly, score, payload.result === 'win'),
      },
    };
    if (payload.result === 'win') update.totalWins = admin.firestore.FieldValue.increment(1);
    if (payload.matchType === 'quick') {
      update.quickOnlineGames = admin.firestore.FieldValue.increment(1);
      if (payload.result === 'win') update.quickWins = admin.firestore.FieldValue.increment(1);
      else if (payload.result === 'draw') update.quickDraws = admin.firestore.FieldValue.increment(1);
      else update.quickLosses = admin.firestore.FieldValue.increment(1);
    }
    tx.update(ref, update);
    tx.create(claimRef, {
      uid, matchId: payload.matchId, result: payload.result,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (!matchDoc.exists) {
      const players = payload.players.map(item => ({
        uid: String(item.uid || ''),
        username: String(item.username || 'Oyuncu').slice(0, 16),
        score: Math.min(Math.max(Math.trunc(Number(item.score) || 0), 0), 50000),
      }));
      tx.create(matchRef, {
        player1: players[0], player2: players[1],
        mode: payload.mode, roomId: String(payload.roomId || '').slice(0, 12),
        winnerUid: payload.winnerUid || null,
        matchType: payload.matchType,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return { ok: true, duplicate: false, reward, coins: Number(user.coins || 0) + reward };
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

/** Old client-controlled progression endpoints are intentionally disabled. */
exports.economyGrantCoins = functions.https.onCall((data, context) => {
  requireAuth(context);
  throw new functions.https.HttpsError('failed-precondition', 'Uygulamayı güncelleyin.');
});
exports.economyUnlockLevel = functions.https.onCall((data, context) => {
  requireAuth(context);
  throw new functions.https.HttpsError('failed-precondition', 'Uygulamayı güncelleyin.');
});
exports.economyRecordGame = functions.https.onCall((data, context) => {
  requireAuth(context);
  throw new functions.https.HttpsError('failed-precondition', 'Uygulamayı güncelleyin.');
});
exports.resolveLoginEmail = functions.https.onCall(() => {
  throw new functions.https.HttpsError('permission-denied', 'E-posta ile giriş yapın.');
});

/** Delete all directly associated account data, then remove the Auth account. */
exports.deleteAccountData = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const ref = userRef(uid);
  const [feedback, sessions, matchesAsP1, matchesAsP2, purchases, matchClaims, usernameDocs] = await Promise.all([
    db.collection('feedback').where('uid', '==', uid).limit(400).get(),
    db.collection('gameSessions').where('uid', '==', uid).limit(400).get(),
    db.collection('matches').where('player1.uid', '==', uid).limit(400).get(),
    db.collection('matches').where('player2.uid', '==', uid).limit(400).get(),
    db.collection('verifiedPurchases').where('uid', '==', uid).limit(400).get(),
    db.collection('onlineMatchClaims').where('uid', '==', uid).limit(400).get(),
    db.collection('usernames').where('uid', '==', uid).limit(20).get(),
  ]);
  const writer = db.bulkWriter();
  writer.delete(ref);
  writer.delete(leaderboardRef(uid));
  usernameDocs.forEach(doc => writer.delete(doc.ref));
  feedback.forEach(doc => writer.delete(doc.ref));
  sessions.forEach(doc => writer.delete(doc.ref));
  matchesAsP1.forEach(doc => writer.delete(doc.ref));
  matchesAsP2.forEach(doc => writer.delete(doc.ref));
  matchClaims.forEach(doc => writer.delete(doc.ref));
  // Keep the token hash as an anti-replay record, but remove its account association.
  purchases.forEach(doc => writer.update(doc.ref, { uid: null, accountDeleted: true }));
  await writer.close();
  await admin.auth().deleteUser(uid);
  return { ok: true };
});

/** Verify Google Play purchase and grant premium/coins. */
exports.verifyPlayPurchase = functions.runWith({
  secrets: ['PLAY_SERVICE_ACCOUNT_JSON'],
}).https.onCall(async (data, context) => {
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
  const tokenHash = crypto.createHash('sha256').update(purchaseToken).digest('hex');
  const purchaseRef = db.collection('verifiedPurchases').doc(tokenHash);

  const result = await db.runTransaction(async (tx) => {
    const [doc, purchaseDoc] = await Promise.all([tx.get(ref), tx.get(purchaseRef)]);
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Profil bulunamadı.');
    const d = doc.data();
    if (purchaseDoc.exists) {
      return { ok: true, duplicate: true, isPremium: d.isPremium === true };
    }

    const update = {};

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
    tx.create(purchaseRef, {
      uid,
      productId,
      packageName: catalog.ANDROID_PACKAGE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const username = d.username || 'Oyuncu';
    const highScore = d.highScore || 0;
    return {
      ok: true,
      duplicate: false,
      isPremium: d.isPremium === true || config.premium === true,
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
