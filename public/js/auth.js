// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  BLOCK BATTLE â€” Authentication Manager
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

class AuthManager {
  constructor() {
    this.user = null;
    this.userData = null;
    this.onAuthChanged = null; // callback
    this.isGuest = false;
  }

  init(callback) {
    this.onAuthChanged = callback;
    auth.onAuthStateChanged(async (user) => {
      this.user = user;
      if (user) {
        this.isGuest = false;
        await this.ensureUserProfile(user);
        await this.loadUserData();
      } else if (localStorage.getItem('blockBattleGuestSession') === '1') {
        this.startGuestSession(false);
      } else {
        this.isGuest = false;
        this.userData = null;
      }
      if (this.onAuthChanged) this.onAuthChanged(user);
    });
  }

  createGuestUsername() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    return `Misafir-${suffix}`;
  }

  startGuestSession(notify = true) {
    let username = localStorage.getItem('blockBattleGuestName');
    if (!username) {
      username = this.createGuestUsername();
      localStorage.setItem('blockBattleGuestName', username);
    }
    const guestInventory = JSON.parse(localStorage.getItem('blockBattleGuestInventory') || '{"bomb":1,"rotate":2,"skip":1}');
    const guestOwnedThemes = JSON.parse(localStorage.getItem('blockBattleGuestOwnedThemes') || '["default"]');
    const guestOwnedCosmetics = JSON.parse(localStorage.getItem('blockBattleGuestOwnedCosmetics') || '{"bombEffect":["classic"]}');
    localStorage.setItem('blockBattleGuestSession', '1');
    this.user = null;
    this.isGuest = true;
    this.userData = {
      username,
      email: '',
      highScore: parseInt(localStorage.getItem('blockBattleGuestHighScore') || '0', 10),
      coins: parseInt(localStorage.getItem('blockBattleGuestCoins') || '500', 10),
      unlockedLevel: 1,
      inventory: {
        bomb: guestInventory.bomb || 0,
        rotate: guestInventory.rotate || 0,
        skip: guestInventory.skip || 0
      },
      ownedThemes: Array.isArray(guestOwnedThemes) && guestOwnedThemes.length ? guestOwnedThemes : ['default'],
      ownedCosmetics: guestOwnedCosmetics && typeof guestOwnedCosmetics === 'object' ? guestOwnedCosmetics : { bombEffect: ['classic'] },
      totalGames: 0,
      totalWins: 0,
      totalOnlineGames: 0,
      quickOnlineGames: 0,
      quickWins: 0,
      quickLosses: 0,
      quickDraws: 0
    };
    if (notify && this.onAuthChanged) this.onAuthChanged(null);
    return { success: true, username };
  }

  clearGuestSession() {
    localStorage.removeItem('blockBattleGuestSession');
  }

  getUsernameKey(username) {
    return String(username || 'oyuncu').trim().toLowerCase().replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'oyuncu';
  }

  getProviderUsername(user) {
    const raw = user.displayName || (user.email ? user.email.split('@')[0] : '') || `oyuncu-${user.uid.slice(0, 6)}`;
    return String(raw).trim().slice(0, 16) || `Oyuncu${user.uid.slice(0, 4)}`;
  }

  async reserveUsername(baseUsername, user) {
    let username = String(baseUsername || 'Oyuncu').trim().slice(0, 16) || 'Oyuncu';
    let key = this.getUsernameKey(username);

    for (let i = 0; i < 5; i++) {
      const candidate = i === 0 ? key : `${key}-${user.uid.slice(0, 4 + i)}`;
      const docRef = db.collection('usernames').doc(candidate);
      const snap = await docRef.get();
      if (snap.exists && snap.data().uid === user.uid) return snap.data().username || username;
      if (snap.exists) continue;
      const finalUsername = i === 0 ? username : `${username.slice(0, 11)}${user.uid.slice(0, 4 + i)}`;
      await docRef.set({
        uid: user.uid,
        username: finalUsername,
        email: user.email || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return finalUsername;
    }

    return `Oyuncu${user.uid.slice(0, 6)}`;
  }

  async ensureUserProfile(user = this.user) {
    if (!user) return false;
    try {
      const userRef = db.collection('users').doc(user.uid);
      const doc = await userRef.get();
      if (doc.exists) return true;

      const username = await this.reserveUsername(this.getProviderUsername(user), user);
      await userRef.set({
        username,
        email: user.email || '',
        highScore: 0,
        coins: 500,
        unlockedLevel: 1,
        inventory: {
          bomb: 2,
          rotate: 5,
          skip: 2
        },
        totalGames: 0,
        totalWins: 0,
        totalOnlineGames: 0,
        quickOnlineGames: 0,
        quickWins: 0,
        quickLosses: 0,
        quickDraws: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('leaderboard').doc(user.uid).set({
        username,
        highScore: 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return true;
    } catch (err) {
      console.error('Failed to ensure user profile:', err);
      return false;
    }
  }

  async register(username, email, password) {
    try {
      this.clearGuestSession();
      const usernameKey = username.trim().toLowerCase();
      const usernameDoc = await db.collection('usernames').doc(usernameKey).get();
      if (usernameDoc.exists) {
        return { success: false, error: 'Bu kullanıcı adı alınmış.' };
      }

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
          unlockedLevel: 1,
          inventory: {
            bomb: 2,
            rotate: 5,
            skip: 2
          },
          totalGames: 0,
          totalWins: 0,
          totalOnlineGames: 0,
          quickOnlineGames: 0,
          quickWins: 0,
          quickLosses: 0,
          quickDraws: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection('usernames').doc(usernameKey).set({
          uid: cred.user.uid,
          username,
          email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
      console.error('Register error:', err.code, err.message);
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') msg = 'Bu email zaten kullanılıyor!';
      if (err.code === 'auth/weak-password') msg = 'Şifre en az 6 karakter olmalı!';
      if (err.code === 'auth/invalid-email') msg = 'Geçersiz email adresi!';
      if (err.code === 'auth/unauthorized-continue-uri') msg = 'Firebase Authorized domains ayarında bu site adresi yok.';
      if (err.message && err.message.includes('error-code:-26')) msg = 'Firebase dönüş adresine izin vermedi. Sayfayı yenileyip tekrar dene; artık varsayılan şifre linki kullanılacak.';
      return { success: false, error: msg };
    }
  }

  async login(emailOrUsername, password) {
    try {
      this.clearGuestSession();
      let email = emailOrUsername;

      // If no @ sign, treat as username and look up email
      if (!emailOrUsername.includes('@')) {
        const usernameDoc = await db.collection('usernames')
          .doc(emailOrUsername.trim().toLowerCase())
          .get();

        if (!usernameDoc.exists) {
          const legacySnap = await db.collection('users')
            .where('username', '==', emailOrUsername.trim())
            .limit(1)
            .get();

          if (legacySnap.empty) {
            return { success: false, error: 'Kullanıcı bulunamadı!' };
          }
          email = legacySnap.docs[0].data().email;
        } else {
          email = usernameDoc.data().email;
        }
      }

      const cred = await auth.signInWithEmailAndPassword(email, password);
      this.user = cred.user;
      this.isGuest = false;
      await this.ensureUserProfile(cred.user);
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

  async loginWithGoogle() {
    try {
      this.clearGuestSession();
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        const nativeAuth = (window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAuthentication)
          || (window.Capacitor.registerPlugin && window.Capacitor.registerPlugin('FirebaseAuthentication'))
          || (window.Capacitor.nativePromise && {
            signInWithGoogle: (options) => window.Capacitor.nativePromise('FirebaseAuthentication', 'signInWithGoogle', options)
          });
        if (!nativeAuth || !nativeAuth.signInWithGoogle) {
          return { success: false, error: 'Google giriş köprüsü bulunamadı. Uygulamayı Play Store üzerinden son sürüme güncelle.' };
        }

        let nativeResult;
        try {
          nativeResult = await nativeAuth.signInWithGoogle({
            skipNativeAuth: true,
            useCredentialManager: true
          });
        } catch (nativeErr) {
          const nativeMessage = nativeErr && (nativeErr.message || nativeErr.errorMessage || nativeErr.code);
          if (nativeMessage && String(nativeMessage).toLowerCase().includes('unable to find plugin')) {
            return { success: false, error: 'Google giriş eklentisi bu APK içinde yok. Yeni APK/AAB oluşturup telefondaki eski sürümü kaldırarak tekrar yükle.' };
          }
          throw nativeErr;
        }
        const googleCredential = firebase.auth.GoogleAuthProvider.credential(
          nativeResult.credential && nativeResult.credential.idToken,
          nativeResult.credential && nativeResult.credential.accessToken
        );
        const cred = await auth.signInWithCredential(googleCredential);
        await this.ensureUserProfile(cred.user);
        await this.loadUserData();
        return { success: true };
      }
      const cred = await auth.signInWithPopup(provider);
      await this.ensureUserProfile(cred.user);
      await this.loadUserData();
      return { success: true };
    } catch (err) {
      console.error('Google login error:', err.code, err.message);
      let msg = err.message || 'Google ile giriş yapılamadı.';
      if (err.code === 'auth/popup-closed-by-user') msg = 'Google giriş penceresi kapatıldı.';
      if (err.code === 'auth/unauthorized-domain') msg = 'Bu domain Firebase Authorized domains listesinde yok.';
      if (err.code === 'auth/operation-not-supported-in-this-environment') msg = 'Bu ortamda Google popup desteklenmiyor.';
      if (err.code === 'auth/invalid-credential') msg = 'Google giriş bilgisi alınamadı. Firebase SHA ayarlarını ve google-services.json dosyasını kontrol et.';
      return { success: false, error: msg };
    }
  }

  async sendPasswordReset(emailOrUsername) {
    try {
      let email = emailOrUsername.trim();
      if (!email) return { success: false, error: 'Email veya kullanıcı adını yaz.' };

      if (!email.includes('@')) {
        const usernameDoc = await db.collection('usernames')
          .doc(email.toLowerCase())
          .get();

        if (!usernameDoc.exists) {
          const legacySnap = await db.collection('users')
            .where('username', '==', email)
            .limit(1)
            .get();

          if (legacySnap.empty) {
            return { success: false, error: 'Bu kullanıcı adı bulunamadı.' };
          }
          email = legacySnap.docs[0].data().email;
        } else {
          email = usernameDoc.data().email;
        }
      }

      await auth.sendPasswordResetEmail(email);
      return { success: true, email };
    } catch (err) {
      console.error('Password reset error:', err.code, err.message);
      let msg = err.message;
      if (err.message && err.message.includes('error-code:-26')) msg = 'Firebase dönüş adresine izin vermedi. Sayfayı yenileyip tekrar dene; artık varsayılan şifre linki kullanılacak.';
      if (err.code === 'auth/invalid-email') msg = 'Geçersiz email adresi.';
      if (err.code === 'auth/user-not-found') msg = 'Kullanıcı bulunamadı!';
      if (err.code === 'auth/too-many-requests') msg = 'Çok fazla deneme! Biraz bekle.';
      if (err.code === 'auth/unauthorized-continue-uri') msg = 'Firebase Authorized domains ayarında bu site adresi yok.';
      return { success: false, error: msg };
    }
  }

  async logout() {
    if (this.isGuest) {
      this.clearGuestSession();
      this.isGuest = false;
      this.user = null;
      this.userData = null;
      if (this.onAuthChanged) this.onAuthChanged(null);
      return;
    }
    await auth.signOut();
  }

  async loadUserData() {
    if (this.isGuest || !this.user) return;
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

  saveGuestEconomy() {
    if (!this.isGuest || !this.userData) return;
    localStorage.setItem('blockBattleGuestCoins', String(this.userData.coins || 0));
    localStorage.setItem('blockBattleGuestInventory', JSON.stringify(this.userData.inventory || { bomb: 0, rotate: 0, skip: 0 }));
    localStorage.setItem('blockBattleGuestOwnedThemes', JSON.stringify(this.userData.ownedThemes || ['default']));
    localStorage.setItem('blockBattleGuestOwnedCosmetics', JSON.stringify(this.userData.ownedCosmetics || { bombEffect: ['classic'] }));
  }

  getUnlockedLevel() {
    return Math.max(1, (this.userData && this.userData.unlockedLevel) || 1);
  }

  async setUnlockedLevel(level) {
    if (this.isGuest) return false;
    if (!this.user) return false;
    const safeLevel = Math.max(1, level);
    try {
      await db.collection('users').doc(this.user.uid).set({
        unlockedLevel: safeLevel
      }, { merge: true });
      if (this.userData) this.userData.unlockedLevel = safeLevel;
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async addCoins(amount) {
    if (this.isGuest) {
      if (!this.userData) return false;
      this.userData.coins = (this.userData.coins || 0) + amount;
      this.saveGuestEconomy();
      return true;
    }
    if (!this.user) return false;
    try {
      await db.collection('users').doc(this.user.uid).update({
        coins: firebase.firestore.FieldValue.increment(amount)
      });
      if (this.userData) this.userData.coins = (this.userData.coins || 0) + amount;
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async buyPowerUp(type, price) {
    if (this.isGuest) {
      if (!this.userData || this.getCoins() < price) return false;
      this.userData.coins -= price;
      if (!this.userData.inventory) this.userData.inventory = {};
      this.userData.inventory[type] = (this.userData.inventory[type] || 0) + 1;
      this.saveGuestEconomy();
      return true;
    }
    if (!this.user || this.getCoins() < price) return false;
    try {
      const field = `inventory.${type}`;
      await db.collection('users').doc(this.user.uid).update({
        coins: firebase.firestore.FieldValue.increment(-price),
        [field]: firebase.firestore.FieldValue.increment(1)
      });
      
      if (this.userData) {
        this.userData.coins -= price;
        if (!this.userData.inventory) this.userData.inventory = {};
        this.userData.inventory[type] = (this.userData.inventory[type] || 0) + 1;
      }
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async buyBundle(items, price) {
    if (this.isGuest) {
      if (!this.userData || this.getCoins() < price) return false;
      this.userData.coins -= price;
      if (!this.userData.inventory) this.userData.inventory = {};
      for (const [type, count] of Object.entries(items)) {
        if (count > 0) this.userData.inventory[type] = (this.userData.inventory[type] || 0) + count;
      }
      this.saveGuestEconomy();
      return true;
    }
    if (!this.user || this.getCoins() < price) return false;
    try {
      const update = {
        coins: firebase.firestore.FieldValue.increment(-price)
      };
      for (const [type, count] of Object.entries(items)) {
        if (count > 0) update[`inventory.${type}`] = firebase.firestore.FieldValue.increment(count);
      }
      await db.collection('users').doc(this.user.uid).update(update);

      if (this.userData) {
        this.userData.coins -= price;
        if (!this.userData.inventory) this.userData.inventory = {};
        for (const [type, count] of Object.entries(items)) {
          this.userData.inventory[type] = (this.userData.inventory[type] || 0) + count;
        }
      }
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async buyTheme(themeId, price) {
    if (this.isGuest) {
      if (!this.userData) return false;
      if (!this.userData.ownedThemes) this.userData.ownedThemes = ['default'];
      if (this.userData.ownedThemes.includes(themeId)) return true;
      if (this.getCoins() < price) return false;
      this.userData.coins -= price;
      this.userData.ownedThemes.push(themeId);
      this.saveGuestEconomy();
      return true;
    }
    if (!this.user) return false;
    const owned = this.userData?.ownedThemes || ['default'];
    if (owned.includes(themeId)) return true;
    if (this.getCoins() < price) return false;

    try {
      await db.collection('users').doc(this.user.uid).update({
        coins: firebase.firestore.FieldValue.increment(-price),
        ownedThemes: firebase.firestore.FieldValue.arrayUnion(themeId)
      });
      
      if (this.userData) {
        this.userData.coins -= price;
        if (!this.userData.ownedThemes) this.userData.ownedThemes = ['default'];
        this.userData.ownedThemes.push(themeId);
      }
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async buyCosmetic(category, cosmeticId, price) {
    if (this.isGuest) {
      if (!this.userData) return false;
      if (!this.userData.ownedCosmetics) this.userData.ownedCosmetics = {};
      if (!this.userData.ownedCosmetics[category]) this.userData.ownedCosmetics[category] = ['classic'];
      if (this.userData.ownedCosmetics[category].includes(cosmeticId)) return true;
      if (this.getCoins() < price) return false;
      this.userData.coins -= price;
      this.userData.ownedCosmetics[category].push(cosmeticId);
      this.saveGuestEconomy();
      return true;
    }
    if (!this.user) return false;
    const owned = this.userData?.ownedCosmetics?.[category] || ['classic'];
    if (owned.includes(cosmeticId)) return true;
    if (this.getCoins() < price) return false;

    try {
      await db.collection('users').doc(this.user.uid).update({
        coins: firebase.firestore.FieldValue.increment(-price),
        [`ownedCosmetics.${category}`]: firebase.firestore.FieldValue.arrayUnion(cosmeticId)
      });

      if (this.userData) {
        this.userData.coins -= price;
        if (!this.userData.ownedCosmetics) this.userData.ownedCosmetics = {};
        if (!this.userData.ownedCosmetics[category]) this.userData.ownedCosmetics[category] = ['classic'];
        this.userData.ownedCosmetics[category].push(cosmeticId);
      }
      return true;
    } catch (e) { console.error(e); return false; }
  }

  async decrementInventory(type) {
    if (this.isGuest) {
      if (this.userData && this.userData.inventory) {
        this.userData.inventory[type] = Math.max(0, (this.userData.inventory[type] || 0) - 1);
        this.saveGuestEconomy();
      }
      return;
    }
    if (!this.user) return;
    try {
      const field = `inventory.${type}`;
      await db.collection('users').doc(this.user.uid).update({
        [field]: firebase.firestore.FieldValue.increment(-1)
      });
      if (this.userData && this.userData.inventory) this.userData.inventory[type]--;
    } catch (e) { console.error(e); }
  }

  getUsername() {
    if (this.userData && this.userData.username) return this.userData.username;
    if (this.user && this.user.displayName) return this.user.displayName;
    return this.isGuest && this.userData && this.userData.username ? this.userData.username : 'Oyuncu';
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

  async completePremiumPurchase(coinBonus = 2000) {
    if (!this.user) return false;
    try {
      await this.loadUserData();
      const alreadyPremium = this.userData && this.userData.isPremium === true;
      const bonusAlreadyGranted = this.userData && this.userData.premiumBonusGranted === true;
      const shouldGrantBonus = !alreadyPremium && !bonusAlreadyGranted && coinBonus > 0;
      const update = {
        isPremium: true,
        premiumBonusGranted: true
      };
      if (!alreadyPremium) update.premiumPurchasedAt = firebase.firestore.FieldValue.serverTimestamp();
      if (shouldGrantBonus) {
        update.coins = firebase.firestore.FieldValue.increment(coinBonus);
      }

      await db.collection('users').doc(this.user.uid).set(update, { merge: true });

      await db.collection('leaderboard').doc(this.user.uid).set({
        isPremium: true
      }, { merge: true });

      if (!this.userData) this.userData = {};
      this.userData.isPremium = true;
      this.userData.premiumBonusGranted = true;
      if (shouldGrantBonus) this.userData.coins = (this.userData.coins || 0) + coinBonus;
      return { ok: true, bonusGranted: shouldGrantBonus };
    } catch (err) {
      console.error('Premium satın alma tamamlama hatası:', err);
      return { ok: false, bonusGranted: false };
    }
  }

  async submitFeedback(type, message) {
    if (!this.user) return { ok: false, reason: 'auth' };
    const cleanMessage = (message || '').trim();
    if (cleanMessage.length < 5) return { ok: false, reason: 'short' };
    try {
      await db.collection('feedback').add({
        uid: this.user.uid,
        email: this.user.email || '',
        username: this.getUsername(),
        type: type || 'other',
        message: cleanMessage.slice(0, 800),
        appVersion: '1.0',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true };
    } catch (err) {
      console.error('Feedback submit error:', err);
      return { ok: false, reason: err && err.code ? err.code : 'unknown' };
    }
  }

  isLoggedIn() {
    return !!this.user;
  }

  isGuestSession() {
    return this.isGuest === true;
  }
}



