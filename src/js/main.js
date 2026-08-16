import { Game } from './state.js';
import { applyConfig } from './config.js';
import { applyDom } from './dom.js';
import { applyAuth } from './auth.js';
import { applyUi } from './ui.js';
import { applyStorage } from './storage.js';
import { applyTasks } from './tasks.js';
import { applyDatabase } from './database.js';
import { applyOnline } from './online.js';
import { applyBoard } from './board.js';
import { applyBlocks } from './blocks.js';
import { applyScoring } from './scoring.js';
import { applyShop } from './shop.js';
import { applyAudio } from './audio.js';

const installers = [
  applyConfig,
  applyDom,
  applyAuth,
  applyUi,
  applyStorage,
  applyTasks,
  applyDatabase,
  applyOnline,
  applyBoard,
  applyBlocks,
  applyScoring,
  applyShop,
  applyAudio
];

for (const install of installers) install(Game);

window.Game = Game;

function bootBlockBattle() {
  if (window._game) return;
  const game = new Game();
  window._game = game;
  game.init();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootBlockBattle, { once: true });
} else {
  bootBlockBattle();
}
