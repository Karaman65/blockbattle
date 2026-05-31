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
    this.bannerHeight = 0;
    this.bannerFallbackTimer = null;
    this.bannerResizeHandler = null;
    this.bannerListenersReady = false;
    this.bannerRefreshRaf = null;
    
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
      this.setupBannerLayoutTracking();

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
      await this.adMob.showBanner(options);
      this.bannerShowing = true;
      document.body.classList.add('ad-banner-visible');
      this.refreshBannerLayout();
      clearTimeout(this.bannerFallbackTimer);
      this.bannerFallbackTimer = setTimeout(() => this.refreshBannerLayout(), 800);
      console.log('Banner showing');
    } catch (err) {
      console.error('Show Banner Error:', err);
      this.setBannerHeight(0);
    }
  }

  async hideBanner() {
    if (!this.bannerShowing) {
      document.body.classList.remove('ad-banner-visible');
      this.setBannerHeight(0);
      return;
    }
    try {
      await this.adMob.hideBanner();
      this.bannerShowing = false;
      document.body.classList.remove('ad-banner-visible');
      this.setBannerHeight(0);
    } catch (err) {
      console.error('Hide Banner Error:', err);
    }
  }

  setupBannerLayoutTracking() {
    if (this.bannerListenersReady) return;
    this.bannerListenersReady = true;

    const onResize = () => this.scheduleBannerLayoutRefresh();
    window.addEventListener('resize', onResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize, { passive: true });
    }
    this.bannerResizeHandler = onResize;

    if (this.adMob && typeof this.adMob.addListener === 'function') {
      this.adMob.addListener('bannerAdSizeChanged', (info) => {
        const height = Number(info && info.height) || 0;
        this.setBannerHeight(height);
      }).catch(() => { });

      this.adMob.addListener('bannerAdLoaded', () => {
        this.refreshBannerLayout();
      }).catch(() => { });

      this.adMob.addListener('bannerAdFailedToLoad', () => {
        this.setBannerHeight(0);
      }).catch(() => { });
    }
  }

  scheduleBannerLayoutRefresh() {
    if (this.bannerRefreshRaf) return;
    this.bannerRefreshRaf = requestAnimationFrame(() => {
      this.bannerRefreshRaf = null;
      this.refreshBannerLayout();
    });
  }

  refreshBannerLayout() {
    if (!this.bannerShowing) {
      this.setBannerHeight(0);
      return;
    }

    const domHeight = this.measureDomBannerHeight();
    if (domHeight > 0) {
      this.setBannerHeight(domHeight);
      return;
    }

    const fallbackHeight = this.getAdaptiveBannerFallbackHeight();
    this.setBannerHeight(fallbackHeight);
  }

  measureDomBannerHeight() {
    const selectors = [
      '#ad-banner',
      '#admob-banner',
      '.ad-banner',
      '.admob-banner',
      '.admob-container',
      '[data-ad-banner]',
      'ins.adsbygoogle'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.height <= 0) continue;
      return Math.ceil(rect.height);
    }

    return 0;
  }

  getAdaptiveBannerFallbackHeight() {
    const viewportWidth = Math.min(window.innerWidth || 0, window.visualViewport?.width || window.innerWidth || 0);
    if (viewportWidth >= 728) return 90;
    if (viewportWidth >= 468) return 60;
    return 50;
  }

  setBannerHeight(height) {
    const cleanHeight = Math.max(0, Math.ceil(Number(height) || 0));
    const shouldShowClass = cleanHeight > 0 && this.bannerShowing;
    if (
      this.bannerHeight === cleanHeight &&
      document.body.classList.contains('ad-banner-visible') === shouldShowClass
    ) {
      return;
    }

    this.bannerHeight = cleanHeight;
    const root = document.documentElement;
    root.style.setProperty('--ad-banner-height', `${cleanHeight}px`);
    root.style.setProperty('--bottom-nav-offset', cleanHeight > 0
      ? `calc(${cleanHeight}px + env(safe-area-inset-bottom, 0px))`
      : 'env(safe-area-inset-bottom, 0px)');
    document.body.classList.toggle('ad-banner-visible', shouldShowClass);
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
