// ═══════════════════════════════════════════
//  BLOCK BATTLE — Server (Express + Socket.IO)
// ═══════════════════════════════════════════

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { createPlayerState, canPlaceAny, applyAuthoritativeMove } = require('./server-game-core.js');

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'blockbattle1-c0f6f',
  });
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const MATCH_TICKET_SECRET = process.env.MATCH_TICKET_SECRET || '';

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
  maxHttpBufferSize: 32 * 1024,
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

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss:; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://www.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
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
  'player-action': { windowMs: 1000, limit: 12 },
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

const accountRateLimitState = new Map();

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
  if (state.count > cfg.limit) return true;

  const uid = socket.data && socket.data.uid;
  if (!uid) return true;
  const accountKey = `${uid}:${eventName}`;
  const accountState = accountRateLimitState.get(accountKey) || { count: 0, resetAt: now + cfg.windowMs };
  if (now > accountState.resetAt) {
    accountState.count = 0;
    accountState.resetAt = now + cfg.windowMs;
  }
  accountState.count++;
  accountRateLimitState.set(accountKey, accountState);
  if (accountRateLimitState.size > 10000) {
    for (const [key, value] of accountRateLimitState) {
      if (now > value.resetAt) accountRateLimitState.delete(key);
    }
  }
  return accountState.count > cfg.limit;
}

function normalizeMode(value) {
  return value === 'time' || value === 'score' ? value : null;
}

function sanitizeUsername(value) {
  const username = String(value || '').trim();
  if (!/^[\p{L}\p{N}_-]{3,16}$/u.test(username)) return 'Oyuncu';
  return username;
}

function safeOn(socket, eventName, handler) {
  socket.on(eventName, (...args) => {
    try {
      handler(...args);
    } catch (err) {
      console.error(`Socket event failed (${eventName})`, err);
      socket.emit('error', { message: 'Geçersiz istek.' });
    }
  });
}

function signMatchPayload(payload) {
  if (MATCH_TICKET_SECRET.length < 32) return '';
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', MATCH_TICKET_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
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
    this.cleanupTimer = null;
    this.startTime = null;
  }

  addPlayer(socket) {
    const gameState = createPlayerState(this.seed);
    this.players.push({
      socket,
      id: socket.id,
      uid: socket.data.uid,
      username: socket.data.username || 'Oyuncu',
      score: 0,
      board: gameState.grid.map(row => [...row]),
      ...gameState,
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
          this.finalizeByScores();
          io.to(this.id).emit('game-time-up');
        }
      }, 1000);
    }
  }

  finalizeByScores(forcedWinnerUid = null) {
    if (this.state === 'finished') return;
    this.state = 'finished';
    const [first, second] = this.players;
    let winnerUid = forcedWinnerUid;
    if (!winnerUid && first && second && first.score !== second.score) {
      winnerUid = first.score > second.score ? first.uid : second.uid;
    }
    const players = this.players.map(player => ({
      uid: player.uid,
      username: sanitizeUsername(player.username),
      score: Math.max(0, Math.trunc(Number(player.score) || 0)),
    }));
    const now = Math.floor(Date.now() / 1000);
    for (const player of this.players) {
      if (!player.uid) continue;
      const result = winnerUid == null ? 'draw' : winnerUid === player.uid ? 'win' : 'loss';
      const payload = {
        v: 1,
        matchId: `${this.id}-${this.startTime}`,
        roomId: this.id,
        uid: player.uid,
        mode: this.mode,
        matchType: this.matchType,
        result,
        winnerUid,
        players,
        iat: now,
        exp: now + 300,
      };
      const ticket = signMatchPayload(payload);
      if (ticket) player.socket.emit('match-result-ticket', { ticket });
    }
    this.cleanupTimer = setTimeout(() => this.cleanup(), 15000);
  }

  cleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.state = 'finished';
    rooms.delete(this.id);
  }
}

// ── Socket.IO Events ──

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token || typeof token !== 'string') return next(new Error('AUTH_REQUIRED'));
    const decoded = await getAuth().verifyIdToken(token);
    socket.data.uid = decoded.uid;
    socket.data.username = sanitizeUsername(decoded.name || 'Oyuncu');
    return next();
  } catch (err) {
    console.warn('Socket authentication rejected:', err.code || err.message);
    return next(new Error('AUTH_INVALID'));
  }
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id} (${socket.data.uid})`);

  safeOn(socket, 'create-room', (data = {}) => {
    if (isRateLimited(socket, 'create-room')) return;
    if (rooms.size >= 5000) {
      socket.emit('error', { message: 'Sunucu kapasitesi dolu. Biraz sonra tekrar dene.' });
      return;
    }
    const mode = normalizeMode(data.mode);
    if (!mode) {
      socket.emit('error', { message: 'Geçersiz oyun modu.' });
      return;
    }
    removeFromQueues(socket);
    handleDisconnect(socket);
    const roomId = generateRoomId();
    const room = new GameRoom(roomId, mode, 'room');
    room.addPlayer(socket);
    rooms.set(roomId, room);
    socket.emit('room-created', { roomId });
    console.log(`Room created: ${roomId} (${mode})`);
  });

  safeOn(socket, 'join-room', (data = {}) => {
    if (isRateLimited(socket, 'join-room')) return;
    removeFromQueues(socket);
    if (!data || typeof data.roomId !== 'string' || data.roomId.trim().length < 4) {
      socket.emit('error', { message: 'Geçersiz oda kodu.' });
      return;
    }
    const roomId = data.roomId.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(roomId)) {
      socket.emit('error', { message: 'Geçersiz oda kodu.' });
      return;
    }
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

  safeOn(socket, 'quick-match', (data = {}) => {
    if (isRateLimited(socket, 'quick-match')) return;
    const mode = normalizeMode(data.mode);
    if (!mode) {
      socket.emit('error', { message: 'Geçersiz oyun modu.' });
      return;
    }
    if (socket._roomId) handleDisconnect(socket);
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

  safeOn(socket, 'player-action', (data = {}) => {
    if (isRateLimited(socket, 'player-action')) return;
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.state !== 'playing') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const pieceIndex = Math.trunc(Number(data.pieceIndex));
    const row = Math.trunc(Number(data.row));
    const col = Math.trunc(Number(data.col));
    if (![pieceIndex, row, col].every(Number.isFinite)
        || pieceIndex < 0 || pieceIndex > 2 || row < -8 || row > 8 || col < -8 || col > 8
        || !applyAuthoritativeMove(player, pieceIndex, row, col)) {
      socket.emit('authoritative-state', {
        board: player.grid,
        score: player.score,
        pieces: player.pieces,
      });
      return;
    }
    player.board = player.grid.map(boardRow => [...boardRow]);
    player.uid = socket.data.uid;
    player.username = socket.data.username;

    socket.emit('authoritative-state', {
      board: player.board,
      score: player.score,
      pieces: player.pieces,
    });

    const opponent = room.getOpponent(socket.id);
    if (opponent) {
      opponent.socket.emit('opponent-update', {
        board: player.board,
        score: player.score,
        uid: player.uid,
        username: player.username,
      });
    }
    if (room.mode === 'score' && player.score >= room.targetScore) room.finalizeByScores(player.uid);
  });

  // Legacy clients may still emit snapshots. They are never accepted as score authority.
  safeOn(socket, 'board-update', () => {
    if (isRateLimited(socket, 'board-update')) return;
  });

  safeOn(socket, 'player-info', (data = {}) => {
    if (isRateLimited(socket, 'player-info')) return;
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.uid = socket.data.uid;
      player.username = sanitizeUsername(data.username || socket.data.username);
      socket.data.username = player.username;
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

  safeOn(socket, 'player-gameover', () => {
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || canPlaceAny(player.grid, player.pieces)) {
      socket.emit('authoritative-state', player ? {
        board: player.grid, score: player.score, pieces: player.pieces,
      } : {});
      return;
    }
    player.gameOver = true;

    const opponent = room.getOpponent(socket.id);
    if (opponent) {
      opponent.socket.emit('opponent-gameover');
    }

    if (room.mode === 'score' && room.state === 'playing') {
      const winnerUid = player && player.score >= room.targetScore ? player.uid : opponent?.uid;
      if (winnerUid) room.finalizeByScores(winnerUid);
    }

    // Check if both game over
    if (room.players.every(p => p.gameOver)) {
      room.finalizeByScores();
    }
  });

  safeOn(socket, 'player-locked', () => {
    const roomId = socket._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || canPlaceAny(player.grid, player.pieces)) {
      socket.emit('authoritative-state', player ? {
        board: player.grid, score: player.score, pieces: player.pieces,
      } : {});
      return;
    }
    player.gameOver = true;

    if (room.players.length >= 2 && room.players.every(p => p.gameOver)) {
      io.to(room.id).emit('game-finished');
      io.to(room.id).emit('game-time-up');
      room.finalizeByScores();
    }
  });

  safeOn(socket, 'leave-room', () => {
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
  if (!room) {
    socket.leave(roomId);
    socket._roomId = null;
    return;
  }

  const opponent = room.getOpponent(socket.id);
  if (opponent) {
    opponent.socket.emit('opponent-left');
    if (room.state === 'playing' && opponent.uid) room.finalizeByScores(opponent.uid);
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
if (process.env.NODE_ENV === 'production' && ALLOWED_ORIGINS.length === 0) {
  console.warn('WARNING: ALLOWED_ORIGINS is empty — all browser origins are allowed. Set ALLOWED_ORIGINS in production.');
}
server.listen(PORT, () => {
  console.log(`\n  ⚔️  Block Battle Server`);
  console.log(`  🌐 http://localhost:${PORT}\n`);
});
