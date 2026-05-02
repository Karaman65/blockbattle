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
  }

  setWaitingMode(type) {
    const quickInfo = document.getElementById('quick-waiting-info');
    const roomCode = document.getElementById('room-code-wrap');
    const actions = document.getElementById('room-share-actions');
    const title = document.getElementById('waiting-title');
    const isQuick = type === 'quick';
    const isConnecting = type === 'connecting';

    if (quickInfo) quickInfo.classList.toggle('hidden', !isQuick);
    if (roomCode) roomCode.classList.toggle('hidden', isQuick || isConnecting);
    if (actions) actions.classList.toggle('hidden', isQuick || isConnecting);
    if (title) title.textContent = isQuick ? 'Rakip Bekleniyor...' : isConnecting ? 'Baglaniyor...' : 'Oda Hazir';
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
      console.error('Socket.IO yuklenemedi. io tip:', typeof io);
      throw new Error('Socket.IO kutuphanesi hazir degil.');
    }

    try {
      this.socket = io(this.getServerUrl(), {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 600,
        timeout: 8000,
      });
    } catch (err) {
      console.error('Socket baglanti hatasi:', err);
      throw new Error('Sunucuya baglanilamadi: ' + err.message);
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
    });

    this.socket.on('game-time-up', () => {
      this.game.onTimeUp();
    });

    this.socket.on('error', (data) => {
      this.setOnlineButtonsBusy(false);
      alert(data.message || 'Bir hata olustu');
      this.game.showScreen('online-screen');
    });

    return this.waitUntilConnected(10000);
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

  waitUntilConnected(timeout = 10000) {
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
        reject(new Error('Sunucu baglantisi zaman asimina ugradi.'));
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
      this.setWaitingMode('connecting');
      const roomCode = document.getElementById('room-code-display');
      if (roomCode) roomCode.textContent = '----';
      this.game.showScreen('waiting-screen');
      await this.connect();
      this.gameMode = mode;
      this.matchType = 'room';
      this.socket.emit('create-room', { mode });
      this.startRoomCreateTimeout();
    } catch (err) {
      this.setOnlineButtonsBusy(false);
      alert('Oda olusturulamadi: ' + (err.message || 'Sunucuya baglanilamadi.'));
      this.game.showScreen('online-screen');
    }
  }

  startRoomCreateTimeout() {
    clearTimeout(this.roomCreateTimer);
    this.roomCreateTimer = setTimeout(() => {
      if (!this.actionPending || this.roomId) return;
      this.setOnlineButtonsBusy(false);
      this.leaveRoom();
      alert('Oda olusturulamadi: Sunucu cevap vermedi. Tekrar dene.');
      this.game.showScreen('online-screen');
    }, 10000);
  }

  async joinRoom(roomId) {
    if (this.actionPending) return;
    try {
      this.setOnlineButtonsBusy(true);
      await this.connect();
      this.matchType = 'room';
      this.socket.emit('join-room', { roomId: roomId.toUpperCase() });
    } catch (err) {
      this.setOnlineButtonsBusy(false);
      alert('Odaya katilamadi: ' + (err.message || 'Sunucuya baglanilamadi.'));
    }
  }

  async quickMatch(mode) {
    if (this.actionPending) return;
    try {
      this.setOnlineButtonsBusy(true);
      this.setWaitingMode('quick');
      this.game.showScreen('waiting-screen');
      await this.connect();
      this.gameMode = mode;
      this.matchType = 'quick';
      this.socket.emit('quick-match', { mode });
    } catch (err) {
      this.setOnlineButtonsBusy(false);
      alert('Hizli mac baslatilamadi: ' + (err.message || 'Sunucuya baglanilamadi.'));
      this.game.showScreen('online-screen');
    }
  }

  sendBoardUpdate(board, score) {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('board-update', {
      board,
      score,
      uid: this.game.authManager.user ? this.game.authManager.user.uid : null,
      username: this.game.authManager.getUsername ? this.game.authManager.getUsername() : 'Oyuncu',
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
    const base = window.location.protocol === 'file:' ? this.getServerUrl() : window.location.origin;
    return `${base}?room=${this.roomId}`;
  }
}
