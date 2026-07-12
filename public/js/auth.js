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

  getProviderUsername(user) {
    const raw = user.displayName || (user.email ? user.email.split('@')[0] : '') || `oyuncu-${user.uid.slice(0, 6)}`;
    const clean = String(raw).trim().replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, '-').replace(/^-+|-+$/g, '');
    return clean.slice(0, 16) || `Oyuncu${user.uid.slice(0, 4)}`;
  }

  async ensureUserProfile(user = this.user) {
    if (!user) return false;
    try {
      const userRef = db.collection('users').doc(user.uid);
      const doc = await userRef.get();
      if (doc.exists) return true;
      if (!economyApi.isAvailable()) throw new Error('functions-unavailable');
      const result = await economyApi.call('createProfile', {
        username: this.getProviderUsername(user),
      });
      return !!(result && result.ok);
    } catch (err) {
      console.error('Failed to ensure user profile:', err);
      return false;
    }
  }

  async register(username, email, password) {
    try {
      this.clearGuestSession();
      const cred = await auth.createUserWithEmailAndPassword(email, password);

      try {
        await cred.user.updateProfile({ displayName: username });
        if (!economyApi.isAvailable()) throw new Error('functions-unavailable');
        await economyApi.call('createProfile', { username });
      } catch (fsErr) {
        console.error('Firestore write error:', fsErr);
        try { await cred.user.delete(); } catch (delErr) { console.error('Auth rollback failed:', delErr); }
        return { success: false, error: 'Hesap oluşturuldu ama profil kaydedilemedi. Tekrar dene.' };
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
      const email = emailOrUsername.trim();
      if (!email.includes('@')) return { success: false, error: 'E-posta adresinle giriş yap.' };

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

      if (!email.includes('@')) return { success: false, error: 'E-posta adresini yaz.' };

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

  async deleteAccount() {
    if (!this.user || this.isGuest) return false;
    try {
      const result = await economyApi.call('deleteAccountData', {});
      try { await auth.signOut(); } catch (signOutError) { console.warn(signOutError); }
      this.clearGuestSession();
      this.user = null;
      this.userData = null;
      this.isGuest = false;
      return !!(result && result.ok);
    } catch (err) {
      console.error('Account deletion failed:', err);
      return false;
    }
  }

  async loadUserData(source = 'default') {
    if (this.isGuest || !this.user) return;
    try {
      const options = source === 'server' ? { source: 'server' } : undefined;
      const doc = await db.collection('users').doc(this.user.uid).get(options);
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
    void level;
    return false;
  }

  _applyUserSnapshot(data) {
    if (data && typeof data === 'object') {
      this.userData = { ...this.userData, ...data };
    }
  }

  async startVerifiedGame(mode, levelId = 0) {
    if (this.isGuest || !this.user) return null;
    try {
      const result = await economyApi.call('economyStartGame', { mode, levelId });
      return result && result.gameId ? result.gameId : null;
    } catch (err) {
      console.error('Game session could not start:', err);
      return null;
    }
  }

  async finishVerifiedGame(gameId, score, won) {
    if (!gameId || this.isGuest || !this.user) return null;
    try {
      const result = await economyApi.call('economyFinishGame', { gameId, score, won });
      await this.loadUserData('server');
      return result && result.ok ? result : null;
    } catch (err) {
      console.error('Game result could not be verified:', err);
      return null;
    }
  }

  async claimVerifiedOnlineMatch(ticket) {
    if (!ticket || this.isGuest || !this.user) return null;
    try {
      const result = await economyApi.call('economyClaimOnlineMatch', { ticket });
      await this.loadUserData('server');
      return result && result.ok ? result : null;
    } catch (err) {
      console.error('Online match result could not be verified:', err);
      return null;
    }
  }

  async addCoins(amount, reason = 'solo_game', extra = {}) {
    if (this.isGuest) {
      if (!this.userData) return false;
      this.userData.coins = (this.userData.coins || 0) + amount;
      this.saveGuestEconomy();
      return true;
    }
    void reason;
    void extra;
    return false;
  }

  async claimQuestReward(questId, periodKey, reward = 0) {
    if (this.isGuest) return this.addCoins(0);
    if (!this.user) return false;
    try {
      const res = await economyApi.call('economyClaimQuest', { questId, periodKey });
      if (res && typeof res.coins === 'number' && this.userData) this.userData.coins = res.coins;
      if (res && res.ok && this.userData) {
        const claimedPeriodKey = res.periodKey || periodKey;
        if (!this.userData.claimedQuests) this.userData.claimedQuests = {};
        const current = Array.isArray(this.userData.claimedQuests[claimedPeriodKey])
          ? this.userData.claimedQuests[claimedPeriodKey]
          : [];
        if (!current.includes(questId)) {
          this.userData.claimedQuests[claimedPeriodKey] = [...current, questId];
        }
      }
      return !!(res && res.ok);
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async claimDailyRewardServer(today, yesterday, reward = 0, streak = 0) {
    if (this.isGuest) return false;
    if (!this.user) return false;
    try {
      const res = await economyApi.call('economyClaimDaily', { today, yesterday });
      await this.loadUserData('server');
      return !!(res && res.ok);
    } catch (e) {
      console.error(e);
      return false;
    }
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
      const res = await economyApi.call('economySpendShop', { action: 'powerUp', type });
      if (res && res.user) this._applyUserSnapshot(res.user);
      else await this.loadUserData();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async buyBundle(items, price) {
    const bundleKey = String(price);
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
      const res = await economyApi.call('economySpendShop', { action: 'bundle', bundleKey });
      if (res && res.user) this._applyUserSnapshot(res.user);
      else await this.loadUserData();
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
      const res = await economyApi.call('economySpendShop', { action: 'theme', themeId });
      if (res && res.user) this._applyUserSnapshot(res.user);
      else await this.loadUserData();
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
      const res = await economyApi.call('economySpendShop', { action: 'cosmetic', category, cosmeticId });
      if (res && res.user) this._applyUserSnapshot(res.user);
      else await this.loadUserData();
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
      await economyApi.call('economyUsePowerUp', { type });
      if (this.userData && this.userData.inventory) {
        this.userData.inventory[type] = Math.max(0, (this.userData.inventory[type] || 0) - 1);
      }
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

  /** @deprecated Premium only via verifyPlayPurchase (IAP). */
  async setPremium() {
    console.warn('setPremium() is disabled — use IAP verification.');
    return false;
  }

  async completePremiumPurchase(coinBonus = 2000) {
    console.warn('completePremiumPurchase() deprecated — use verifyPlayPurchase from IAP flow.');
    return { ok: false, bonusGranted: false };
  }

  async verifyPlayPurchase(productId, purchaseToken) {
    if (!this.user) return { ok: false };
    try {
      const coinsBefore = this.getCoins();
      const res = await economyApi.call('verifyPlayPurchase', { productId, purchaseToken });
      await this.loadUserData('server');
      if (res && res.ok && !res.duplicate && Number(res.coinsGranted) > 0) {
        const expectedCoins = coinsBefore + Number(res.coinsGranted);
        if (!this.userData) this.userData = {};
        if ((this.userData.coins || 0) < expectedCoins) this.userData.coins = expectedCoins;
      }
      const bonusGranted = !!(res && res.coinsGranted > 0 && productId === 'blockbattle_premium_lifetime');
      return { ok: !!(res && res.ok), bonusGranted, duplicate: !!(res && res.duplicate) };
    } catch (err) {
      console.error('IAP verify error:', err);
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
