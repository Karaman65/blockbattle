export function applyDatabase(Game) {
  Object.assign(Game.prototype, {
    getPlayerPublicId() {
      const uid = this.authManager && this.authManager.user ? this.authManager.user.uid : '';
      const cleanUid = uid.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
      if (cleanUid) return `#BM${cleanUid}`;
      return '#BM789542';
    },

    async copyProfileId() {
      const btn = document.getElementById('profile-id-copy');
      const label = btn ? btn.querySelector('small') : null;
      const original = label ? label.textContent : 'Kopyala';
      try {
        await this.copyText(this.getPlayerPublicId());
        if (label) {
          label.textContent = 'Kopyalandı';
          setTimeout(() => { label.textContent = original; }, 1400);
        }
        if (this.showToast) this.showToast('Oyuncu ID kopyalandı.');
      } catch (err) {
        if (label) {
          label.textContent = 'Olmadı';
          setTimeout(() => { label.textContent = original; }, 1400);
        }
      }
    },

    async showLeaderboard() {
      if (!this.requireAccount('Sıralamayı görmek için giriş yap veya hesap oluştur.')) return;
      this.showScreen('leaderboard-screen');
      const list = document.getElementById('leaderboard-list');
      list.innerHTML = '<div class="leaderboard-loading"><div class="spinner-container"><div class="spinner spinner-sm"></div></div></div>';
      const data = await this.dbManager.getLeaderboard(20);
      if (data.length === 0) { list.innerHTML = '<p class="text-muted">Henüz skor yok</p>'; return; }
      const uid = this.authManager.user ? this.authManager.user.uid : '';
      const padded = data.slice();
      while (padded.length < 3) padded.push({ username: ['ProGamer', 'BlockKing', 'CubeNinja'][padded.length], highScore: [5420, 4892, 4201][padded.length], uid: `placeholder-${padded.length}` });
      const podium = [padded[1], padded[0], padded[2]];
      const rows = data.slice(3).map((entry, i) => {
        const rankVal = i + 1;
        const actualRank = i + 4;
        const meClass = entry.uid === uid ? ' me' : '';
        const crown = entry.isPremium ? ' <span class="premium-icon" title="Premium">VIP</span>' : '';
        return `
          <div class="leaderboard-item${meClass}">
            <span class="rank">#${actualRank}</span>
            <span class="leaderboard-avatar-mini">🎮</span>
            <div class="player-info">
              <span class="player-name">${entry.username}${crown}</span>
              <small>♕ ${entry.highScore} kupa</small>
            </div>
            <div class="player-score"><span>↗</span></div>
          </div>`;
      }).join('');
    
      list.innerHTML = `
        <div class="leaderboard-podium" aria-label="Top three players">
          <div class="podium-player second">
            <div class="podium-avatar">👑</div>
            <div class="podium-block"><strong>2</strong><b>${podium[0].username}</b><span>${podium[0].highScore}</span></div>
          </div>
          <div class="podium-player first">
            <div class="podium-crown">♛</div>
            <div class="podium-avatar">🏆</div>
            <div class="podium-block"><strong>1</strong><b>${podium[1].username}</b><span>${podium[1].highScore}</span></div>
          </div>
          <div class="podium-player third">
            <div class="podium-avatar">🥷</div>
            <div class="podium-block"><strong>3</strong><b>${podium[2].username}</b><span>${podium[2].highScore}</span></div>
          </div>
        </div>
        <div class="leaderboard-list">${rows || '<p class="text-muted">İlk 3 dışı oyuncu henüz yok</p>'}</div>`;
    },

    async showProfile() {
      if (!this.requireAccount('Profil ve maç geçmişi için giriş yap veya hesap oluştur.')) return;
      this.showScreen('profile-screen');
      await this.authManager.loadUserData();
      const d = this.authManager.userData || {};
      const username = this.authManager.getUsername ? this.authManager.getUsername() : (d.username || 'Oyuncu');
      const unlocked = this.unlockedLevel || this.getSavedUnlockedLevel();
      const totalGames = d.totalGames || 0;
      const highScore = d.highScore || this.highScore || 0;
      const xp = Math.max(0, highScore + ((unlocked - 1) * 350) + (totalGames * 75));
      const level = Math.max(1, Math.floor(xp / 500) + 1);
      const currentXp = xp % 500;
      const xpLeft = 500 - currentXp;
      document.getElementById('profile-username').textContent = username;
      const profileId = `ID: ${this.getPlayerPublicId()}`;
      document.getElementById('profile-email').textContent = profileId;
      const premiumBadge = document.getElementById('profile-premium-badge');
      if (premiumBadge) premiumBadge.classList.toggle('hidden', !(this.authManager.isPremium && this.authManager.isPremium()));
      const profileLevelPill = document.getElementById('profile-level-pill');
      const profileLevelTitle = document.getElementById('profile-level-title');
      const profileXpCurrent = document.getElementById('profile-xp-current');
      const profileXpNext = document.getElementById('profile-xp-next');
      const profileProgressFill = document.getElementById('profile-progress-fill');
      if (profileLevelPill) profileLevelPill.textContent = `Level ${level}`;
      if (profileLevelTitle) profileLevelTitle.textContent = `Level ${level}`;
      if (profileXpCurrent) profileXpCurrent.textContent = `${currentXp.toLocaleString('tr-TR')} XP`;
      if (profileXpNext) profileXpNext.textContent = `Level ${level + 1} için ${xpLeft.toLocaleString('tr-TR')} kaldı`;
      if (profileProgressFill) profileProgressFill.style.setProperty('width', `${Math.min(100, Math.max(0, (currentXp / 500) * 100))}%`, 'important');
      document.getElementById('p-high-score').textContent = highScore.toLocaleString('tr-TR');
      let onlineWins = d.quickWins || 0;
      let onlineLosses = d.quickLosses || 0;
      let onlineDraws = d.quickDraws || 0;
      let totalOnlineGames = d.quickOnlineGames || (onlineWins + onlineLosses + onlineDraws);
      const hist = document.getElementById('match-history');
      let matches = [];
      if (this.authManager.user) {
        hist.innerHTML = '<div class="spinner-container"><div class="spinner spinner-sm"></div></div>';
        matches = (await this.dbManager.getMatchHistory(this.authManager.user.uid, 20))
          .filter(m => m.matchType === 'quick')
          .slice(0, 10);
        if (totalOnlineGames === 0 && matches.length > 0) {
          const uid = this.authManager.user.uid;
          onlineWins = matches.filter(m => m.winnerUid === uid).length;
          onlineDraws = matches.filter(m => !m.winnerUid).length;
          onlineLosses = matches.length - onlineWins - onlineDraws;
          totalOnlineGames = matches.length;
        }
      }
      const rankLabel = document.getElementById('profile-rank-label');
      if (rankLabel) rankLabel.textContent = `${onlineWins.toLocaleString('tr-TR')} Galibiyet`;
      document.getElementById('p-total-games').textContent = totalOnlineGames.toLocaleString('tr-TR');
      document.getElementById('p-total-wins').textContent = onlineWins.toLocaleString('tr-TR');
      const winRateEl = document.getElementById('p-win-rate');
      if (winRateEl) {
        winRateEl.textContent = totalOnlineGames ? `${Math.round((onlineWins / totalOnlineGames) * 100)}%` : '0%';
      }
      const drawsEl = document.getElementById('p-total-draws');
      if (drawsEl) drawsEl.textContent = onlineDraws.toLocaleString('tr-TR');
      const lossesEl = document.getElementById('p-total-losses');
      if (lossesEl) lossesEl.textContent = onlineLosses.toLocaleString('tr-TR');
      if (!this.authManager.user) { hist.innerHTML = '<p class="text-muted">Giriş yapılmadı</p>'; return; }
      if (matches.length === 0) { hist.innerHTML = '<p class="text-muted">Henüz hızlı maç yok</p>'; return; }
      const uid = this.authManager.user.uid;
      hist.innerHTML = matches.map(m => {
        const isP1 = m.player1 && m.player1.uid === uid;
        const myScore = isP1 ? m.player1.score : m.player2.score;
        const oppName = isP1 ? (m.player2 ? m.player2.username : '?') : (m.player1 ? m.player1.username : '?');
        const oppScore = isP1 ? (m.player2 ? m.player2.score : 0) : (m.player1 ? m.player1.score : 0);
        const draw = !m.winnerUid;
        const won = !draw && m.winnerUid === uid;
        const typeLabel = m.matchType === 'quick' ? 'Hızlı Maç' : 'Oda Maçı';
        const resultLabel = draw ? 'Berabere' : won ? 'Zafer' : 'Mağlubiyet';
        const icon = draw ? 'BER' : won ? 'GAL' : 'MAĞ';
        return `
          <div class="match-history-item ${draw ? 'draw' : won ? 'win' : 'lose'}">
            <div class="match-result-badge">${icon}</div>
            <div class="match-main">
              <div class="match-topline">
                <span class="match-opponent">vs ${oppName}</span>
                <span class="match-type">${typeLabel}</span>
              </div>
              <span class="match-result-text">${resultLabel}</span>
            </div>
            <div class="match-score-pill">
              <span>${myScore}</span>
              <small>-</small>
              <span>${oppScore}</span>
            </div>
          </div>`;
      }).join('');
    }
  });
}
