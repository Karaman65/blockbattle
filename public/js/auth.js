// ═══════════════════════════════════════════
//  BLOCK BATTLE — Authentication Manager
// ═══════════════════════════════════════════

class AuthManager {
  constructor() {
    this.user = null;
    this.userData = null;
    this.onAuthChanged = null; // callback
  }

  init(callback) {
    this.onAuthChanged = callback;
    auth.onAuthStateChanged(async (user) => {
      this.user = user;
      if (user) {
        await this.loadUserData();
      } else {
        this.userData = null;
      }
      if (this.onAuthChanged) this.onAuthChanged(user);
    });
  }

  async register(username, email, password) {
    try {
      // Create auth user FIRST (so we're authenticated for Firestore)
      const cred = await auth.createUserWithEmailAndPassword(email, password);

      try {
        // Update display name
        await cred.user.updateProfile({ displayName: username });

        // Save user profile to Firestore
        await db.collection('users').doc(cred.user.uid).set({
          username: username,
          email: email,
          highScore: 0,
          coins: 500, // Başlangıç hediyesi!
          inventory: {
            bomb: 2,
            rotate: 5,
            skip: 2
          },
          totalGames: 0,
          totalWins: 0,
          totalOnlineGames: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // Add to leaderboard
        await db.collection('leaderboard').doc(cred.user.uid).set({
          username: username,
          highScore: 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (fsErr) {
        console.error('Firestore write error:', fsErr);
      }

      return { success: true };
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') msg = 'Bu email zaten kullanılıyor!';
      if (err.code === 'auth/weak-password') msg = 'Şifre en az 6 karakter olmalı!';
      if (err.code === 'auth/invalid-email') msg = 'Geçersiz email adresi!';
      return { success: false, error: msg };
    }
  }

  async login(emailOrUsername, password) {
    try {
      let email = emailOrUsername;

      // If no @ sign, treat as username and look up email
      if (!emailOrUsername.includes('@')) {
        const snap = await db.collection('users')
          .where('username', '==', emailOrUsername)
          .limit(1)
          .get();

        if (snap.empty) {
          return { success: false, error: 'Kullanıcı bulunamadı!' };
        }
        email = snap.docs[0].data().email;
      }

      await auth.signInWithEmailAndPassword(email, password);
      return { success: true };
    } catch (err) {
      let msg = err.message;
      if (err.code === 'auth/user-not-found') msg = 'Kullanıcı bulunamadı!';
      if (err.code === 'auth/wrong-password') msg = 'Yanlış şifre!';
      if (err.code === 'auth/invalid-credential') msg = 'Email veya şifre hatalı!';
      if (err.code === 'auth/too-many-requests') msg = 'Çok fazla deneme! Biraz bekle.';
      return { success: false, error: msg };
    }
  }

  async logout() {
    await auth.signOut();
  }

  async loadUserData() {
    if (!this.user) return;
    try {
      const doc = await db.collection('users').doc(this.user.uid).get();
      if (doc.exists) {
        this.userData = doc.data();
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  }

  getCoins() {
    return (this.userData && this.userData.coins) || 0;
  }

  getInventory() {
    return (this.userData && this.userData.inventory) || { bomb: 0, rotate: 0, skip: 0 };
  }

  async addCoins(amount) {
    if (!this.user) return;
    try {
      await db.collection('users').doc(this.user.uid).update({
        coins: firebase.firestore.FieldValue.increment(amount)
      });
      if (this.userData) this.userData.coins = (this.userData.coins || 0) + amount;
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async buyPowerUp(type, price) {
    if (!this.user || this.getCoins() < price) return false;
    try {
      const field = `inventory.${type}`;
      await db.collection('users').doc(this.user.uid).update({
        coins: firebase.firestore.FieldValue.increment(-price),
        [field]: firebase.firestore.FieldValue.increment(1)
      });
      
      if (this.userData) {
        this.userData.coins -= price;
        this.userData.inventory[type] = (this.userData.inventory[type] || 0) + 1;
      }
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async decrementInventory(type) {
    if (!this.user) return;
    try {
      const field = `inventory.${type}`;
      await db.collection('users').doc(this.user.uid).update({
        [field]: firebase.firestore.FieldValue.increment(-1)
      });
      if (this.userData) this.userData.inventory[type]--;
    } catch (e) { console.error(e); }
  }

  getUsername() {
    if (this.userData && this.userData.username) return this.userData.username;
    if (this.user && this.user.displayName) return this.user.displayName;
    return 'Oyuncu';
  }

  isPremium() {
    return this.userData && this.userData.isPremium === true;
  }

  async setPremium() {
    if (!this.user) return;
    try {
      // Update users collection
      await db.collection('users').doc(this.user.uid).update({
        isPremium: true
      });
      
      // Update leaderboard collection
      await db.collection('leaderboard').doc(this.user.uid).set({
        isPremium: true
      }, { merge: true });

      if (this.userData) this.userData.isPremium = true;
      return true;
    } catch (err) {
      console.error('Premium güncelleme hatası:', err);
      return false;
    }
  }

  isLoggedIn() {
    return !!this.user;
  }
}
