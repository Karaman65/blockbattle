// ═══════════════════════════════════════════
//  BLOCK BATTLE — Database Manager (Firestore)
// ═══════════════════════════════════════════

class DatabaseManager {
  constructor() {}

  // ── Score & Stats ──

  async updateHighScore(uid, score, username) {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    const data = doc.data();

    const updates = {
      totalGames: firebase.firestore.FieldValue.increment(1),
    };

    if (score > (data.highScore || 0)) {
      updates.highScore = score;
      // Also update leaderboard
      await db.collection('leaderboard').doc(uid).set({
        username: username,
        highScore: score,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await userRef.update(updates);
  }

  async recordOnlineMatch(matchData) {
    // matchData: { player1: {uid, username, score}, player2: {uid, username, score}, mode, winnerUid }
    try {
      await db.collection('matches').add({
        ...matchData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Update winner stats
      if (matchData.winnerUid) {
        await db.collection('users').doc(matchData.winnerUid).update({
          totalWins: firebase.firestore.FieldValue.increment(1),
          totalOnlineGames: firebase.firestore.FieldValue.increment(1),
        });

        // Update loser stats
        const loserUid = matchData.player1.uid === matchData.winnerUid
          ? matchData.player2.uid
          : matchData.player1.uid;
        if (loserUid) {
          await db.collection('users').doc(loserUid).update({
            totalOnlineGames: firebase.firestore.FieldValue.increment(1),
          });
        }
      }
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
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const snap2 = await db.collection('matches')
        .where('player2.uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limit)
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

      return matches.slice(0, limit);
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
