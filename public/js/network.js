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
    
    if (typeof io === 'undefined') {
      console.error('Socket.IO yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
      alert('Online mod için internet bağlantısı gereklidir.');
      return;
    }

    try {
      // Capacitor ortamında varsayılan olarak localhost'a bağlanmaya çalışır, 
      // Sunucu başka bir yerdeyse buraya tam URL yazılmalıdır.
      let serverUrl = '';
      if (window.location.origin.includes('capacitor') || (window.location.hostname === 'localhost' && !window.location.port)) {
         // Telefondan girildiğini varsayıyoruz ama sunucu URL'si bilinmiyor.
         // Local IP veya public domain kullanılmalı. Boş bırakırsak çalışmayabilir ama en azından çökmeyecek.
      }
      this.socket = serverUrl ? io(serverUrl) : io();
    } catch(err) {
      console.error('Socket bağlantı hatası:', err);
      alert('Sunucuya bağlanılamadı.');
      return;
    }

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Disconnected');
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
    this.gameMode = mode;
    this.socket.emit('create-room', { mode });
  }

  joinRoom(roomId) {
    this.socket.emit('join-room', { roomId: roomId.toUpperCase() });
  }

  quickMatch(mode) {
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
