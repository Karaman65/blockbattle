// ═══════════════════════════════════════════
//  BLOCK BATTLE — Ad Manager (AdMob)
// ═══════════════════════════════════════════

class AdManager {
  constructor(game) {
    this.game = game;
    this.appId = 'ca-app-pub-2847518527759480~2761291675';
    this.bannerId = 'ca-app-pub-2847518527759480/5562804120';
    this.interstitialId = 'ca-app-pub-2847518527759480/4944601888';
    this.rewardedId = 'ca-app-pub-2847518527759480/5562804120';
    this.testRewardedId = 'ca-app-pub-3940256099942544/5224354917';
    this.isTesting = this.detectTestingMode();
    this.initialized = false;
    this.bannerShowing = false;
    this.interstitialReady = false;
    this.rewardedReady = false;
    this.bannerHeight = 0;
    this.bannerFallbackTimer = null;
    this.bannerResizeHandler = null;
    this.bannerListenersReady = false;
    this.bannerRefreshRaf = null;
    this.bannerRequested = false;

    this.adMob = null;
  }

  detectTestingMode() {
    if (typeof window === 'undefined') return false;
    const host = window.location && window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return false;
    }
    return host !== 'blockbattle.onrender.com';
  }

  isPremiumUser() {
    return !!(this.game && this.game.authManager && this.game.authManager.isPremium && this.game.authManager.isPremium());
  }

  async init() {
    if (this.initialized) return;

    if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isNativePlatform()) {
      console.log('AdMob: Not on a native device, ads will not load.');
      return;
    }

    try {
      this.adMob = window.Capacitor.Plugins.AdMob;
      if (!this.adMob) {
        console.error('AdMob plugin is not available on window.Capacitor.Plugins.');
        return;
      }
      await this.adMob.initialize({
        requestTrackingAuthorization: true,
        testingDevices: [],
        initializeForTesting: this.isTesting,
      });

      this.initialized = true;
      console.log('AdMob Initialized');
      this.setupBannerLayoutTracking();

      this.prepareInterstitial();
      this.prepareRewarded();
      if (this.bannerRequested) this.showBanner();
    } catch (err) {
      console.error('AdMob Init Error:', err);
    }
  }

  getRewardedAdId() {
    if (this.rewardedId) return this.rewardedId;
    return this.isTesting ? this.testRewardedId : '';
  }

  async showBanner() {
    this.bannerRequested = true;
    if (!this.initialized) return;
    if (this.bannerShowing) {
      this.refreshBannerLayout();
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
      if (!this.bannerHeight) {
        this.bannerHeight = 50;
        this.refreshBannerLayout();
      }
      await this.adMob.showBanner(options);
      this.bannerShowing = true;
      this.refreshBannerLayout();
      console.log('Banner shown');
    } catch (err) {
      console.error('Show Banner Error:', err);
    }
  }

  async hideBanner() {
    if (!this.initialized || !this.bannerShowing) return;
    try {
      await this.adMob.hideBanner();
      this.bannerShowing = false;
      this.bannerHeight = 0;
      this.refreshBannerLayout();
    } catch (err) {
      console.error('Hide Banner Error:', err);
    }
  }

  setupBannerLayoutTracking() {
    if (this.bannerListenersReady || !this.adMob || typeof this.adMob.addListener !== 'function') return;
    this.bannerListenersReady = true;
    this.adMob.addListener('bannerAdSizeChanged', (info) => {
      this.bannerHeight = info && info.height ? info.height : 0;
      this.refreshBannerLayout();
    });
    this.bannerResizeHandler = () => this.refreshBannerLayout();
    window.addEventListener('resize', this.bannerResizeHandler);
  }

  refreshBannerLayout() {
    if (this.bannerRefreshRaf) cancelAnimationFrame(this.bannerRefreshRaf);
    this.bannerRefreshRaf = requestAnimationFrame(() => {
      const height = this.bannerShowing ? (this.bannerHeight || 50) : 0;
      document.documentElement.style.setProperty('--ad-banner-height', `${height}px`);
      document.documentElement.style.setProperty('--admob-banner-height', `${height}px`);
    });
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
    if (this.isPremiumUser()) return;
    if (!this.initialized) return;

    if (!this.interstitialReady) {
      this.prepareInterstitial();
      return;
    }

    try {
      await this.adMob.showInterstitial();
      this.interstitialReady = false;
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
    if (this.isPremiumUser()) return true;
    if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isNativePlatform()) {
      console.log('Rewarded AdMob: web — reward denied (native only).');
      return false;
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
