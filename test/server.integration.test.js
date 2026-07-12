const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const io = require('../public/js/socket.io.min.js');

const root = path.resolve(__dirname, '..');

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 6000);
    child.stdout.on('data', chunk => {
      if (!String(chunk).includes('Block Battle Server')) return;
      clearTimeout(timer);
      resolve();
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server exited early (${code})`));
    });
  });
}

test('health endpoint works and unauthenticated sockets are rejected', async (t) => {
  const port = 3200 + Math.floor(Math.random() * 500);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', ALLOWED_ORIGINS: origin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  await waitForServer(child);

  const response = await fetch(`${origin}/health`, { headers: { Origin: origin } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.ok(response.headers.get('content-security-policy'));

  await new Promise((resolve, reject) => {
    const socket = io(origin, { transports: ['websocket'], reconnection: false, timeout: 2000 });
    socket.on('connect', () => {
      socket.close();
      reject(new Error('unauthenticated socket unexpectedly connected'));
    });
    socket.on('connect_error', err => {
      socket.close();
      try {
        assert.equal(err.message, 'AUTH_REQUIRED');
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
});
