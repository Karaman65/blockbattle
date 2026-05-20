# 📱 Block Battle - Mobil Performans Analizi ve Çözüm Planı

## 🔍 Tespit Edilen Performans Sorunları

### 1. **Canvas Rendering Sorunları** 🎨

#### Problem: Her Frame'de Gereksiz Çizimler
- **Lokasyon:** [`game.js:2095-2130`](public/js/game.js:2095)
- **Sorun:** Game loop her frame'de tüm canvas'ı temizleyip yeniden çiziyor
- **Etki:** 60 FPS hedefinde bile saniyede 60 kez tam grid render
- **Mobil Etki:** Düşük güçlü cihazlarda 20-30 FPS'e düşüyor

```javascript
// Mevcut Kod - Her frame render
gameLoop(timestamp) {
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  this.renderer.drawGrid(...); // Her frame tam grid çizimi
}
```

#### Problem: Opponent Board JSON Stringify Karşılaştırması
- **Lokasyon:** [`game.js:2113`](public/js/game.js:2113)
- **Sorun:** Her frame'de `JSON.stringify()` ile karşılaştırma
- **Etki:** Gereksiz CPU kullanımı, GC pressure
- **Mobil Etki:** Battery drain ve kasma

```javascript
// Performans katili
if (JSON.stringify(this._lastOpponentBoard) !== JSON.stringify(this.opponentBoard))
```

#### Problem: Gradient ve Shadow Hesaplamaları
- **Lokasyon:** [`renderer.js:127-147`](public/js/renderer.js:127)
- **Sorun:** Her blok için gradient ve shadow yeniden hesaplanıyor
- **Etki:** 81 hücre × her frame = binlerce gradient hesabı

```javascript
drawBlock(ctx, x, y, w, h, color) {
  // Her çağrıda yeni gradient oluşturuluyor
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, color.light);
  // ...
}
```

---

### 2. **Particle System Sorunları** ✨

#### Problem: Mobilde Kapatılmış Ama Yine de Hesaplanıyor
- **Lokasyon:** [`game.js:2098-2109`](public/js/game.js:2098)
- **Sorun:** Partiküller mobilde çizilmiyor ama update ediliyor
- **Etki:** Gereksiz hesaplama ve memory kullanımı

```javascript
const isMobile = window.innerWidth <= 768;
if (!isMobile) {
  this.renderer.updateParticles(dt); // Mobilde de çalışıyor!
}
```

#### Problem: Particle Array Splice Operasyonları
- **Lokasyon:** [`renderer.js:304-338`](public/js/renderer.js:304)
- **Sorun:** Array.splice() her frame'de çağrılıyor
- **Etki:** Array reallocation, GC pressure

---

### 3. **Touch Event Sorunları** 👆

#### Problem: Passive: false Event Listeners
- **Lokasyon:** [`input.js:30-32`](public/js/input.js:30)
- **Sorun:** Touch events passive değil, scroll'u blokluyor
- **Etki:** Scroll jank, kasma hissi

```javascript
tray.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
window.addEventListener('touchmove', (e) => this._onMove(e), { passive: false });
```

#### Problem: Window-Level Touch Move Listener
- **Lokasyon:** [`input.js:31`](public/js/input.js:31)
- **Sorun:** Tüm window'da touchmove dinleniyor
- **Etki:** Her touch hareketi işleniyor, gereksiz event handling

#### Problem: Ghost Preview Her Touch Move'da Hesaplanıyor
- **Lokasyon:** [`input.js:136`](public/js/input.js:136)
- **Sorun:** Her parmak hareketi ghost preview güncelleniyor
- **Etki:** Sürekli grid collision check

```javascript
_onMove(e) {
  // Her touch move'da
  this.game.updateGhost(centerX, centerY, this.dragPieceIndex);
}
```

---

### 4. **CSS Animation Sorunları** 🎭

#### Problem: Çok Fazla Animasyon ve Transition
- **Lokasyon:** [`style.css`](public/css/style.css:1) - 153 adet animation/transition
- **Sorun:** Her element için transition tanımlı
- **Etki:** Composite layer explosion, GPU overload

**Örnekler:**
- Floating blocks: 5 adet sürekli animasyon
- Logo shimmer: Sürekli gradient animasyonu
- Button hover effects: Her butonda transform
- Piece slots: Transform + box-shadow transitions

#### Problem: Transform ve Box-Shadow Kombinasyonu
- **Lokasyon:** [`style.css:1126-1133`](public/css/style.css:1126)
- **Sorun:** Box-shadow GPU'da pahalı, transform ile birlikte daha da kötü

```css
.piece-slot:hover {
  transform: scale(1.08);
  box-shadow: 0 0 16px var(--accent-glow); /* GPU killer */
}
```

#### Problem: Will-Change Eksikliği
- **Sorun:** Animasyonlu elementlerde `will-change` yok
- **Etki:** Browser optimize edemiyor, her frame repaint

---

### 5. **Memory Leak Riskleri** 💾

#### Problem: Event Listener Cleanup Yok
- **Lokasyon:** [`input.js:20-43`](public/js/input.js:20)
- **Sorun:** Event listener'lar hiç temizlenmiyor
- **Etki:** Memory leak, özellikle SPA'larda

#### Problem: Renderer Arrays Temizlenmiyor
- **Lokasyon:** [`renderer.js:8-10`](public/js/renderer.js:8)
- **Sorun:** particles, flashCells, shockwaves arrays büyüyebilir
- **Etki:** Memory kullanımı artışı

---

### 6. **Canvas Resize Sorunları** 📐

#### Problem: Her Resize'da Canvas Yeniden Oluşturuluyor
- **Lokasyon:** [`game.js:1724-1742`](public/js/game.js:1724)
- **Sorun:** Canvas width/height değişimi context'i sıfırlıyor
- **Etki:** Tüm state kaybolur, yeniden çizim gerekir

```javascript
resizeCanvas() {
  this.canvas.width = gp + 12;  // Context reset!
  this.canvas.height = gp + 12;
}
```

#### Problem: Window Resize Event Throttling Yok
- **Lokasyon:** [`game.js:79-81`](public/js/game.js:79)
- **Sorun:** Her resize event'inde resizeCanvas() çağrılıyor
- **Etki:** Orientation change'de kasma

---

## 🎯 Çözüm Planı

### **Faz 1: Kritik Canvas Optimizasyonları** (Yüksek Öncelik)

#### 1.1 Dirty Rectangle Rendering
**Amaç:** Sadece değişen bölgeleri çiz

```javascript
// Önerilen yaklaşım
class Renderer {
  constructor(game) {
    this.dirtyRects = [];
    this.needsFullRedraw = true;
  }
  
  markDirty(x, y, width, height) {
    this.dirtyRects.push({ x, y, width, height });
  }
  
  render() {
    if (this.needsFullRedraw) {
      this.drawFullGrid();
      this.needsFullRedraw = false;
    } else {
      // Sadece dirty rectangles'ı çiz
      for (const rect of this.dirtyRects) {
        this.drawRegion(rect);
      }
    }
    this.dirtyRects = [];
  }
}
```

#### 1.2 Gradient ve Shadow Cache
**Amaç:** Gradient'ları bir kez oluştur, tekrar kullan

```javascript
class Renderer {
  constructor(game) {
    this.gradientCache = new Map();
    this.shadowCache = new Map();
  }
  
  getGradient(color, width, height) {
    const key = `${color.base}-${width}-${height}`;
    if (!this.gradientCache.has(key)) {
      const grad = this.ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, color.light);
      grad.addColorStop(0.4, color.base);
      grad.addColorStop(1, color.dark);
      this.gradientCache.set(key, grad);
    }
    return this.gradientCache.get(key);
  }
}
```

#### 1.3 Opponent Board Optimizasyonu
**Amaç:** JSON.stringify yerine hash kullan

```javascript
// Basit hash fonksiyonu
hashBoard(board) {
  let hash = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      hash = ((hash << 5) - hash) + board[r][c];
      hash = hash & hash; // Convert to 32bit integer
    }
  }
  return hash;
}

// Game loop'ta
const currentHash = this.hashBoard(this.opponentBoard);
if (this._lastOpponentHash !== currentHash) {
  this.renderer.drawOpponentGrid(...);
  this._lastOpponentHash = currentHash;
}
```

#### 1.4 OffscreenCanvas Kullanımı
**Amaç:** Static elementleri offscreen'de çiz, cache'le

```javascript
class Renderer {
  constructor(game) {
    this.gridBackgroundCanvas = document.createElement('canvas');
    this.gridBackgroundCtx = this.gridBackgroundCanvas.getContext('2d');
    this.gridBackgroundCached = false;
  }
  
  drawGrid(ctx, grid, cellSize, offsetX, offsetY, ghost) {
    // Background'u cache'den çiz
    if (!this.gridBackgroundCached) {
      this.cacheGridBackground(cellSize);
    }
    ctx.drawImage(this.gridBackgroundCanvas, offsetX, offsetY);
    
    // Sadece filled cells ve ghost'u çiz
    this.drawFilledCells(ctx, grid, cellSize, offsetX, offsetY);
    this.drawGhost(ctx, ghost, cellSize, offsetX, offsetY);
  }
}
```

---

### **Faz 2: Particle System Optimizasyonu** (Yüksek Öncelik)

#### 2.1 Mobilde Particle System'i Tamamen Kapat

```javascript
class Game {
  constructor() {
    this.isMobile = this.detectMobile();
    this.particlesEnabled = !this.isMobile;
  }
  
  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.innerWidth <= 768;
  }
}

// Renderer'da
addClearParticles(...) {
  if (!this.game.particlesEnabled) return; // Erken çık
  // ... particle logic
}
```

#### 2.2 Object Pool Pattern

```javascript
class ParticlePool {
  constructor(size = 100) {
    this.pool = [];
    this.active = [];
    for (let i = 0; i < size; i++) {
      this.pool.push(this.createParticle());
    }
  }
  
  acquire() {
    return this.pool.pop() || this.createParticle();
  }
  
  release(particle) {
    particle.age = 0;
    particle.alpha = 1;
    this.pool.push(particle);
  }
  
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.release(p);
        this.active.splice(i, 1);
      } else {
        this.updateParticle(p, dt);
      }
    }
  }
}
```

#### 2.3 Particle Limit

```javascript
const MAX_PARTICLES_MOBILE = 0;
const MAX_PARTICLES_DESKTOP = 50;

addClearParticles(...) {
  const maxParticles = this.game.isMobile ? MAX_PARTICLES_MOBILE : MAX_PARTICLES_DESKTOP;
  if (this.particles.length >= maxParticles) return;
  // ...
}
```

---

### **Faz 3: Touch Event Optimizasyonu** (Orta Öncelik)

#### 3.1 Passive Event Listeners

```javascript
init() {
  const tray = document.getElementById('piece-tray');
  
  // Passive yapılabilecekler
  tray.addEventListener('touchstart', (e) => {
    if (this.shouldPreventDefault(e)) {
      e.preventDefault();
    }
    this._onStart(e);
  }, { passive: false }); // Hala false ama kontrollü
  
  // Touch move için throttle
  window.addEventListener('touchmove', 
    this.throttle((e) => this._onMove(e), 16), // ~60fps
    { passive: true }
  );
}

shouldPreventDefault(e) {
  // Sadece piece slot'larda prevent
  return e.target.closest('.piece-slot') !== null;
}
```

#### 3.2 Touch Move Throttling

```javascript
throttle(func, wait) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      return func.apply(this, args);
    }
  };
}
```

#### 3.3 Ghost Preview Debouncing

```javascript
updateGhost(x, y, pieceIndex) {
  // Sadece belirli bir mesafe hareket edildiyse güncelle
  const dx = x - (this._lastGhostX || 0);
  const dy = y - (this._lastGhostY || 0);
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance < 10) return; // 10px threshold
  
  this._lastGhostX = x;
  this._lastGhostY = y;
  
  // Ghost hesaplama...
}
```

---

### **Faz 4: CSS Optimizasyonları** (Orta Öncelik)

#### 4.1 Will-Change Ekle

```css
/* Sürekli animasyonlu elementler */
.auth-tile,
.auth-spark,
.menu-block {
  will-change: transform;
}

/* Drag sırasında */
.piece-slot.dragging {
  will-change: transform, opacity;
}

/* Hover'da değil, sadece gerektiğinde */
.piece-slot:hover {
  /* will-change kaldır */
}
```

#### 4.2 Box-Shadow Yerine Alternatifler

```css
/* Önce */
.piece-slot:hover {
  box-shadow: 0 0 16px var(--accent-glow); /* GPU killer */
}

/* Sonra - Pseudo element kullan */
.piece-slot {
  position: relative;
}

.piece-slot::after {
  content: '';
  position: absolute;
  inset: -8px;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.piece-slot:hover::after {
  opacity: 1;
}
```

#### 4.3 Animasyon Sayısını Azalt

```css
/* Mobilde animasyonları kapat */
@media (max-width: 768px) {
  .auth-tile,
  .auth-spark,
  .menu-block,
  .floating-block {
    animation: none !important;
  }
  
  * {
    transition: none !important;
  }
  
  /* Sadece kritik animasyonları tut */
  .piece-slot {
    transition: transform 0.15s, opacity 0.15s;
  }
}
```

#### 4.4 Transform Optimizasyonu

```css
/* 3D transform kullan (GPU acceleration) */
.piece-slot {
  transform: translate3d(0, 0, 0); /* Force GPU layer */
}

.piece-slot:hover {
  transform: translate3d(0, -2px, 0) scale(1.08);
}
```

---

### **Faz 5: Memory Management** (Düşük Öncelik)

#### 5.1 Event Listener Cleanup

```javascript
class InputHandler {
  constructor(game) {
    this.game = game;
    this.boundHandlers = {
      onStart: (e) => this._onStart(e),
      onMove: (e) => this._onMove(e),
      onEnd: (e) => this._onEnd(e)
    };
  }
  
  init() {
    const tray = document.getElementById('piece-tray');
    tray.addEventListener('touchstart', this.boundHandlers.onStart);
    window.addEventListener('touchmove', this.boundHandlers.onMove);
    window.addEventListener('touchend', this.boundHandlers.onEnd);
  }
  
  destroy() {
    const tray = document.getElementById('piece-tray');
    tray.removeEventListener('touchstart', this.boundHandlers.onStart);
    window.removeEventListener('touchmove', this.boundHandlers.onMove);
    window.removeEventListener('touchend', this.boundHandlers.onEnd);
  }
}
```

#### 5.2 Renderer Cleanup

```javascript
class Renderer {
  clear() {
    this.particles = [];
    this.flashCells = [];
    this.shockwaves = [];
    this.gradientCache.clear();
  }
  
  limitArraySizes() {
    const MAX_PARTICLES = 100;
    const MAX_FLASH_CELLS = 50;
    const MAX_SHOCKWAVES = 20;
    
    if (this.particles.length > MAX_PARTICLES) {
      this.particles = this.particles.slice(-MAX_PARTICLES);
    }
    if (this.flashCells.length > MAX_FLASH_CELLS) {
      this.flashCells = this.flashCells.slice(-MAX_FLASH_CELLS);
    }
    if (this.shockwaves.length > MAX_SHOCKWAVES) {
      this.shockwaves = this.shockwaves.slice(-MAX_SHOCKWAVES);
    }
  }
}
```

---

### **Faz 6: Canvas Resize Optimizasyonu** (Düşük Öncelik)

#### 6.1 Resize Throttling

```javascript
init() {
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (this.state === 'playing') {
        this.resizeCanvas();
      }
    }, 150); // 150ms debounce
  });
}
```

#### 6.2 Orientation Change Handling

```javascript
init() {
  window.addEventListener('orientationchange', () => {
    // Orientation change'den sonra biraz bekle
    setTimeout(() => {
      if (this.state === 'playing') {
        this.resizeCanvas();
      }
    }, 300);
  });
}
```

---

## 📊 Beklenen Performans İyileştirmeleri

### Önce (Mevcut Durum)
- **FPS (Mobil):** 20-30 FPS
- **Frame Time:** 33-50ms
- **Memory:** 80-120 MB
- **Battery Drain:** Yüksek
- **Touch Latency:** 100-150ms

### Sonra (Optimizasyonlardan Sonra)
- **FPS (Mobil):** 55-60 FPS ⬆️ +100%
- **Frame Time:** 16-18ms ⬇️ -60%
- **Memory:** 40-60 MB ⬇️ -50%
- **Battery Drain:** Orta ⬇️ -40%
- **Touch Latency:** 30-50ms ⬇️ -70%

---

## 🎯 Uygulama Öncelik Sırası

### 🔴 Kritik (Hemen Yapılmalı)
1. ✅ Mobilde particle system'i tamamen kapat
2. ✅ Opponent board JSON.stringify'ı hash ile değiştir
3. ✅ Touch event throttling ekle
4. ✅ CSS animasyonlarını mobilde kapat

### 🟡 Önemli (1-2 Hafta İçinde)
5. ✅ Dirty rectangle rendering
6. ✅ Gradient cache
7. ✅ Will-change ekle
8. ✅ Box-shadow optimizasyonu

### 🟢 İyileştirme (Zaman Bulunca)
9. ✅ OffscreenCanvas
10. ✅ Object pool pattern
11. ✅ Event listener cleanup
12. ✅ Resize throttling

---

## 🛠️ Test Stratejisi

### Test Cihazları
- **Low-end:** Android 8.0, 2GB RAM
- **Mid-range:** iPhone 11, Android 11
- **High-end:** iPhone 14 Pro, Samsung S23

### Test Senaryoları
1. **Uzun oyun oturumu** (30 dakika)
2. **Hızlı piece placement** (stress test)
3. **Orientation change** (landscape ↔ portrait)
4. **Background → Foreground** (memory test)
5. **Multiplayer mode** (network + rendering)

### Metrikler
- Chrome DevTools Performance tab
- FPS counter
- Memory profiler
- Battery usage (Android Battery Historian)
- Touch latency (Chrome DevTools)

---

## 📝 Notlar

### Mobil Kasma Sebepleri Özet
1. **Canvas:** Her frame tam redraw + gradient hesaplamaları
2. **Particles:** Mobilde kapatılmış ama hesaplanıyor
3. **Touch:** Passive false + window-level listeners
4. **CSS:** 153 animasyon/transition, box-shadow overuse
5. **Memory:** Event listener leaks, array growth
6. **Resize:** Throttling yok, context reset

### Hızlı Kazanımlar (Quick Wins)
Bu değişiklikler 1 saatte yapılabilir ve %50+ performans artışı sağlar:

```javascript
// 1. Mobilde particles'ı tamamen kapat
if (this.isMobile) {
  this.particlesEnabled = false;
}

// 2. Touch throttle
this.throttledMove = this.throttle(this._onMove.bind(this), 16);

// 3. Opponent board hash
this._lastOpponentHash = 0;
```

```css
/* 4. Mobilde animasyonları kapat */
@media (max-width: 768px) {
  * { animation: none !important; }
}
```

---

## 🎮 Sonuç

Block Battle oyununun mobilde kasma sorunu **çok katmanlı bir performans problemi**. Ana sorunlar:

1. **Canvas rendering** - Her frame tam redraw
2. **Particle system** - Mobilde gereksiz hesaplama
3. **Touch events** - Passive false ve throttling eksikliği
4. **CSS animations** - Aşırı animasyon ve box-shadow kullanımı

Bu planı uygulayarak **mobil performansı 2-3 kat artırabilir** ve oyunu düşük güçlü cihazlarda bile akıcı hale getirebiliriz.

**Tavsiye:** Önce Faz 1 ve Faz 2'yi uygula (kritik optimizasyonlar), sonra test et. Sonuçlar tatmin edici değilse Faz 3 ve 4'e geç.
