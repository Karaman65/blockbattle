// ═══════════════════════════════════════════
//  BLOCK BATTLE — Ad Manager (AdMob)
// ═══════════════════════════════════════════

class AdManager {
  constructor() {
    this.appId = 'ca-app-pub-2847518527759480~2761291675';
    this.bannerId = 'ca-app-pub-2847518527759480/5562804120';
    this.interstitialId = 'ca-app-pub-2847518527759480/4944601888';
    this.rewardedId = '';
    this.testRewardedId = 'ca-app-pub-3940256099942544/5224354917';
    this.isTesting = false;
    this.initialized = false;
    this.bannerShowing = false;
    this.interstitialReady = false;
    this.rewardedReady = false;
    
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
      this.prepareRewarded();
    } catch (err) {
      console.error('AdMob Init Error:', err);
    }
  }

  getRewardedAdId() {
    if (this.rewardedId) return this.rewardedId;
    return this.isTesting ? this.testRewardedId : '';
  }

  async showBanner() {
    if (!this.initialized || this.bannerShowing) return;

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
      document.body.classList.add('ad-banner-visible');
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
      document.body.classList.remove('ad-banner-visible');
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

  async prepareRewarded() {
    if (!this.initialized) return false;
    const adId = this.getRewardedAdId();
    if (!adId) {
      console.warn('Rewarded AdMob unit id is missing.');
      return false;
    }

    try {
      await this.adMob.prepareRewardVideoAd({
        adId,
        isTesting: this.isTesting
      });
      this.rewardedReady = true;
      console.log('Rewarded prepared');
      return true;
    } catch (err) {
      console.error('Prepare Rewarded Error:', err);
      this.rewardedReady = false;
      return false;
    }
  }

  async showRewarded() {
    if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isNativePlatform()) {
      console.log('Rewarded AdMob: web test mode, reward granted without native ad.');
      return true;
    }
    if (!this.initialized) return false;

    if (!this.rewardedReady) {
      const prepared = await this.prepareRewarded();
      if (!prepared) return false;
    }

    try {
      await this.adMob.showRewardVideoAd();
      this.rewardedReady = false;
      this.prepareRewarded();
      return true;
    } catch (err) {
      console.error('Show Rewarded Error:', err);
      this.rewardedReady = false;
      this.prepareRewarded();
      return false;
    }
  }
}
