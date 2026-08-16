export function applyShop(Game) {
  Object.assign(Game.prototype, {
    resetPowerUps() {
      const inv = this.authManager.getInventory();
      this.powerUps = {
        bomb: inv.bomb || 0,
        rotate: inv.rotate || 0,
        skip: inv.skip || 0
      };
      this.bombMode = false;
      this.updatePowerUpUI();
    },

    updateCoinDisplays() {
      const coins = this.authManager.getCoins();
      const activeScreenId = typeof UiHeader !== 'undefined' ? UiHeader.getActiveScreenId() : null;
      if (typeof UiHeader !== 'undefined') {
        UiHeader.updateCoins(coins, activeScreenId);
      }
      this.updatePlayerHeader(activeScreenId);
    
      // Keep consumable shop buttons clickable so they can show feedback when coins are low.
      document.querySelectorAll('.btn-buy').forEach(btn => {
        const price = parseInt(btn.dataset.price);
        if (!['theme', 'cosmetic'].includes(btn.dataset.type) && Number.isFinite(price)) btn.disabled = false;
      });
      if (typeof this.updateStoreCosmeticsUI === 'function') this.updateStoreCosmeticsUI();
    },

    queueCoins(amount) {
      this._pendingCoins += amount;
    },

    async _flushCoins() {
      if (this._pendingCoins <= 0) return;
      const amount = this._pendingCoins;
      this._pendingCoins = 0;
      await this.authManager.addCoins(amount, 'solo_game');
      this.updateCoinDisplays();
    },

    async flushPendingCoinsForShop() {
      if (this._pendingCoins <= 0) return true;
      const amount = this._pendingCoins;
      this._pendingCoins = 0;
      const success = await this.authManager.addCoins(amount, 'solo_game');
      if (!success) {
        this._pendingCoins += amount;
        return false;
      }
      this.updateCoinDisplays();
      return true;
    },

    showStore(tab = 'currency') {
      this.updateCoinDisplays();
      this.updateStoreThemesUI();
      this.updateStoreCosmeticsUI();
      this.selectStoreTab(tab);
      this.showScreen('store-screen');
      requestAnimationFrame(() => this.scrollStoreToTab(tab));
    },

    selectStoreTab(tab = 'currency') {
      const validTab = document.querySelector(`[data-shop-tab="${tab}"]`) ? tab : 'currency';
      document.querySelectorAll('[data-shop-tab]').forEach(item => {
        item.classList.toggle('active', item.dataset.shopTab === validTab);
      });
      document.querySelectorAll('[data-shop-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.shopPanel === validTab);
      });
    },

    scrollStoreToTab(tab = 'currency') {
      const scroller = document.querySelector('#store-screen .store-themed-scroll');
      if (!scroller) return;
      if (tab === 'currency') {
        scroller.scrollTop = 0;
        return;
      }
      const tabs = document.querySelector('#store-screen .shop-tabs');
      scroller.scrollTop = tabs ? Math.max(0, tabs.offsetTop - 12) : 0;
    },

    setupCoinTopUpButtons() {
      document.querySelectorAll('.figma-stat.coin-stat').forEach((stat) => {
        if (stat.querySelector('.coin-topup-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coin-topup-btn';
        btn.setAttribute('aria-label', 'Coin satın al');
        btn.textContent = '+';
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showStore('currency');
        };
        stat.appendChild(btn);
      });
    },

    setTheme(themeId) {
      if (THEMES[themeId]) {
        BLOCK_COLORS = THEMES[themeId];
        if (this.state === 'playing') {
          this.renderPieceTray();
        }
        localStorage.setItem('selectedTheme', themeId);
      }
    },

    updateStoreThemesUI() {
      const selected = localStorage.getItem('selectedTheme') || 'default';
      const owned = this.authManager.userData?.ownedThemes || ['default'];
    
      document.querySelectorAll('#store-themes .btn-buy').forEach(btn => {
        const themeId = btn.dataset.id;
        const price = parseInt(btn.dataset.price);
    
        if (themeId === selected) {
          btn.textContent = 'Seçildi';
          btn.disabled = true;
          btn.style.background = 'var(--accent)';
          btn.style.color = 'white';
        } else if (owned.includes(themeId) || price === 0) {
          btn.textContent = 'Seç';
          btn.disabled = false;
          btn.style.background = 'var(--surface)';
          btn.style.color = 'var(--neon-green)';
        } else {
          const canAfford = this.authManager.getCoins() >= price;
          btn.textContent = canAfford ? 'Al' : 'Yetersiz';
          btn.disabled = !canAfford;
          btn.style.background = '';
          btn.style.color = '';
        }
      });
    },

    setCosmetic(category, cosmeticId) {
      if (!COSMETICS[category] || !COSMETICS[category][cosmeticId]) return;
      localStorage.setItem(`selectedCosmetic:${category}`, cosmeticId);
    },

    getSelectedCosmetic(category) {
      const selected = localStorage.getItem(`selectedCosmetic:${category}`) || 'classic';
      if (!COSMETICS[category] || !COSMETICS[category][selected]) return 'classic';
      const owned = this.authManager.userData?.ownedCosmetics?.[category] || ['classic'];
      const price = COSMETICS[category][selected].price || 0;
      return owned.includes(selected) || price === 0 ? selected : 'classic';
    },

    getBombEffectStyle() {
      return COSMETICS.bombEffect[this.getSelectedCosmetic('bombEffect')] || COSMETICS.bombEffect.classic;
    },

    updateStoreCosmeticsUI() {
      const ownedCosmetics = this.authManager.userData?.ownedCosmetics || {};
      document.querySelectorAll('#store-bomb-effects .btn-buy').forEach(btn => {
        const category = btn.dataset.category;
        const cosmeticId = btn.dataset.id;
        const price = parseInt(btn.dataset.price || '0', 10);
    
        const selected = this.getSelectedCosmetic(category);
        const owned = ownedCosmetics[category] || ['classic'];
        const isOwned = owned.includes(cosmeticId) || price === 0;
    
        if (cosmeticId === selected) {
          btn.textContent = 'Seçildi';
          btn.disabled = true;
          btn.style.background = 'var(--accent)';
          btn.style.color = 'white';
        } else if (isOwned) {
          btn.textContent = 'Seç';
          btn.disabled = false;
          btn.style.background = 'var(--surface)';
          btn.style.color = 'var(--neon-green)';
        } else {
          const canAfford = this.authManager.getCoins() >= price;
          btn.textContent = canAfford ? 'Al' : 'Yetersiz';
          btn.disabled = !canAfford;
          btn.style.background = '';
          btn.style.color = '';
        }
      });
    },

    updatePowerUpUI() {
      const bombEl = document.getElementById('count-bomb');
      const rotateEl = document.getElementById('count-rotate');
      const skipEl = document.getElementById('count-skip');
    
      if (bombEl) bombEl.textContent = this.powerUps.bomb;
      if (rotateEl) rotateEl.textContent = this.powerUps.rotate;
      if (skipEl) skipEl.textContent = this.powerUps.skip;
    
      const bombBtn = document.getElementById('btn-bomb');
      const rotateBtn = document.getElementById('btn-rotate');
      const skipBtn = document.getElementById('btn-skip');
      if (bombBtn) bombBtn.classList.toggle('empty', this.powerUps.bomb <= 0);
      if (rotateBtn) rotateBtn.classList.toggle('empty', this.powerUps.rotate <= 0);
      if (skipBtn) skipBtn.classList.toggle('empty', this.powerUps.skip <= 0);
    
      if (this.bombMode) document.getElementById('btn-bomb').classList.add('active');
      else document.getElementById('btn-bomb').classList.remove('active');
    },

    openQuickShop(focusType = 'bomb') {
      const modal = document.getElementById('quick-shop-modal');
      const itemsEl = document.getElementById('quick-shop-items');
      const balanceEl = document.getElementById('quick-shop-balance');
      const statusEl = document.getElementById('quick-shop-status');
      const coinPanel = document.getElementById('quick-shop-coin-panel');
      if (!modal || !itemsEl) return;
    
      const items = [
        { type: 'bomb', icon: 'B', name: 'Bomba', desc: 'Satır ve sütunu temizler.', price: 280 },
        { type: 'rotate', icon: 'R', name: 'Döndür', desc: 'Parçaları çevirir.', price: 150 },
        { type: 'skip', icon: 'P', name: 'Pas Geç', desc: 'Yeni parçalar getirir.', price: 220 },
      ];
      const ordered = [...items].sort((a, b) => (a.type === focusType ? -1 : 0) + (b.type === focusType ? 1 : 0));
      if (balanceEl) balanceEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
      if (statusEl) statusEl.textContent = '';
      if (coinPanel) coinPanel.innerHTML = '';
      itemsEl.innerHTML = ordered.map(item => `
        <div class="quick-shop-item ${item.type === focusType ? 'focused' : ''}">
          <div class="quick-shop-icon">${item.icon}</div>
          <div>
            <div class="quick-shop-name">${item.name}</div>
            <span class="quick-shop-desc">${item.desc}</span>
          </div>
          <button class="quick-shop-buy" data-type="${item.type}" data-price="${item.price}">${item.price} coin</button>
        </div>
      `).join('');
    
      itemsEl.querySelectorAll('.quick-shop-buy').forEach(btn => {
        btn.onclick = async () => {
          const type = btn.dataset.type;
          const price = parseInt(btn.dataset.price, 10);
          btn.disabled = true;
          const coinsReady = await this.flushPendingCoinsForShop();
          if (balanceEl) balanceEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
          if (!coinsReady) {
            if (statusEl) statusEl.textContent = 'Coinler hazırlanamadı. Biraz sonra tekrar dene.';
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 500);
            btn.disabled = false;
            return;
          }
          if (this.authManager.getCoins() < price) {
            if (statusEl) statusEl.textContent = 'Coin yetersiz.';
            this.showQuickShopCoinPanel(price - this.authManager.getCoins());
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 500);
            btn.disabled = false;
            return;
          }
          const success = await this.authManager.buyPowerUp(type, price);
          if (success) {
            this.powerUps[type] = (this.powerUps[type] || 0) + 1;
            this.updateCoinDisplays();
            this.updatePowerUpUI();
            if (balanceEl) balanceEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
            if (statusEl) statusEl.textContent = 'Alındı. Oyuna devam edebilirsin.';
            this.audio.pickup();
          } else if (statusEl) {
            const shortage = price - this.authManager.getCoins();
            statusEl.textContent = shortage > 0 ? 'Coin yetersiz.' : 'Satın alma tamamlanamadı. Tekrar dene.';
            if (shortage > 0) this.showQuickShopCoinPanel(shortage);
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 500);
          }
          btn.disabled = false;
        };
      });
    
      this.showQuickShopCoinPanel(0);
      modal.classList.remove('hidden');
    },

    showQuickShopCoinPanel(shortage = 0) {
      const panel = document.getElementById('quick-shop-coin-panel');
      const statusEl = document.getElementById('quick-shop-status');
      if (!panel) return;
    
      const packs = [
        { product: 'blockbattle_coins_500', amount: '500', price: '₺19,99' },
        { product: 'blockbattle_coins_1500', amount: '1.500', price: '₺49,99' },
        { product: 'blockbattle_coins_5000', amount: '5.000', price: '₺129,99' },
      ];
    
      const shortageText = shortage > 0
        ? `<small>Bu alışveriş için ${Math.ceil(shortage).toLocaleString('tr-TR')} coin eksik.</small>`
        : '<small>Oyundan çıkmadan coin ekle.</small>';
    
      panel.innerHTML = `
        <div class="quick-shop-coin-head">
          <strong>Coin Ekle</strong>
          ${shortageText}
        </div>
        <div class="quick-shop-coin-packs">
          ${packs.map(pack => `
            <button class="quick-shop-coin-pack" type="button" data-quick-iap-product="${pack.product}">
              <span>${pack.amount} Coin</span>
              <b>${pack.price}</b>
            </button>
          `).join('')}
        </div>
      `;
    
      panel.classList.remove('hidden');
    
      panel.querySelectorAll('[data-quick-iap-product]').forEach(btn => {
        btn.onclick = async () => {
          if (statusEl) statusEl.textContent = 'Satın alma penceresi açılıyor...';
          const originalHtml = btn.innerHTML;
          btn.disabled = true;
          if (this.iap) {
            await this.iap.purchase(btn.dataset.quickIapProduct, null);
          } else if (statusEl) {
            statusEl.textContent = 'Gerçek ödeme Android uygulamasında açılır.';
          }
          btn.disabled = false;
          btn.innerHTML = originalHtml;
          if (statusEl) statusEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin bakiyen var.`;
          const balanceEl = document.getElementById('quick-shop-balance');
          if (balanceEl) balanceEl.textContent = `${this.authManager.getCoins().toLocaleString('tr-TR')} coin`;
        };
      });
    },

    closeQuickShop() {
      const modal = document.getElementById('quick-shop-modal');
      if (modal) modal.classList.add('hidden');
    },

    toggleBombMode() {
      if (this.powerUps.bomb <= 0) return;
      this.bombMode = !this.bombMode;
      if (!this.bombMode) this.clearBombPreview();
      this.updatePowerUpUI();
    }
  });
}
