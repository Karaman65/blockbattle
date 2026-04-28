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
      // Capacitor veya normal web ortamı için her zaman Render sunucusunu kullan.
      // Sadece yerel geliştirme sırasında (localhost:3000) yereli kullan.
      let serverUrl = 'https://blockbattle.onrender.com';
      if (window.location.hostname === 'localhost' && window.location.port === '3000') {
         serverUrl = 'http://localhost:3000';
      }
      this.socket = io(serverUrl, { transports: ['websocket'] });
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
    this.gameMode = mode;
    this.socket.emit('quick-match', { mode });
    this.game.showScreen('waiting-screen');
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
