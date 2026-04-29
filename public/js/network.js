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
  }

  connect() {
    if (this.socket) return;
    
    if (typeof io === 'undefined' || typeof io !== 'function') {
      console.error('Socket.IO yüklenemedi. io tip:', typeof io);
      throw new Error('Socket.IO kütüphanesi hazır değil.');
    }

    try {
      // Capacitor veya canlı web ortamı için Render sunucusunu kullan.
      // Yerel geliştirmede sayfanın açıldığı porttaki Socket.IO sunucusuna bağlan.
      let serverUrl = 'https://blockbattle.onrender.com';
      const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      if (isLocal) {
        serverUrl = window.location.origin;
      }
      this.socket = io(serverUrl, { transports: ['websocket', 'polling'] });
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
  }

  createRoom(mode) {
    if (!this.socket) {
      alert('Soket bağlantısı kurulamadı. Lütfen tekrar bağlanmayı deneyin.');
      return;
    }
    this.gameMode = mode;
    this.socket.emit('create-room', { mode });
  }

  joinRoom(roomId) {
    if (!this.socket) { alert('Soket bağlantı hatası.'); return; }
    this.socket.emit('join-room', { roomId: roomId.toUpperCase() });
  }

  quickMatch(mode) {
    if (!this.socket) { alert('Soket bağlantı hatası.'); return; }
    if (!this.connected) {
      alert('Sunucuya bağlanılıyor, lütfen 1-2 saniye sonra tekrar dene.');
      return;
    }
    this.gameMode = mode;
    this.socket.emit('quick-match', { mode });
    this.game.showScreen('waiting-screen');
    document.getElementById('room-code-display').textContent = 'HIZLI';
    const copyCode = document.getElementById('btn-copy-code');
    const copyLink = document.getElementById('btn-copy-link');
    if (copyCode) copyCode.disabled = true;
    if (copyLink) copyLink.disabled = true;
    document.getElementById('room-info').classList.add('hidden');
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
    return `${window.location.origin}?room=${this.roomId}`;
  }
}
