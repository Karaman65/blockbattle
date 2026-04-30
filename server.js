// ═══════════════════════════════════════════
//  BLOCK BATTLE — Server (Express + Socket.IO)
// ═══════════════════════════════════════════

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Room Management ──

const rooms = new Map();
const waitingQueues = { score: [], time: [] };

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(id) ? generateRoomId() : id;
}

class GameRoom {
  constructor(id, mode) {
    this.id = id;
    this.mode = mode; // 'score' or 'time'
    this.players = [];
    this.state = 'waiting'; // waiting, playing, finished
    this.seed = Math.floor(Math.random() * 2147483646) + 1;
    this.timeLimit = mode === 'score' ? 90 : 0;
    this.targetScore = mode === 'time' ? 1000 : 0;
    this.timer = null;
    this.startTime = null;
  }

  addPlayer(socket) {
    this.players.push({
      socket,
      id: socket.id,
      score: 0,
      board: null,
      gameOver: false,
    });
    socket.join(this.id);
    socket._roomId = this.id;
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.id !== socketId);
  }

  getOpponent(socketId) {
    return this.players.find(p => p.id !== socketId);
  }

  start() {
    this.state = 'playing';
    this.startTime = Date.now();

    const data = {
      seed: this.seed,
      mode: this.mode,
      timeLimit: this.timeLimit,
      targetScore: this.targetScore,
    };

    for (const p of this.players) {
      p.socket.emit('match-found', { roomId: this.id, ...data });
    }

    // Start timer for score mode
    if (this.mode === 'score') {
      let remaining = this.timeLimit;
      this.timer = setInterval(() => {
        remaining--;
        io.to(this.id).emit('timer-sync', { remaining });
        if (remaining <= 0) {
          clearInterval(this.timer);
          this.timer = null;
          this.state = 'finished';
          io.to(this.id).emit('game-time-up');
        }
      }, 1000);
    }
  }

  cleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state = 'finished';
    rooms.delete(this.id);
  }
}

// ── Socket.IO Events ──

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create-room', (data) => {
    removeFromQueues(socket);
    handleDisconnect(socket);
    const roomId = generateRoomId();
    const room = new GameRoom(roomId, data.mode || 'score');
    room.addPlayer(socket);
    rooms.set(roomId, room);
    socket.emit('room-created', { roomId });
    console.log(`Room created: ${roomId} (${data.mode})`);
  });

  socket.on('join-room', (data) => {
    removeFromQueues(socket);
    const roomId = data.roomId.toUpperCase();
    if (socket._roomId && socket._roomId !== roomId) handleDisconnect(socket);
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadı!' });
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Oda dolu veya oyun başlamış!' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Oda dolu!' });
      return;
    }

    room.addPlayer(socket);
    console.log(`Player joined room: ${roomId}`);

    if (room.players.length === 2) {
      room.start();
    }
  });

  socket.on('quick-match', (data) => {
    if (socket._roomId) handleDisconnect(socket);
    const mode = data.mode || 'score';
    const queue = waitingQueues[mode];

    // Remove stale entries
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!queue[i].connected || queue[i].id === socket.id) queue.splice(i, 1);
    }

    if (queue.length > 0) {
      const opponent = queue.shift();
      const roomId = generateRoomId();
      const room = new GameRoom(roomId, mode);
      room.addPlayer(opponent);
      room.addPlayer(socket);
      rooms.set(roomId, room);
      room.start();
      console.log(`Quick match: ${roomId}`);
    } else {
      queue.push(socket);
      socket.emit('quick-queued');
      console.log(`Player queued for ${mode}: ${socket.id}`);
    }
  });

  socket.on('board-update', (data) => {
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.score = data.score;
      player.board = data.board;
    }

    const opponent = room.getOpponent(socket.id);
    if (opponent) {
      opponent.socket.emit('opponent-update', {
        board: data.board,
        score: data.score,
      });
    }
  });

  socket.on('player-gameover', () => {
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.gameOver = true;

    const opponent = room.getOpponent(socket.id);
    if (opponent) {
      opponent.socket.emit('opponent-gameover');
    }

    // Check if both game over
    if (room.players.every(p => p.gameOver)) {
      room.cleanup();
    }
  });

  socket.on('leave-room', () => {
    removeFromQueues(socket);
    handleDisconnect(socket);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    removeFromQueues(socket);

    handleDisconnect(socket);
  });
});

function removeFromQueues(socket) {
  for (const mode of ['score', 'time']) {
    const queue = waitingQueues[mode];
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].id === socket.id) queue.splice(i, 1);
    }
  }
}

function handleDisconnect(socket) {
  const roomId = socket._roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  const opponent = room.getOpponent(socket.id);
  if (opponent) {
    opponent.socket.emit('opponent-left');
  }

  room.removePlayer(socket.id);
  socket.leave(roomId);
  socket._roomId = null;

  if (room.players.length === 0) {
    room.cleanup();
  }
}

// ── Start Server ──

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n  ⚔️  Block Battle Server`);
  console.log(`  🌐 http://localhost:${PORT}\n`);
});
