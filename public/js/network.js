// ═══════════════════════════════════════════
//  BLOCK BATTLE — Network Manager (Socket.IO)
// ═══════════════════════════════════════════

class NetworkManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.connected = false;
    this.roomId = null;
    this.gameMode = null; // 'score' or 'time'
    this.connectPromise = null;
  }

  setWaitingMode(type) {
    const quickInfo = document.getElementById('quick-waiting-info');
    const roomCode = document.getElementById('room-code-wrap');
    const actions = document.getElementById('room-share-actions');
    const title = document.getElementById('waiting-title');
    const isQuick = type === 'quick';
    if (quickInfo) quickInfo.classList.toggle('hidden', !isQuick);
    if (roomCode) roomCode.classList.toggle('hidden', isQuick);
    if (actions) actions.classList.toggle('hidden', isQuick);
    if (title) title.textContent = isQuick ? 'Rakip Bekleniyor...' : 'Oda Hazır';
  }

  connect() {
    if (this.connected) return Promise.resolve();
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return this.waitUntilConnected();
    }
    
    if (typeof io === 'undefined' || typeof io !== 'function') {
      console.error('Socket.IO yüklenemedi. io tip:', typeof io);
      throw new Error('Socket.IO kütüphanesi hazır değil.');
    }

    try {
      this.socket = io(this.getServerUrl(), {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 20000,
      });
    } catch(err) {
      console.error('Socket bağlantı hatası:', err);
      throw new Error('Sunucuya bağlanılamadı: ' + err.message);
    }

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connect_error:', err);
      // alert('Bağlantı hatası: ' + err.message); // Yorum satırına alıyoruz sürekli uyarı vermesin
    });

    this.socket.on('room-created', (data) => {
      this.roomId = data.roomId;
      this.setWaitingMode('room');
      document.getElementById('room-code-display').textContent = data.roomId;
      const copyCode = document.getElementById('btn-copy-code');
      const copyLink = document.getElementById('btn-copy-link');
      if (copyCode) copyCode.disabled = false;
      if (copyLink) copyLink.disabled = false;
      this.game.showScreen('waiting-screen');
    });

    this.socket.on('match-found', (data) => {
      this.roomId = data.roomId;
      this.game.startOnlineGame(data.seed, data.mode, data.timeLimit, data.targetScore);
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
    });

    this.socket.on('game-time-up', () => {
      this.game.onTimeUp();
    });

    this.socket.on('error', (data) => {
      alert(data.message || 'Bir hata oluştu');
      this.game.showScreen('online-screen');
    });

    return this.waitUntilConnected();
  }

  getServerUrl() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return 'https://blockbattle.onrender.com';
    }
    if (window.location.protocol === 'file:') {
      return 'https://blockbattle.onrender.com';
    }
    const host = window.location.hostname;
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (isLocal) {
      const port = window.location.port;
      if (port === '3001' || port === '3000') return window.location.origin;
      return 'http://localhost:3001';
    }
    return window.location.origin;
  }

  waitUntilConnected(timeout = 30000) {
    if (this.connected || (this.socket && this.socket.connected)) {
      this.connected = true;
      return Promise.resolve();
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      let lastError = null;
      const cleanup = () => {
        clearTimeout(timer);
        this.connectPromise = null;
        if (!this.socket) return;
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
      };
      const onConnect = () => {
        this.connected = true;
        cleanup();
        resolve();
      };
      const onError = (err) => {
        lastError = err;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Sunucu bağlantısı zaman aşımına uğradı.'));
      }, timeout);

      this.socket.once('connect', onConnect);
      this.socket.on('connect_error', onError);
    });

    return this.connectPromise;
  }

  async createRoom(mode) {
    try {
      await this.connect();
      this.gameMode = mode;
      this.socket.emit('create-room', { mode });
    } catch (err) {
      alert('Oda olusturulamadi: ' + (err.message || 'Sunucuya baglanilamadi.'));
    }
  }

  async joinRoom(roomId) {
    try {
      await this.connect();
      this.socket.emit('join-room', { roomId: roomId.toUpperCase() });
    } catch (err) {
      alert('Odaya katilamadi: ' + (err.message || 'Sunucuya baglanilamadi.'));
    }
  }

  async quickMatch(mode) {
    try {
      await this.connect();
      this.gameMode = mode;
      this.socket.emit('quick-match', { mode });
      this.setWaitingMode('quick');
      this.game.showScreen('waiting-screen');
    } catch (err) {
      alert('Hizli mac baslatilamadi: ' + (err.message || 'Sunucuya baglanilamadi.'));
    }
  }

  sendBoardUpdate(board, score) {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('board-update', { board, score });
  }

  sendGameOver() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('player-gameover');
  }

  leaveRoom() {
    if (this.socket && this.roomId) {
      this.socket.emit('leave-room');
      this.roomId = null;
    }
  }

  getRoomLink() {
    const base = window.location.protocol === 'file:' ? this.getServerUrl() : window.location.origin;
    return `${base}?room=${this.roomId}`;
  }
}
