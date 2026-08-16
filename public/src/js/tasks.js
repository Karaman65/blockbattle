export function applyTasks(Game) {
  Object.assign(Game.prototype, {
    getQuestPeriodKey(type) {
      const now = new Date();
      const uid = this.authManager && this.authManager.user ? this.authManager.user.uid : 'guest';
      if (type === 'daily') return `${uid}:daily:${this.getLocalDateKey()}`;
      if (type === 'weekly') {
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = monday.getDay() || 7;
        monday.setDate(monday.getDate() - day + 1);
        const year = monday.getFullYear();
        const month = String(monday.getMonth() + 1).padStart(2, '0');
        const date = String(monday.getDate()).padStart(2, '0');
        return `${uid}:weekly:${year}-${month}-${date}`;
      }
      return `${uid}:monthly:${now.getFullYear()}-${now.getMonth() + 1}`;
    },

    getQuestResetLabel(type) {
      const now = new Date();
      let end;
      if (type === 'weekly') {
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = end.getDay() || 7;
        end.setDate(end.getDate() - day + 8);
        end.setHours(0, 0, 0, 0);
      } else if (type === 'monthly') {
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      } else {
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      }
    
      const totalMinutes = Math.max(1, Math.ceil((end - now) / 60000));
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;
      if (days > 0) return `${days}g ${hours}s`;
      if (hours > 0) return `${hours}s ${minutes}dk`;
      return `${minutes}dk`;
    },

    getQuestProgressKey(type) {
      return `questStats:${this.getQuestPeriodKey(type)}`;
    },

    getPeriodQuestStats(type) {
      return JSON.parse(localStorage.getItem(this.getQuestProgressKey(type)) || '{"games":0,"wins":0,"highScore":0}');
    },

    updateQuestProgress(won = false) {
      ['daily', 'weekly', 'monthly'].forEach(type => {
        const key = this.getQuestProgressKey(type);
        const stats = JSON.parse(localStorage.getItem(key) || '{"games":0,"wins":0,"highScore":0}');
        stats.games = (stats.games || 0) + 1;
        stats.wins = (stats.wins || 0) + (won ? 1 : 0);
        stats.highScore = Math.max(stats.highScore || 0, this.score || 0);
        localStorage.setItem(key, JSON.stringify(stats));
      });
    },

    getQuestStats(type = 'daily') {
      const d = this.authManager.userData || {};
      const inv = this.authManager.getInventory ? this.authManager.getInventory() : {};
      const period = this.getPeriodQuestStats(type);
      return {
        highScore: Math.max(period.highScore || 0, this.score || 0),
        totalGames: period.games || 0,
        totalWins: period.wins || 0,
        unlockedLevel: this.getSavedUnlockedLevel(),
        coins: this.authManager.getCoins ? this.authManager.getCoins() : 0,
        powerUps: (inv.bomb || 0) + (inv.rotate || 0) + (inv.skip || 0),
      };
    },

    buildQuests() {
      const dailyStats = this.getQuestStats('daily');
      const weeklyStats = this.getQuestStats('weekly');
      const monthlyStats = this.getQuestStats('monthly');
      const by = (stats, metric) => Math.max(0, stats[metric] || 0);
      return {
        daily: [
          ['d1', 'Skor 150 yap', 'Bugün tek oyunda 150 skora ulaş.', by(dailyStats, 'highScore'), 150, 80],
          ['d2', 'Skor 300 yap', 'Bugün tek oyunda 300 skora ulaş.', by(dailyStats, 'highScore'), 300, 120],
          ['d3', '2 maç oyna', 'Bugün 2 maç tamamla.', by(dailyStats, 'totalGames'), 2, 100],
          ['d4', '5 maç oyna', 'Bugün 5 maç tamamla.', by(dailyStats, 'totalGames'), 5, 160],
          ['d5', '1 galibiyet al', 'Bugün 1 galibiyet al.', by(dailyStats, 'totalWins'), 1, 140],
          ['d6', 'Level 2 aç', 'Level haritasında 2. bölüme ulaş.', by(dailyStats, 'unlockedLevel'), 2, 130],
          ['d7', '500 coin biriktir', 'Hesabında 500 coin bulunsun.', by(dailyStats, 'coins'), 500, 90],
          ['d8', '3 güçlendirici taşı', 'Envanterinde toplam 3 güçlendirici olsun.', by(dailyStats, 'powerUps'), 3, 110],
          ['d9', 'Skor 500 yap', 'Bugün tek oyunda 500 skora ulaş.', by(dailyStats, 'highScore'), 500, 180],
          ['d10', 'Level 3 aç', 'Level haritasında 3. bölüme ulaş.', by(dailyStats, 'unlockedLevel'), 3, 200],
        ],
        weekly: [
          ['w1', '10 maç oyna', 'Bu hafta 10 maç tamamla.', by(weeklyStats, 'totalGames'), 10, 350],
          ['w2', '3 galibiyet al', 'Bu hafta 3 galibiyet al.', by(weeklyStats, 'totalWins'), 3, 420],
          ['w3', 'Skor 1000 yap', 'Bu hafta tek oyunda 1000 skora ulaş.', by(weeklyStats, 'highScore'), 1000, 450],
          ['w4', 'Level 4 aç', 'Level haritasında 4. bölüme ulaş.', by(weeklyStats, 'unlockedLevel'), 4, 480],
          ['w5', '1500 coin biriktir', 'Hesabında 1500 coin bulunsun.', by(weeklyStats, 'coins'), 1500, 500],
          ['w6', '8 güçlendirici taşı', 'Envanterinde toplam 8 güçlendirici olsun.', by(weeklyStats, 'powerUps'), 8, 520],
          ['w7', '15 maç oyna', 'Bu hafta 15 maç tamamla.', by(weeklyStats, 'totalGames'), 15, 560],
          ['w8', 'Skor 1500 yap', 'Bu hafta tek oyunda 1500 skora ulaş.', by(weeklyStats, 'highScore'), 1500, 620],
          ['w9', 'Level 6 aç', 'Level haritasında 6. bölüme ulaş.', by(weeklyStats, 'unlockedLevel'), 6, 700],
          ['w10', '6 galibiyet al', 'Bu hafta 6 galibiyet al.', by(weeklyStats, 'totalWins'), 6, 760],
        ],
        monthly: [
          ['m1', '30 maç oyna', 'Bu ay 30 maç tamamla.', by(monthlyStats, 'totalGames'), 30, 1000],
          ['m2', '10 galibiyet al', 'Bu ay 10 galibiyet al.', by(monthlyStats, 'totalWins'), 10, 1200],
          ['m3', 'Skor 2500 yap', 'Bu ay tek oyunda 2500 skora ulaş.', by(monthlyStats, 'highScore'), 2500, 1400],
          ['m4', 'Level 8 aç', 'Level haritasında 8. bölüme ulaş.', by(monthlyStats, 'unlockedLevel'), 8, 1500],
          ['m5', '4000 coin biriktir', 'Hesabında 4000 coin bulunsun.', by(monthlyStats, 'coins'), 4000, 1600],
          ['m6', '20 güçlendirici taşı', 'Envanterinde toplam 20 güçlendirici olsun.', by(monthlyStats, 'powerUps'), 20, 1700],
          ['m7', '50 maç oyna', 'Bu ay 50 maç tamamla.', by(monthlyStats, 'totalGames'), 50, 1900],
          ['m8', 'Skor 4000 yap', 'Bu ay tek oyunda 4000 skora ulaş.', by(monthlyStats, 'highScore'), 4000, 2200],
          ['m9', 'Level 10 aç', 'Final bölümüne ulaş.', by(monthlyStats, 'unlockedLevel'), 10, 2500],
          ['m10', '25 galibiyet al', 'Bu ay 25 galibiyet al.', by(monthlyStats, 'totalWins'), 25, 3000],
        ],
      };
    },

    renderHomeQuestPreview() {
      const list = document.getElementById('home-quest-list');
      const countEl = document.getElementById('home-quest-count');
      if (!list || !countEl) return;
    
      const dailyQuests = (this.buildQuests().daily || []);
      const periodKey = this.getQuestPeriodKey('daily');
      const claimed = this.getClaimedQuestIds(periodKey);
      const completedCount = dailyQuests.filter(([id, title, desc, value, target]) => value >= target || claimed.includes(id)).length;
      countEl.textContent = `${completedCount}/${dailyQuests.length}`;
    
      const ordered = [...dailyQuests].sort((a, b) => {
        const aClaimed = claimed.includes(a[0]);
        const bClaimed = claimed.includes(b[0]);
        const aReady = a[3] >= a[4] && !aClaimed;
        const bReady = b[3] >= b[4] && !bClaimed;
        if (aReady !== bReady) return aReady ? -1 : 1;
        if (aClaimed !== bClaimed) return aClaimed ? 1 : -1;
        return (b[3] / b[4]) - (a[3] / a[4]);
      }).slice(0, 2);
    
      list.innerHTML = ordered.map(([id, title, desc, value, target, reward]) => {
        const isClaimed = claimed.includes(id);
        const ready = value >= target;
        const done = ready || isClaimed;
        const progress = `${Math.min(value, target)}/${target}`;
        return `
          <div class="home-quest-row ${done ? 'done' : ''}">
            <span aria-hidden="true">
              ${done ? '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>' : ''}
            </span>
            <strong>${title} <small>${isClaimed ? 'Alındı' : ready ? 'Hazır' : progress}</small></strong>
            <b>+${reward}</b>
          </div>
        `;
      }).join('');
    },

    renderQuests() {
      const list = document.getElementById('quests-list');
      const summary = document.getElementById('quest-summary');
      if (!list || !summary) return;
      const groups = this.buildQuests();
      {
        const labels = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' };
        const subtitles = {
          daily: 'Bugün bitecek kısa görevler.',
          weekly: 'Daha uzun hedefler, daha güçlü ödüller.',
          monthly: 'En zor görevler ve en yüksek coin ödülleri.',
        };
        let activeType = this.activeQuestType || localStorage.getItem('activeQuestType') || 'daily';
        if (!groups[activeType]) activeType = 'daily';
        const claimed = {};
    
        Object.entries(groups).forEach(([type, quests]) => {
          const periodKey = this.getQuestPeriodKey(type);
          claimed[type] = this.getClaimedQuestIds(periodKey);
        });
    
        const activeQuests = (groups[activeType] || []);
        const activeClaimed = claimed[activeType] || [];
        const completedCount = activeQuests.filter(([id, title, desc, value, target]) => value >= target || activeClaimed.includes(id)).length;
        const claimableCoins = activeQuests.reduce((sum, [id, title, desc, value, target, reward]) => {
          const isClaimed = activeClaimed.includes(id);
          return value >= target && !isClaimed ? sum + reward : sum;
        }, 0);
        const resetLabel = this.getQuestResetLabel(activeType);
    
        summary.innerHTML = `
          <div class="quest-summary-stats">
            <div>
              <span>Tamamlandı</span>
              <strong class="summary-completed">${completedCount}/${activeQuests.length}</strong>
            </div>
            <div>
              <span>Alınabilir</span>
              <strong class="summary-claimable">${claimableCoins}</strong>
            </div>
            <div>
              <span>Yenilenme</span>
              <strong class="summary-reset">${resetLabel}</strong>
            </div>
          </div>
          <div class="quest-tabs">
            ${Object.keys(groups).map(type => `
              <button class="quest-tab ${type === activeType ? 'active' : ''}" data-type="${type}">
                <span>${labels[type]}</span>
              </button>
            `).join('')}
          </div>`;
    
        summary.querySelectorAll('.quest-tab').forEach(tab => {
          tab.onclick = () => {
            this.activeQuestType = tab.dataset.type;
            localStorage.setItem('activeQuestType', this.activeQuestType);
            this.renderQuests();
          };
        });
    
        const periodKey = this.getQuestPeriodKey(activeType);
        list.innerHTML = '';
        const section = document.createElement('section');
        section.className = `quest-section quest-${activeType}`;
        activeQuests.forEach(([id, title, desc, value, target, reward]) => {
          const ready = value >= target;
          const isClaimed = claimed[activeType].includes(id);
          const pct = Math.min(100, Math.floor((value / target) * 100));
          const progressText = `${Math.min(value, target).toLocaleString('tr-TR')}/${target.toLocaleString('tr-TR')}`;
          const displayTitle = title;
          const displayReward = `+${reward} coin`;
          const row = document.createElement('div');
          row.className = `quest-card ${ready ? 'ready' : ''} ${isClaimed ? 'claimed' : ''}`;
          row.innerHTML = `
            <div class="quest-main">
              <strong>${displayTitle}</strong>
              <div class="quest-coin-line">
                <span class="quest-coin-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="9" cy="9" r="5.5"></circle>
                    <circle cx="15" cy="15" r="5.5"></circle>
                    <path d="M8 7.5h1.5v4"></path>
                    <path d="M14 13.5h1.5v4"></path>
                    <path d="M7.25 9.5h4.25"></path>
                    <path d="M13.25 15.5h4.25"></path>
                  </svg>
                </span>
                <b>${displayReward}</b>
              </div>
              ${ready ? `<div class="quest-complete-pill"><span aria-hidden="true">✓</span> Görev tamamlandı!</div>` : `
                <div class="quest-bar"><div style="width:${pct}%"></div></div>
                <small>${Math.round((value / target) * 100)}% tamamlandı</small>
              `}
            </div>
            <div class="quest-reward">
              <div class="quest-progress-status">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7v5l3 2"></path>
                </svg>
                <span>${progressText}</span>
              </div>
              <button class="btn btn-buy btn-small quest-claim" ${!ready || isClaimed ? 'disabled' : ''}>${isClaimed ? 'Alındı' : 'Al'}</button>
            </div>`;
          const btn = row.querySelector('.quest-claim');
          if (btn) btn.onclick = async () => {
            if (!ready || isClaimed) return;
            btn.disabled = true;
            btn.textContent = '...';
            let success = false;
            if (this.isGuestSession()) {
              success = await this.authManager.addCoins(reward);
            } else {
              success = await this.authManager.claimQuestReward(id, periodKey, reward);
            }
            if (!success) {
              btn.disabled = false;
              btn.textContent = 'Al';
              btn.title = 'Ödül alınamadı. Bağlantını kontrol edip tekrar dene.';
              btn.classList.add('shake');
              setTimeout(() => btn.classList.remove('shake'), 500);
              return;
            }
            btn.title = '';
            this.markQuestClaimed(periodKey, id);
            this.updateCoinDisplays();
            this.audio.pickup();
            this.renderQuests();
            this.renderHomeQuestPreview();
          };
          section.appendChild(row);
        });
        list.appendChild(section);
        return;
      }
    },

    getClaimedQuestIds(periodKey) {
      if (!periodKey) return [];
      if (!this.isGuestSession()) {
        const claimed = this.authManager?.userData?.claimedQuests?.[periodKey];
        return Array.isArray(claimed) ? claimed : [];
      }
      try {
        const claimed = JSON.parse(localStorage.getItem(`claimedQuests:${periodKey}`) || '[]');
        return Array.isArray(claimed) ? claimed : [];
      } catch (err) {
        return [];
      }
    },

    markQuestClaimed(periodKey, questId) {
      if (!periodKey || !questId) return;
      if (!this.isGuestSession() && this.authManager?.userData) {
        if (!this.authManager.userData.claimedQuests) this.authManager.userData.claimedQuests = {};
        const current = Array.isArray(this.authManager.userData.claimedQuests[periodKey])
          ? this.authManager.userData.claimedQuests[periodKey]
          : [];
        if (!current.includes(questId)) {
          this.authManager.userData.claimedQuests[periodKey] = [...current, questId];
        }
        return;
      }
      const current = this.getClaimedQuestIds(periodKey);
      if (!current.includes(questId)) current.push(questId);
      localStorage.setItem(`claimedQuests:${periodKey}`, JSON.stringify(current));
    },

    getQuestIcon(id) {
      if (id.includes('score') || id.endsWith('1')) return '★';
      if (id.includes('win') || id.endsWith('2')) return '▥';
      if (id.includes('game') || id.endsWith('3')) return '⚔';
      if (id.includes('coin') || id.endsWith('4')) return '♕';
      return '✓';
    },

    renderDailyReward() {
      const track = document.getElementById('daily-reward-track');
      if (!track) return;
    
      const state = this.getTodayDailyRewardState();
      const activeIndex = state.claimedToday ? state.lastClaimIndex : state.streak;
      const reward = this.dailyRewards[activeIndex] || this.dailyRewards[0];
      const items = track.querySelectorAll('span');
    
      items.forEach((item, index) => {
        item.classList.toggle('claimed', state.claimedToday ? index <= activeIndex : index < activeIndex);
        item.classList.toggle('active', index === activeIndex);
        item.classList.toggle('claimable', index === activeIndex && !state.claimedToday);
        item.removeAttribute('role');
        item.removeAttribute('tabindex');
        item.removeAttribute('aria-disabled');
        item.title = '';
        if (index === activeIndex) {
          item.setAttribute('role', 'button');
          item.setAttribute('tabindex', state.claimedToday ? '-1' : '0');
          item.setAttribute('aria-disabled', state.claimedToday ? 'true' : 'false');
          item.title = state.claimedToday ? 'Bugünün ödülü alındı' : `Bugünün ödülü: ${reward} coin`;
        }
      });
    
    },

    async claimDailyReward() {
      if (!this.authManager || !this.authManager.userData) return;
    
      const state = this.getTodayDailyRewardState();
      if (state.claimedToday) {
        this.renderDailyReward();
        return;
      }
    
      const reward = this.dailyRewards[state.streak] || this.dailyRewards[0];
      const track = document.getElementById('daily-reward-track');
      const activeItem = track ? track.querySelector('span.active') : null;
      if (activeItem) activeItem.classList.add('claiming');
    
      let success = false;
      if (this.isGuestSession()) {
        success = await this.authManager.addCoins(reward);
        if (success) {
          const nextStreak = state.streak >= this.dailyRewards.length - 1 ? 0 : state.streak + 1;
          this.saveDailyRewardState({
            streak: nextStreak,
            lastClaimIndex: state.streak,
            lastClaimDate: state.today
          });
        }
      } else {
        const yesterday = this.getLocalDateKey(-1);
        success = await this.authManager.claimDailyRewardServer(state.today, yesterday, reward, state.streak);
        if (success) {
          const serverStreak = (this.authManager.userData && this.authManager.userData.dailyRewardStreak) || 0;
          const lastIndex = (this.authManager.userData && this.authManager.userData.dailyRewardLastIndex) || state.streak;
          this.saveDailyRewardState({
            streak: serverStreak,
            lastClaimIndex: lastIndex,
            lastClaimDate: state.today
          });
        }
      }
      if (!success) {
        if (activeItem) activeItem.classList.remove('claiming');
        return;
      }
      this.updateCoinDisplays();
      this.renderDailyReward();
    }
  });
}
