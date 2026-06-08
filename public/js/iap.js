// Google Play in-app purchases. Web/Render builds keep using the normal coin shop.
class IapManager {
  constructor(game) {
    this.game = game;
    this.authManager = game.authManager;
    this.plugin = null;
    this.ready = false;
    this.products = new Map();
    this.pendingProducts = new Set();
    this.fulfilledKey = 'blockBattleFulfilledPurchases';
    this.productConfig = {
      blockbattle_coins_500: {
        coins: 500,
        consumable: true,
        fallbackPrice: '₺19,99',
        label: '500 Coin',
      },
      blockbattle_coins_1500: {
        coins: 1500,
        consumable: true,
        fallbackPrice: '₺49,99',
        label: '1500 Coin',
      },
      blockbattle_coins_5000: {
        coins: 5000,
        consumable: true,
        fallbackPrice: '₺129,99',
        label: '5000 Coin',
      },
      blockbattle_premium_lifetime: {
        premium: true,
        coins: 2000,
        consumable: false,
        fallbackPrice: '₺99,99',
        label: 'Premium',
      },
    };
  }

  async init() {
    this.bindButtons();
    this.updateProductLabels();

    this.plugin = window.Capacitor?.Plugins?.PurchasePlugin;
    const isNative = !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android');
    if (!isNative || !this.plugin) {
      this.setStatus('Gerçek ödeme Android uygulamasında açılır.');
      return;
    }

    try {
      await this.plugin.init();
      await this.attachListeners();
      await this.loadProducts();
      await this.syncPurchasesFromStore(false);
      this.ready = true;
      this.setStatus('Google Play ödeme hazır.');
    } catch (err) {
      console.warn('IAP init failed:', err);
      this.setStatus('Google Play ödeme şu an hazır değil.');
    }
  }

  bindButtons() {
    document.querySelectorAll('[data-iap-product]').forEach(btn => {
      btn.onclick = () => this.purchase(btn.dataset.iapProduct, btn);
    });
  }

  async attachListeners() {
    if (typeof this.plugin.addListener !== 'function') return;
    await this.plugin.addListener('purchasesUpdated', data => this.handlePurchases(data && data.purchases));
    await this.plugin.addListener('setPurchases', data => this.restorePurchases(data && data.purchases));
  }

  async loadProducts() {
    const ids = Object.keys(this.productConfig);
    const result = await this.plugin.getAvailableProducts({ inAppSkus: ids, subsSkus: [] });
    const products = Array.isArray(result && result.products) ? result.products : [];
    products.forEach(product => {
      const id = product.productId || product.id;
      if (id) this.products.set(id, product);
    });
    this.updateProductLabels();
  }

  updateProductLabels() {
    document.querySelectorAll('[data-iap-product]').forEach(btn => {
      const id = btn.dataset.iapProduct;
      const config = this.productConfig[id];
      const isOwnedPremium = !!(config?.premium && this.authManager?.isPremium && this.authManager.isPremium());
      if (isOwnedPremium) {
        btn.textContent = 'Aktif';
        btn.disabled = true;
        btn.classList.add('owned');
        return;
      }
      btn.disabled = btn.dataset.busy === 'true';
      btn.classList.remove('owned');
      const product = this.products.get(id);
      const price = product?.formatted_price || product?.offers?.[0]?.formatted_price || config?.fallbackPrice || 'Satın Al';
      btn.textContent = price;
    });
  }

  async purchase(productId, button) {
    const config = this.productConfig[productId];
    if (!config) return;

    if (!this.game.requireAccount('Satın alma işlemi için giriş yap veya hesap oluştur.')) return;

    if (config.premium && this.authManager?.isPremium && this.authManager.isPremium()) {
      this.setStatus('Premium zaten aktif.');
      this.updateProductLabels();
      return;
    }

    if (!this.plugin || !this.ready) {
      this.setStatus('Ödeme ürünü Play Console tarafında hazır olduktan sonra açılır.');
      this.shake(button);
      return;
    }

    if (!this.products.has(productId)) {
      this.setStatus('Bu ürün Play Console tarafında henüz aktif görünmüyor.');
      this.shake(button);
      return;
    }

    try {
      this.pendingProducts.add(productId);
      this.setButtonBusy(button, true);
      await this.plugin.buy({
        productId,
        additionalData: { accountId: this.authManager.user.uid },
      });
      await this.settlePurchaseAfterBuy(productId);
      this.pendingProducts.delete(productId);
      this.setButtonBusy(button, false);
    } catch (err) {
      if (!(err && String(err.message || err).includes('USER_CANCELED'))) {
        console.warn('Purchase failed:', err);
        this.setStatus('Satın alma tamamlanamadı. Biraz sonra tekrar dene.');
      }
      this.pendingProducts.delete(productId);
      this.setButtonBusy(button, false);
    }
  }

  async settlePurchaseAfterBuy(productId) {
    this.setStatus('Satın alma kontrol ediliyor...');
    for (let attempt = 0; attempt < 4; attempt++) {
      const handled = await this.syncPurchasesFromStore(false, productId);
      if (handled) return;
      await this.delay(700 + attempt * 600);
    }
    await this.refreshAccountState();
  }

  async syncPurchasesFromStore(restoreOnly = false, preferredProductId = '') {
    if (!this.plugin || typeof this.plugin.getPurchases !== 'function') return false;
    try {
      const result = await this.plugin.getPurchases();
      const purchases = Array.isArray(result && result.purchases) ? result.purchases : [];
      const filtered = preferredProductId
        ? purchases.filter(purchase => this.getProductId(purchase) === preferredProductId)
        : purchases;
      if (!filtered.length) return false;
      for (const purchase of filtered) {
        await this.fulfillPurchase(purchase, restoreOnly);
      }
      return true;
    } catch (err) {
      console.warn('Purchase sync failed:', err);
      return false;
    }
  }

  async refreshAccountState() {
    if (this.authManager && typeof this.authManager.loadUserData === 'function') {
      await this.authManager.loadUserData('server');
    }
    this.game.updateCoinDisplays();
    this.game.updatePlayerHeader();
    this.updateProductLabels();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async handlePurchases(purchases) {
    if (!Array.isArray(purchases)) return;
    for (const purchase of purchases) {
      await this.fulfillPurchase(purchase, false);
    }
    this.pendingProducts.clear();
    document.querySelectorAll('[data-iap-product]').forEach(btn => this.setButtonBusy(btn, false));
  }

  async restorePurchases(purchases) {
    if (!Array.isArray(purchases)) return;
    for (const purchase of purchases) {
      const productId = this.getProductId(purchase);
      const config = this.productConfig[productId];
      await this.fulfillPurchase(purchase, !!(config && config.premium));
    }
  }

  async fulfillPurchase(purchase, restoreOnly) {
    const productId = this.getProductId(purchase);
    const config = this.productConfig[productId];
    if (!config || !this.authManager.user) return;

    const token = purchase.purchaseToken || purchase.token || purchase.orderId || `${productId}:${purchase.purchaseTime || Date.now()}`;
    const fulfilled = this.getFulfilledTokens();
    if (config.consumable && fulfilled.has(token)) return;

    const purchaseToken = purchase.purchaseToken || purchase.token;
    if (!purchaseToken) {
      this.setStatus('Satın alma doğrulanamadı (token yok).');
      return;
    }

    const verifyResult = await this.authManager.verifyPlayPurchase(productId, purchaseToken);
    if (!verifyResult || !verifyResult.ok) {
      this.setStatus('Satın alma sunucuda doğrulanamadı. Destek ile iletişime geç.');
      return;
    }

    if (config.premium) {
      if (purchaseToken && this.plugin && typeof this.plugin.acknowledgePurchase === 'function') {
        await this.plugin.acknowledgePurchase({ purchaseToken });
      }
      this.setStatus(verifyResult.bonusGranted
        ? 'Premium açıldı. 2000 coin hesabına eklendi.'
        : verifyResult.duplicate ? 'Premium zaten aktif.' : 'Premium aktif.');
    } else if (!restoreOnly) {
      if (purchaseToken && this.plugin && typeof this.plugin.consumePurchase === 'function') {
        await this.plugin.consumePurchase({ purchaseToken });
      }
      fulfilled.add(token);
      this.saveFulfilledTokens(fulfilled);
      this.setStatus(verifyResult.duplicate ? `${config.label} zaten işlendi.` : `${config.label} hesabına eklendi.`);
    }

    this.game.updateCoinDisplays();
    this.game.updatePlayerHeader();
    this.updateProductLabels();
    if (this.game.updateAdBannerState) await this.game.updateAdBannerState();
  }

  getProductId(purchase) {
    if (Array.isArray(purchase?.productIds) && purchase.productIds.length) return purchase.productIds[0];
    if (Array.isArray(purchase?.products) && purchase.products.length) return purchase.products[0];
    return purchase?.productId || purchase?.sku || '';
  }

  getFulfilledTokens() {
    try {
      return new Set(JSON.parse(localStorage.getItem(this.fulfilledKey) || '[]'));
    } catch (err) {
      return new Set();
    }
  }

  saveFulfilledTokens(tokens) {
    localStorage.setItem(this.fulfilledKey, JSON.stringify([...tokens].slice(-100)));
  }

  setStatus(message) {
    const el = document.getElementById('iap-status');
    if (el) el.textContent = message;
  }

  setButtonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.dataset.busy = busy ? 'true' : 'false';
    if (busy) button.textContent = 'Bekle...';
    else this.updateProductLabels();
  }

  shake(button) {
    if (!button) return;
    button.classList.add('shake');
    setTimeout(() => button.classList.remove('shake'), 500);
  }
}

window.IapManager = IapManager;
