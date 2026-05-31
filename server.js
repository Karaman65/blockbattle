// ═══════════════════════════════════════════
//  BLOCK BATTLE — Server (Express + Socket.IO)
// ═══════════════════════════════════════════

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const NATIVE_ORIGINS = new Set([
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'https://localhost',
]);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (NATIVE_ORIGINS.has(origin)) return true;
  return ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error('CORS blocked'));
    }
  }
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|css|js)$/.test(filePath) || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  },
}));

app.get(['/privacy', '/privacy.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/health', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.status(200).json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

// ── Room Management ──

const rooms = new Map();
const waitingQueues = { score: [], time: [] };

const RATE_LIMITS = {
  'board-update': { windowMs: 1000, limit: 25 },
  'player-info': { windowMs: 5000, limit: 12 },
  'quick-match': { windowMs: 10000, limit: 8 },
  'join-room': { windowMs: 10000, limit: 12 },
  'create-room': { windowMs: 10000, limit: 6 },
};

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(id) ? generateRoomId() : id;
}

function createRateLimiter() {
  return new Map();
}

function isRateLimited(socket, eventName) {
  const cfg = RATE_LIMITS[eventName];
  if (!cfg) return false;
  if (!socket._rateLimitState) socket._rateLimitState = createRateLimiter();
  const now = Date.now();
  const state = socket._rateLimitState.get(eventName) || { count: 0, resetAt: now + cfg.windowMs };
  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + cfg.windowMs;
  }
  state.count++;
  socket._rateLimitState.set(eventName, state);
  return state.count > cfg.limit;
}

function sanitizeBoard(board) {
  if (!Array.isArray(board) || board.length !== 9) return null;
  const safe = [];
  for (let r = 0; r < 9; r++) {
    const row = board[r];
    if (!Array.isArray(row) || row.length !== 9) return null;
    const safeRow = [];
    for (let c = 0; c < 9; c++) {
      const v = Number(row[c]);
      if (!Number.isFinite(v)) return null;
      const intVal = Math.trunc(v);
      safeRow.push(intVal >= 0 && intVal <= 9 ? intVal : 0);
    }
    safe.push(safeRow);
  }
  return safe;
}

function validateScoreTransition(previous, next, mode) {
  const nextScore = Number(next);
  if (!Number.isFinite(nextScore)) return false;
  const normalized = Math.trunc(nextScore);
  if (normalized < 0) return false;
  const maxAllowed = mode === 'time' ? 40000 : 25000;
  if (normalized > maxAllowed) return false;
  if (typeof previous !== 'number') return true;
  if (normalized < previous) return false;
  const delta = normalized - previous;
  return delta <= 500;
}

class GameRoom {
  constructor(id, mode, matchType = 'room') {
    this.id = id;
    this.mode = mode; // 'score' or 'time'
    this.matchType = matchType; // 'room' or 'quick'
    this.players = [];
    this.state = 'waiting'; // waiting, playing, finished
    this.seed = Math.floor(Math.random() * 2147483646) + 1;
    this.timeLimit = mode === 'time' ? 90 : 0;
    this.targetScore = mode === 'score' ? 1000 : 0;
    this.timer = null;
    this.startTime = null;
  }

  addPlayer(socket) {
    this.players.push({
      socket,
      id: socket.id,
      uid: null,
      username: 'Oyuncu',
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
      matchType: this.matchType,
      timeLimit: this.timeLimit,
      targetScore: this.targetScore,
    };

    for (const p of this.players) {
      p.socket.emit('match-found', { roomId: this.id, ...data });
    }

    // Start timer for timed mode
    if (this.mode === 'time') {
      let remaining = this.timeLimit;
      io.to(this.id).emit('timer-sync', { remaining });
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
    if (isRateLimited(socket, 'create-room')) return;
    removeFromQueues(socket);
    handleDisconnect(socket);
    const roomId = generateRoomId();
    const room = new GameRoom(roomId, data.mode || 'score', 'room');
    room.addPlayer(socket);
    rooms.set(roomId, room);
    socket.emit('room-created', { roomId });
    console.log(`Room created: ${roomId} (${data.mode})`);
  });

  socket.on('join-room', (data) => {
    if (isRateLimited(socket, 'join-room')) return;
    removeFromQueues(socket);
    if (!data || typeof data.roomId !== 'string' || data.roomId.trim().length < 4) {
      socket.emit('error', { message: 'Geçersiz oda kodu.' });
      return;
    }
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
    if (isRateLimited(socket, 'quick-match')) return;
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
      const room = new GameRoom(roomId, mode, 'quick');
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
    if (isRateLimited(socket, 'board-update')) return;
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      const safeBoard = sanitizeBoard(data.board);
      if (!safeBoard) return;
      if (!validateScoreTransition(player.score, data.score, room.mode)) {
        console.warn(`Suspicious score from ${socket.id} in room ${room.id}`);
        socket.emit('error', { message: 'Geçersiz skor güncellemesi algılandı.' });
        return;
      }
      player.score = Math.trunc(Number(data.score));
      player.board = safeBoard;
      if (data.uid) player.uid = data.uid;
      if (data.username) player.username = data.username;
    }

    const opponent = room.getOpponent(socket.id);
    if (opponent) {
      opponent.socket.emit('opponent-update', {
        board: player ? player.board : null,
        score: player ? player.score : 0,
        uid: data.uid,
        username: data.username,
      });
    }
  });

  socket.on('player-info', (data) => {
    if (isRateLimited(socket, 'player-info')) return;
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.uid = data.uid || player.uid;
      player.username = data.username || player.username;
    }

    const opponent = room.getOpponent(socket.id);
    if (opponent) {
      opponent.socket.emit('opponent-info', {
        uid: player ? player.uid : null,
        username: player ? player.username : 'Oyuncu',
      });
      if (opponent.uid) {
        socket.emit('opponent-info', {
          uid: opponent.uid,
          username: opponent.username || 'Oyuncu',
        });
      }
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

  socket.on('player-locked', () => {
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.gameOver = true;

    if (room.players.length >= 2 && room.players.every(p => p.gameOver)) {
      io.to(room.id).emit('game-finished');
      io.to(room.id).emit('game-time-up');
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
