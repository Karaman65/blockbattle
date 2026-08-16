export function applyOnline(Game) {
  Object.assign(Game.prototype, {
    handlePendingRoomLink() {
      if (!this._pendingRoom) return false;
      if (this.pendingRoomJoinStarted) return true;
      this.pendingRoomJoinStarted = true;
      const roomCode = this._pendingRoom.trim().toUpperCase();
      this._pendingRoom = null;
      this.showScreen('online-screen');
      const input = document.getElementById('room-code-input');
      if (input) input.value = roomCode;
      setTimeout(() => {
        this.network.joinRoom(roomCode).finally(() => {
          this.pendingRoomJoinStarted = false;
        });
      }, 250);
      return true;
    },

    setupDeepLinks() {
      const app = window.Capacitor?.Plugins?.App;
      if (!app) return;
    
      const handleUrl = (url) => {
        const roomCode = this.getRoomCodeFromUrl(url);
        if (!roomCode) return;
        this._pendingRoom = roomCode;
        if (this.authManager && this.authManager.user) this.handlePendingRoomLink();
        else this.showScreen('login-screen');
      };
    
      if (typeof app.getLaunchUrl === 'function') {
        app.getLaunchUrl().then(data => {
          if (data && data.url) handleUrl(data.url);
        }).catch(() => { });
      }
    
      if (typeof app.addListener === 'function') {
        app.addListener('appUrlOpen', data => {
          if (data && data.url) handleUrl(data.url);
        });
      }
    },

    getRoomCodeFromUrl(url) {
      if (!url) return '';
      try {
        const parsed = new URL(url);
        const room = parsed.searchParams.get('room');
        return room ? room.trim().toUpperCase() : '';
      } catch (err) {
        const match = String(url).match(/[?&]room=([^&]+)/i);
        return match ? decodeURIComponent(match[1]).trim().toUpperCase() : '';
      }
    },

    setOnlineOpponent(data) {
      if (!data) return;
      if (data.uid) this.opponentUid = data.uid;
      if (data.username) this.opponentUsername = data.username;
    },

    async recordOnlineMatchResult(won) {
      if (this.onlineMatchRecorded || this.mode !== 'online') return;
      if (!this.authManager.user) return;
      const myUid = this.authManager.user.uid;
      const matchType = this.network.matchType === 'quick' ? 'quick' : 'room';
      const opponentUid = this.opponentUid || '';
      const shouldWriteMatch = !!opponentUid && (won === true || (won === null && myUid < opponentUid));
      this.onlineMatchRecorded = true;
      await this.dbManager.recordOnlineMatch({
        matchType,
        mode: this.onlineMode || this.network.gameMode || 'score',
        roomId: this.network.roomId || '',
        currentUid: myUid,
        writeMatch: shouldWriteMatch,
        result: won === true ? 'win' : won === false ? 'loss' : 'draw',
        player1: {
          uid: myUid,
          username: this.authManager.getUsername(),
          score: this.score,
        },
        player2: {
          uid: opponentUid,
          username: this.opponentUsername || 'Rakip',
          score: this.opponentScore || 0,
        },
        winnerUid: won === true ? myUid : won === false ? opponentUid : null,
      });
      await this.authManager.loadUserData();
      this.updatePlayerHeader();
    },

    startOnlineGame(seed, mode, timeLimit, targetScore) {
      this.audio.init(); this.audio.resume();
      this.mode = 'online'; this.onlineMode = mode; this.state = 'playing'; this.score = 0; this.combo = 0; this.animatingClear = false;
      this.rewardContinueUsed = false; this.rewardBombs = 0;
      this.seed = seed; this.rng = new SeededRandom(seed); this.blockSetIndex = 0;
      this.timerRemaining = timeLimit || 90; this.targetScore = targetScore || 1000;
      this.opponentBoard = null; this.opponentScore = 0; this.opponentBoardDirty = true;
      this.onlineLocked = false;
      this.opponentUid = null; this.opponentUsername = 'Rakip'; this.onlineMatchRecorded = false;
      this.gameCompletionRecorded = false; this.gameOverHandled = false;
      this.resetGrid(); this.generatePieces();
      const tray = document.getElementById('piece-tray');
      if (tray) tray.classList.remove('locked');
      this.resetPowerUps();
      document.getElementById('opponent-board-wrap').classList.remove('hidden');
      document.getElementById('opponent-score-box').classList.remove('hidden');
      document.getElementById('opponent-score-value').textContent = '0';
      this.stopOnlineTimer();
      if (mode === 'time') {
        document.getElementById('timer-box').classList.remove('hidden');
        this.updateTimerDisplay();
        // Timer driven by server timer-sync / game-time-up (no local countdown).
      } else {
        document.getElementById('timer-box').classList.add('hidden');
      }
      this.updateLevelBadge();
      this.updateScoreDisplay();
      this.enterGameScreen(this.onlineMode === 'time' ? 'Zamana karşı' : 'Skor yarışı', 'Rakip alanı bağlanıyor');
    },

    stopOnlineTimer() {
      if (this.onlineTimer) {
        clearInterval(this.onlineTimer);
        this.onlineTimer = null;
      }
    },

    onOnlineLocked() {
      if (this.onlineLocked) return;
      this.onlineLocked = true;
      this.network.sendPlayerLocked();
      const tray = document.getElementById('piece-tray');
      if (tray) tray.classList.add('locked');
      const status = this.onlineMode === 'time'
        ? 'Hamlen kalmadı. Süre bitince sonuç açıklanacak.'
        : 'Hamlen kalmadı. Rakip de kilitlenirse veya 1000 puana ulaşılırsa maç bitecek.';
      this.showGameStatus(status);
    },

    onOpponentGameOver() {
      this.stopOnlineTimer();
      if (this.onlineMode === 'score' && this.opponentScore >= this.targetScore) {
        this.state = 'gameover';
        this.audio.gameOver();
        this.recordCompletedGame(false);
        this.recordOnlineMatchResult(false);
        this.authManager.addCoins(25, 'online_loss').then(() => this.updateCoinDisplays());
        this.showGameOverScreen(false, `Rakip ${this.targetScore} puana ulaştı. ${this.score} - ${this.opponentScore}`);
        return;
      }
      this.state = 'gameover';
      this.audio.win();
      this.vibrate([30, 35, 55]);
      this.recordCompletedGame(true);
      this.recordOnlineMatchResult(true);
      this.authManager.addCoins(100, 'online_win').then(() => this.updateCoinDisplays());
      this.showGameOverScreen(true, 'Rakip kaybetti! Kazandın!');
    },

    onOpponentLeft() {
      if (this.state === 'playing') {
        this.stopOnlineTimer();
        this.state = 'gameover';
        this.vibrate([30, 35, 55]);
        this.recordCompletedGame(true);
        this.recordOnlineMatchResult(true);
        this.authManager.addCoins(100, 'online_win').then(() => this.updateCoinDisplays());
        this.showGameOverScreen(true, 'Rakip ayrıldı. Kazandın!');
      }
    },

    onTimeUp() {
      if (this.state !== 'playing' || this.gameOverHandled) return;
      this.gameOverHandled = true;
      this.stopOnlineTimer();
      this.state = 'gameover';
      const won = this.score > this.opponentScore; const tied = this.score === this.opponentScore;
      if (won) {
        this.audio.win();
        this.vibrate([30, 35, 55]);
        this.recordCompletedGame(true);
        this.recordOnlineMatchResult(true);
        this.authManager.addCoins(100, 'online_win').then(() => this.updateCoinDisplays());
        this.showGameOverScreen(true, `Kazandın! ${this.score} - ${this.opponentScore}`);
      }
      else if (tied) {
        this.recordCompletedGame(false);
        this.recordOnlineMatchResult(null);
        this.authManager.addCoins(50, 'online_draw').then(() => this.updateCoinDisplays());
        this.showGameOverScreen(false, `Berabere! ${this.score} - ${this.opponentScore}`);
      }
      else {
        this.audio.gameOver();
        this.recordCompletedGame(false);
        this.recordOnlineMatchResult(false);
        this.authManager.addCoins(25, 'online_loss').then(() => this.updateCoinDisplays());
        this.showGameOverScreen(false, `Kaybettin! ${this.score} - ${this.opponentScore}`);
      }
    }
  });
}
