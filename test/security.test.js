const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('socket server authenticates Firebase users and does not trust client uid', () => {
  const server = read('server.js');
  assert.match(server, /verifyIdToken\(token\)/);
  assert.match(server, /player\.uid = socket\.data\.uid/);
  assert.doesNotMatch(server, /player\.uid = data\.uid/);
});

test('Firestore blocks client economy, username and match writes', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /allow create: if false;/);
  assert.match(rules, /match \/usernames\/\{usernameKey\}[\s\S]*allow read, write: if false;/);
  assert.match(rules, /match \/matches\/\{matchId\}[\s\S]*allow write: if false;/);
});

test('client-controlled economy endpoints stay disabled', () => {
  const functions = read('functions/index.js');
  assert.match(functions, /exports\.economyStartGame/);
  assert.match(functions, /exports\.economyFinishGame/);
  assert.match(functions, /exports\.economyGrantCoins[\s\S]*Uygulamayı güncelleyin/);
  assert.match(functions, /createHash\('sha256'\)\.update\(purchaseToken\)/);
});

test('untrusted leaderboard and match names are escaped before HTML rendering', () => {
  const game = read('public/js/game.js');
  assert.match(game, /const safeName = this\.escapeHtml\(entry\.username/);
  assert.match(game, /const safeOpponent = this\.escapeHtml\(oppName\)/);
  assert.doesNotMatch(game, /\$\{entry\.username\}/);
  assert.doesNotMatch(game, /vs \$\{oppName\}/);
});
