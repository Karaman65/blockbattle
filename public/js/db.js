// ═══════════════════════════════════════════
//  BLOCK BATTLE — Database Manager (Firestore)
// ═══════════════════════════════════════════

class DatabaseManager {
  constructor() {}

  // ── Score & Stats ──

  async updateHighScore(uid, score, username, won = false) {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) return;
    const data = doc.data();

    const updates = {
      totalGames: firebase.firestore.FieldValue.increment(1),
    };

    if (won) {
      updates.totalWins = firebase.firestore.FieldValue.increment(1);
    }

    if (score > (data.highScore || 0)) {
      updates.highScore = score;
      // Also update leaderboard
      await db.collection('leaderboard').doc(uid).set({
        username: username,
        highScore: score,
        isPremium: data.isPremium === true, // Sync premium status
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await userRef.update(updates);
  }

  async syncPremiumToLeaderboard(uid, isPremium) {
    try {
      await db.collection('leaderboard').doc(uid).set({
        isPremium: isPremium
      }, { merge: true });
    } catch (e) { console.error(e); }
  }

  async recordOnlineMatch(matchData) {
    // matchData: { player1: {uid, username, score}, player2: {uid, username, score}, mode, winnerUid }
    try {
      const matchType = matchData.matchType === 'quick' ? 'quick' : 'room';
      const matchRef = matchData.roomId
        ? db.collection('matches').doc(`${matchType}_${matchData.roomId}`)
        : db.collection('matches').doc();
      await matchRef.set({
        ...matchData,
        matchType,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });

      const players = [matchData.player1, matchData.player2].filter(p => p && p.uid);
      await Promise.all(players.map(player => {
        const won = player.uid === matchData.winnerUid;
        const lost = matchData.winnerUid && !won;
        const update = {
          totalOnlineGames: firebase.firestore.FieldValue.increment(1),
        };
        if (matchType === 'quick') update.quickOnlineGames = firebase.firestore.FieldValue.increment(1);
        if (matchType === 'room') update.roomOnlineGames = firebase.firestore.FieldValue.increment(1);
        if (won) {
          update.totalWins = firebase.firestore.FieldValue.increment(1);
          if (matchType === 'quick') update.quickWins = firebase.firestore.FieldValue.increment(1);
          if (matchType === 'room') update.roomWins = firebase.firestore.FieldValue.increment(1);
        }
        if (lost) {
          if (matchType === 'quick') update.quickLosses = firebase.firestore.FieldValue.increment(1);
          if (matchType === 'room') update.roomLosses = firebase.firestore.FieldValue.increment(1);
        }
        return db.collection('users').doc(player.uid).update(update);
      }));
    } catch (err) {
      console.error('Failed to record match:', err);
    }
  }

  // ── Leaderboard ──

  async getLeaderboard(limit = 20) {
    try {
      const snap = await db.collection('leaderboard')
        .orderBy('highScore', 'desc')
        .limit(limit)
        .get();

      const results = [];
      snap.forEach((doc) => {
        results.push({ uid: doc.id, ...doc.data() });
      });
      return results;
    } catch (err) {
      console.error('Failed to get leaderboard:', err);
      return [];
    }
  }

  // ── Match History ──

  async getMatchHistory(uid, limit = 15) {
    try {
      // Get matches where user is player1 or player2
      const snap1 = await db.collection('matches')
        .where('player1.uid', '==', uid)
        .limit(limit * 3)
        .get();

      const snap2 = await db.collection('matches')
        .where('player2.uid', '==', uid)
        .limit(limit * 3)
        .get();

      const matches = [];
      snap1.forEach(doc => matches.push({ id: doc.id, ...doc.data() }));
      snap2.forEach(doc => matches.push({ id: doc.id, ...doc.data() }));

      // Sort by createdAt descending and limit
      matches.sort((a, b) => {
        const ta = a.createdAt ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });

      return matches
        .filter(match => match.matchType === 'quick' || match.matchType === 'room')
        .slice(0, limit);
    } catch (err) {
      console.error('Failed to get match history:', err);
      return [];
    }
  }

  // ── User Profile ──

  async getUserProfile(uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) return doc.data();
      return null;
    } catch (err) {
      console.error('Failed to get profile:', err);
      return null;
    }
  }
}
