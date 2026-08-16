export class Game {
  constructor() {
    this.GRID_SIZE = 9;
    this.grid = [];
    this.pieces = [];
    this.score = 0;
    this.combo = 0;
    this.highScore = 0;
    this.state = 'menu';
    this.mode = 'solo';
    this.onlineMode = 'score';
    this.canvas = null;
    this.ctx = null;
    this.canvasRect = null;
    this.opponentCanvas = null;
    this.opponentCtx = null;
    this.cellSize = 48;
    this.gridOffset = { x: 6, y: 6 };
    this.opponentBoard = null;
    this.opponentScore = 0;
    this.opponentUid = null;
    this.opponentUsername = 'Rakip';
    this.onlineMatchRecorded = false;
    this.gameCompletionRecorded = false;
    this.gameOverHandled = false;
    this.opponentCellSize = 18;
    this.opponentBoardDirty = true;
    this.timerRemaining = 0;
    this.targetScore = 1000;
    this.onlineLocked = false;
    this.onlineTimer = null;
    this.levels = this.createLevels();
    this.currentLevel = null;
    this.levelProgressKey = 'blockBattleUnlockedLevel';
    this.unlockedLevel = 1;
    this.ghost = null;
    this.animatingClear = false;
    this.rng = null;
    this.seed = Date.now();
    this.blockSetIndex = 0;
  
    // Performance: Mobile detection
    this.isMobile = this.detectMobile();
    this.particlesEnabled = true;
  
    this.renderer = new Renderer(this);
    this.input = new InputHandler(this);
    this.audio = new AudioManager();
    this.audio.enabled = localStorage.getItem('blockBattleSound') !== '0';
    this.network = new NetworkManager(this);
    this.authManager = new AuthManager();
    this.dbManager = new DatabaseManager();
    this.ad = new AdManager(this);
    this.iap = window.IapManager ? new IapManager(this) : null;
    this.lastTime = 0;
    this.nativeBackHandlerRegistered = false;
    this.rewardContinueUsed = false;
    this.rewardBombs = 0;
    this.pendingRoomJoinStarted = false;
    this.gameBootTimer = null;
    this._pendingCoins = 0;
    this._rafId = null;
    this.currentScreenId = 'login-screen';
    this.screenHistory = [];
    this.lastExitBackAt = 0;
    this.dailyRewards = [100, 200, 300, 400, 500, 600, 700];
    this.avatarPresets = this.createAvatarPresets();
    this.boardBackgroundImage = null;
    this.boardBackgroundSrc = localStorage.getItem(this.getBoardBackgroundStorageKey()) || localStorage.getItem('blockBattleBoardBackground') || '';
  
    // Performance: dirty rendering flags
    this.renderDirty = true;
    this._lastTimerDisplay = '';
    this.powerUps = {
      bomb: 1,
      rotate: 2,
      skip: 1
    };
    this.bombMode = false;
    this.bombPreviewCell = null;
  }
}
