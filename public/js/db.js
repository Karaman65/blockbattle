// ═══════════════════════════════════════════
//  BLOCK BATTLE — Database Manager (Firestore)
// ═══════════════════════════════════════════

class DatabaseManager {
  constructor() {}

  async syncPremiumToLeaderboard(uid, isPremium) {
    // Leaderboard premium flag is updated by verifyPlayPurchase / economyRecordGame on server.
    void uid;
    void isPremium;
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
