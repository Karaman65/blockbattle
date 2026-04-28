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

  getUsername() {
    if (this.userData && this.userData.username) return this.userData.username;
    if (this.user && this.user.displayName) return this.user.displayName;
    return 'Oyuncu';
  }

  isLoggedIn() {
    return !!this.user;
  }
}
