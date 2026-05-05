// BLOCK BATTLE - Network Manager (Socket.IO)

class NetworkManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.connected = false;
    this.roomId = null;
    this.gameMode = null;
    this.matchType = null;
    this.connectPromise = null;
    this.actionPending = false;
    this.connectToken = 0;
    this.roomCreateTimer = null;
    this.lastConnectError = null;
  }

  setWaitingMode(type) {
    const quickInfo = document.getElementById('quick-waiting-info');
    const roomCode = document.getElementById('room-code-wrap');
    const actions = document.getElementById('room-share-actions');
    const title = document.getElementById('waiting-title');
    const subtitle = document.getElementById('waiting-subtitle');
    const isQuick = type === 'quick';
    const isConnecting = type === 'connecting';
    const modeLabel = this.gameMode === 'time'
      ? 'Zamana Karşı: 90 saniye sonunda yüksek skor kazanır.'
      : 'Skor Yarışı: 1000 puana ilk ulaşan kazanır.';

    if (quickInfo) quickInfo.classList.toggle('hidden', !isQuick);
    if (roomCode) roomCode.classList.toggle('hidden', isQuick || isConnecting);
    if (actions) actions.classList.toggle('hidden', isQuick || isConnecting);
    if (title) title.textContent = isQuick ? 'Rakip Bekleniyor...' : isConnecting ? 'Bağlanıyor...' : 'Oda Hazır';
    if (subtitle) {
      subtitle.textContent = isConnecting
        ? 'Sunucuya bağlanılıyor. Lütfen bekle.'
        : isQuick
          ? `${modeLabel} Uygun rakip aranıyor.`
          : `${modeLabel} Oda kodunu arkadaşınla paylaş.`;
    }
  }

  setOnlineButtonsBusy(isBusy) {
    this.actionPending = isBusy;
    ['btn-quick-match', 'btn-create-room', 'btn-join-room'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = isBusy;
    });
  }

  connect() {
    if (this.connected || (this.socket && this.socket.connected)) {
      this.connected = true;
      return Promise.resolve();
    }

    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return this.waitUntilConnected(10000);
    }

    if (typeof io === 'undefined' || typeof io !== 'function') {
      console.error('Socket.IO yüklenemedi. io tip:', typeof io);
      throw new Error('Socket.IO kütüphanesi hazır değil.');
    }

    try {
      this.socket = io(this.getServerUrl(), {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 900,
        reconnectionDelayMax: 3000,
        randomizationFactor: 0.4,
        timeout: 20000,
      });
    } catch (err) {
      console.error('Socket bağlantı hatası:', err);
      throw new Error('Sunucuya bağlanılamadı: ' + err.message);
    }

    this.socket.on('connect', () => {
      this.connected = true;
      this.lastConnectError = null;
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Disconnected');
    });

    this.socket.on('connect_error', (err) => {
      this.lastConnectError = err && err.message ? err.message : 'unknown';
      console.error('Socket connect_error:', err);
    });

    this.socket.on('room-created', (data) => {
      clearTimeout(this.roomCreateTimer);
      this.setOnlineButtonsBusy(false);
      this.roomId = data.roomId;
      this.matchType = 'room';
      this.setWaitingMode('room');
      document.getElementById('room-code-display').textContent = data.roomId;
      const copyCode = document.getElementById('btn-copy-code');
      const copyLink = document.getElementById('btn-copy-link');
      if (copyCode) copyCode.disabled = false;
      if (copyLink) copyLink.disabled = false;
      this.game.showScreen('waiting-screen');
    });

    this.socket.on('quick-queued', () => {
      this.setOnlineButtonsBusy(false);
      this.setWaitingMode('quick');
      this.game.showScreen('waiting-screen');
    });

    this.socket.on('match-found', (data) => {
      this.setOnlineButtonsBusy(false);
      this.roomId = data.roomId;
      this.matchType = data.matchType || this.matchType || 'room';
      this.game.startOnlineGame(data.seed, data.mode, data.timeLimit, data.targetScore);
      this.sendPlayerInfo();
    });

    this.socket.on('opponent-info', (data) => {
      this.game.setOnlineOpponent(data);
    });

    this.socket.on('opponent-update', (data) => {
      this.game.opponentBoard = data.board;
      this.game.opponentScore = data.score;
      const el = document.getElementById('opponent-score-value');
      if (el) el.textContent = data.score;
    });

    this.socket.on('opponent-gameover', () => {
      this.game.onOpponentGameOver();
    });

    this.socket.on('opponent-left', () => {
      this.game.onOpponentLeft();
    });

    this.socket.on('timer-sync', (data) => {
      this.game.timerRemaining = data.remaining;
      if (this.game.onlineMode === 'time') this.game.updateTimerDisplay();
    });

    this.socket.on('game-time-up', () => {
      this.game.onTimeUp();
    });
    this.socket.on('game-finished', () => {
      if (this.game.onlineMode === 'time') this.game.onTimeUp();
    });

    this.socket.on('error', (data) => {
      this.setOnlineButtonsBusy(false);
      alert(data.message || 'Bir hata olustu');
      this.game.showScreen('online-screen');
    });

    return this.waitUntilConnected(25000);
  }

  getServerUrl() {
    const productionServer = 'https://blockbattle.onrender.com';
    const overrideServer = window.localStorage ? window.localStorage.getItem('blockBattleServerUrl') : '';
    if (overrideServer) return overrideServer;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return productionServer;
    }
    if (window.location.protocol === 'file:') {
      return productionServer;
    }
    const host = window.location.hostname;
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (isLocal) {
      const useLocalServer = new URLSearchParams(window.location.search).get('server') === 'local';
      return useLocalServer ? 'http://localhost:3001' : productionServer;
    }
    return window.location.origin;
  }

  isNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  waitUntilConnected(timeout = 25000) {
    if (this.connected || (this.socket && this.socket.connected)) {
      this.connected = true;
      return Promise.resolve();
    }
    if (this.connectPromise) return this.connectPromise;

    const token = ++this.connectToken;
    this.connectPromise = new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.connectPromise = null;
        if (!this.socket) return;
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
      };
      const onConnect = () => {
        if (token !== this.connectToken) return;
        this.connected = true;
        cleanup();
        resolve();
      };
      const onError = (err) => {
        if (token !== this.connectToken) return;
        console.warn('Socket connection waiting:', err.message);
      };
      const timer = setTimeout(() => {
        if (token !== this.connectToken) return;
        cleanup();
        if (this.socket && !this.socket.connected) {
          this.socket.disconnect();
          this.socket = null;
          this.connected = false;
        }
        const reason = this.lastConnectError ? ` (${this.lastConnectError})` : '';
        reject(new Error(`Sunucu bağlantısı zaman aşımına uğradı${reason}.`));
      }, timeout);

      this.socket.once('connect', onConnect);
      this.socket.on('connect_error', onError);
    });

    return this.connectPromise;
  }

  async createRoom(mode) {
    if (this.actionPending) return;
    try {
      this.setOnlineButtonsBusy(true);
      this.gameMode = mode;
      this.setWaitingMode('connecting');
      const roomCode = document.getElementById('room-code-display');
      if (roomCode) roomCode.textContent = '----';
      this.game.showScreen('waiting-screen');
      const health = await this.checkServerHealth();
      if (!health.ok) throw new Error(health.message || 'Sunucu şu an ulaşılamıyor.');
      await this.connect();
      this.matchType = 'room';
      this.socket.emit('create-room', { mode });
      this.startRoomCreateTimeout();
    } catch (err) {
      this.setOnlineButtonsBusy(false);
      alert('Oda oluşturulamadı: ' + (err.message || 'Sunucuya bağlanılamadı. Birazdan tekrar dene.'));
      this.game.showScreen('online-screen');
    }
  }

  startRoomCreateTimeout() {
    clearTimeout(this.roomCreateTimer);
    this.roomCreateTimer = setTimeout(() => {
      if (!this.actionPending || this.roomId) return;
      this.setOnlineButtonsBusy(false);
      this.leaveRoom();
      alert('Oda oluşturulamadı: Sunucu geç cevap verdi. Birkaç saniye sonra tekrar dene.');
      this.game.showScreen('online-screen');
    }, 25000);
  }

  async joinRoom(roomId) {
    if (this.actionPending) return;
    try {
      this.setOnlineButtonsBusy(true);
      const health = await this.checkServerHealth();
      if (!health.ok) throw new Error(health.message || 'Sunucu şu an ulaşılamaz.');
      await this.connect();
      this.matchType = 'room';
      this.socket.emit('join-room', { roomId: roomId.toUpperCase() });
    } catch (err) {
      this.setOnlineButtonsBusy(false);
      alert('Odaya katılamadı: ' + (err.message || 'Sunucuya bağlanılamadı. Birazdan tekrar dene.'));
    }
  }

  async quickMatch(mode) {
    if (this.actionPending) return;
    try {
      this.setOnlineButtonsBusy(true);
      this.gameMode = mode;
      this.setWaitingMode('quick');
      this.game.showScreen('waiting-screen');
      const health = await this.checkServerHealth();
      if (!health.ok) throw new Error(health.message || 'Sunucu şu an ulaşılamaz.');
      await this.connect();
      this.matchType = 'quick';
      this.socket.emit('quick-match', { mode });
    } catch (err) {
      this.setOnlineButtonsBusy(false);
      alert('Hızlı maç başlatılamadı: ' + (err.message || 'Sunucuya bağlanılamadı. Birazdan tekrar dene.'));
      this.game.showScreen('online-screen');
    }
  }

  sendBoardUpdate(board, score) {
    if (!this.socket || !this.roomId) return;
    const safeBoard = this.toCompactBoard(board);
    if (!safeBoard) return;
    this.socket.emit('board-update', {
      board: safeBoard,
      score,
      uid: this.game.authManager.user ? this.game.authManager.user.uid : null,
      username: this.game.authManager.getUsername ? this.game.authManager.getUsername() : 'Oyuncu',
    });
  }

  toCompactBoard(board) {
    if (!Array.isArray(board) || board.length !== 9) return null;
    return board.map(row => {
      if (!Array.isArray(row) || row.length !== 9) return new Array(9).fill(0);
      return row.map(v => {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        const iv = Math.trunc(n);
        return iv >= 0 && iv <= 9 ? iv : 0;
      });
    });
  }

  sendPlayerInfo() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('player-info', {
      uid: this.game.authManager.user ? this.game.authManager.user.uid : null,
      username: this.game.authManager.getUsername ? this.game.authManager.getUsername() : 'Oyuncu',
    });
  }

  sendGameOver() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('player-gameover');
  }

  sendPlayerLocked() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('player-locked');
  }

  leaveRoom() {
    clearTimeout(this.roomCreateTimer);
    if (this.socket) {
      this.socket.emit('leave-room');
      if (!this.socket.connected) {
        this.socket.disconnect();
        this.socket = null;
      }
    }
    this.connectToken++;
    this.connectPromise = null;
    this.connected = !!(this.socket && this.socket.connected);
    this.roomId = null;
    this.matchType = null;
    this.setOnlineButtonsBusy(false);
  }

  getRoomLink() {
    if (this.isNativeApp()) {
      return `blockbattle://join?room=${encodeURIComponent(this.roomId)}`;
    }
    const serverUrl = this.getServerUrl();
    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const base = window.location.protocol === 'file:' || isLocalHost ? serverUrl : window.location.origin;
    return `${base}?room=${this.roomId}`;
  }

  async checkServerHealth() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return { ok: true };
    }
    const base = this.getServerUrl().replace(/\/+$/, '');
    const healthUrl = `${base}/health?t=${Date.now()}`;
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) {
        return { ok: false, message: `Sunucu hata döndü (${response.status}).` };
      }
      const json = await response.json().catch(() => null);
      if (!json || json.ok !== true) {
        return { ok: false, message: 'Sunucu hazır değil.' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, message: 'Sunucuya erişilemedi. Bağlantını kontrol et.' };
    }
  }
}
