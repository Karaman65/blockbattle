// ═══════════════════════════════════════════
//  BLOCK BATTLE — Database Manager (Firestore)
// ═══════════════════════════════════════════

class DatabaseManager {
  constructor() {}

  // ── Score & Stats (server-authoritative via Cloud Functions) ──

  async updateHighScore(uid, score, username, won = false) {
    if (!economyApi.isAvailable()) {
      console.warn('economyRecordGame unavailable');
      return;
    }
    try {
      await economyApi.call('economyRecordGame', {
        score,
        username,
        won,
        recordHighScore: true,
      });
    } catch (e) {
      console.error('updateHighScore failed:', e);
    }
  }

  async syncPremiumToLeaderboard(uid, isPremium) {
    // Leaderboard premium flag is updated by verifyPlayPurchase / economyRecordGame on server.
    void uid;
    void isPremium;
  }

  async recordOnlineMatch(matchData) {
    try {
      const matchType = matchData.matchType === 'quick' ? 'quick' : 'room';
      const currentUid = matchData.currentUid;

      if (matchData.writeMatch) {
        const matchRef = matchData.roomId
          ? db.collection('matches').doc(`${matchType}_${matchData.roomId}`)
          : db.collection('matches').doc();
        await matchRef.set({
          player1: matchData.player1,
          player2: matchData.player2,
          mode: matchData.mode,
          roomId: matchData.roomId || '',
          winnerUid: matchData.winnerUid || null,
          matchType,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: false });
      }

      if (matchType !== 'quick' || !economyApi.isAvailable()) return;

      const won = matchData.result === 'win' || currentUid === matchData.winnerUid;
      const lost = matchData.result === 'loss' || (!!matchData.winnerUid && !won);
      const draw = matchData.result === 'draw' || (!matchData.winnerUid && !won && !lost);
      const player = [matchData.player1, matchData.player2].find(p => p && p.uid === currentUid);
      const score = player ? player.score : 0;

      await economyApi.call('economyRecordGame', {
        score,
        won,
        recordHighScore: false,
        onlineStats: true,
        matchType: 'quick',
        lost,
        draw,
      });
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
      const p1 = await db.collection('matches')
        .where('player1.uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const p2 = await db.collection('matches')
        .where('player2.uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const all = [];
      p1.forEach(doc => all.push({ id: doc.id, ...doc.data() }));
      p2.forEach(doc => all.push({ id: doc.id, ...doc.data() }));

      all.sort((a, b) => {
        const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });

      return all.slice(0, limit);
    } catch (err) {
      console.error('Failed to get match history:', err);
      return [];
    }
  }
}
