// Legacy entry: the game now boots from public/src/js/main.js.
if (!window.__blockBattleModuleBootRequested) {
  window.__blockBattleModuleBootRequested = true;
  import('../src/js/main.js');
}
