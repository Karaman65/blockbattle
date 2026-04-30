// ═══════════════════════════════════════════
//  BLOCK BATTLE — Ad Manager (AdMob)
// ═══════════════════════════════════════════

class AdManager {
  constructor() {
    this.appId = 'ca-app-pub-2847518527759480~2761291675';
    this.bannerId = 'ca-app-pub-2847518527759480/5562804120';
    this.interstitialId = 'ca-app-pub-2847518527759480/4944601888';
    this.isTesting = true;
    
    this.initialized = false;
    this.bannerShowing = false;
    this.interstitialReady = false;
    
    this.adMob = null;
  }

  async init() {
    if (this.initialized) return;

    // Check if we are running in Capacitor
    if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isNativePlatform()) {
      console.log('AdMob: Not on a native device, ads will not load.');
      return;
    }

    try {
      this.adMob = window.Capacitor.Plugins.AdMob;
      await this.adMob.initialize({
        requestTrackingAuthorization: true,
        testingDevices: [],
        initializeForTesting: this.isTesting,
      });

      this.initialized = true;
      console.log('AdMob Initialized');

      // Preload Interstitial
      this.prepareInterstitial();
    } catch (err) {
      console.error('AdMob Init Error:', err);
    }
  }

  async showBanner() {
    if (!this.initialized || this.bannerShowing) return;
    
    // Check if user is premium (this will be passed from game)
    if (window._game && window._game.authManager.isPremium()) {
      console.log('AdMob: User is premium, skipping banner.');
      return;
    }

    const options = {
      adId: this.bannerId,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
      isTesting: this.isTesting
    };

    try {
      await this.adMob.showBanner(options);
      this.bannerShowing = true;
      console.log('Banner showing');
    } catch (err) {
      console.error('Show Banner Error:', err);
    }
  }

  async hideBanner() {
    if (!this.bannerShowing) return;
    try {
      await this.adMob.hideBanner();
      this.bannerShowing = false;
    } catch (err) {
      console.error('Hide Banner Error:', err);
    }
  }

  async prepareInterstitial() {
    if (!this.initialized) return;

    try {
      await this.adMob.prepareInterstitial({
        adId: this.interstitialId,
        isTesting: this.isTesting
      });
      this.interstitialReady = true;
      console.log('Interstitial prepared');
    } catch (err) {
      console.error('Prepare Interstitial Error:', err);
    }
  }

  async showInterstitial() {
    if (!this.initialized) return;

    if (window._game && window._game.authManager.isPremium()) {
      console.log('AdMob: User is premium, skipping interstitial.');
      return;
    }

    // If not ready, try to prepare and skip this time
    if (!this.interstitialReady) {
      this.prepareInterstitial();
      return;
    }

    try {
      await this.adMob.showInterstitial();
      this.interstitialReady = false;
      // Prepare next one
      this.prepareInterstitial();
    } catch (err) {
      console.error('Show Interstitial Error:', err);
      this.prepareInterstitial();
    }
  }
}
