// Host Screen Client Controller (Netlify Function & Local Compatible)
(function() {
  const API_ENDPOINT = '/.netlify/functions/game';

  let currentRoomCode = null;
  let currentRoom = null;
  let qrGenerated = false;
  let pollInterval = null;
  let lastProcessedReactionTime = Date.now();
  let prevBuzzerLocked = null;

  // DOM Elements
  const headerRoomCode = document.getElementById('header-room-code');
  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const hostUrlDisplay = document.getElementById('host-url-display');
  const lobbyQrContainer = document.getElementById('lobby-qr-container');
  const lobbyPlayersGrid = document.getElementById('lobby-players-grid');
  const playerCountBadge = document.getElementById('player-count-badge');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');

  // Views
  const views = {
    LOBBY: document.getElementById('view-lobby'),
    INTRO: document.getElementById('view-intro'),
    QUESTION: document.getElementById('view-question'),
    REVEAL: document.getElementById('view-question'),
    LEADERBOARD: document.getElementById('view-leaderboard'),
    PODIUM: document.getElementById('view-podium')
  };

  // Question Elements
  const qProgressBadge = document.getElementById('q-progress-badge');
  const qCategoryBadge = document.getElementById('q-category-badge');
  const timerBubble = document.getElementById('timer-bubble');
  const questionText = document.getElementById('question-text');
  const buzzerLockBanner = document.getElementById('buzzer-lock-banner');
  const buzzerLockText = document.getElementById('buzzer-lock-text');
  const answeredStatusBar = document.getElementById('answered-status-bar');
  const btnNextStep = document.getElementById('btn-next-step');
  const explanationPanel = document.getElementById('explanation-panel');
  const explanationText = document.getElementById('explanation-text');

  // Intro Elements
  const introCategory = document.getElementById('intro-category');
  const introRoundTitle = document.getElementById('intro-round-title');
  const introCountdown = document.getElementById('intro-countdown');

  // Leaderboard Elements
  const leaderboardList = document.getElementById('leaderboard-list');
  const btnNextQuestion = document.getElementById('btn-next-question');

  // Podium Elements
  const btnRestartGame = document.getElementById('btn-restart-game');

  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      if (views[k]) views[k].classList.remove('active');
    });
    const target = views[viewName] || views.LOBBY;
    target.classList.add('active');
  }

  async function apiCall(action, payload = {}) {
    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      return await res.json();
    } catch (err) {
      console.error('API Error:', err);
      return null;
    }
  }

  // 1. Initialize Room
  async function initRoom() {
    const data = await apiCall('create_room');
    if (data && data.success) {
      currentRoomCode = data.code;
      currentRoom = data.roomData;
      headerRoomCode.textContent = currentRoomCode;
      lobbyRoomCode.textContent = currentRoomCode;

      const joinUrl = `${window.location.origin}/player.html?room=${currentRoomCode}`;
      hostUrlDisplay.textContent = `${window.location.host}/player.html`;

      if (!qrGenerated && window.QRCode) {
        new QRCode(lobbyQrContainer, {
          text: joinUrl,
          width: 170,
          height: 170
        });
        qrGenerated = true;
      }

      renderRoomState(currentRoom);
      startPolling();
    }
  }

  // Poll room state directly from /.netlify/functions/game
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!currentRoomCode) return;
      try {
        const res = await fetch(`${API_ENDPOINT}?action=get_room&code=${currentRoomCode}`);
        const data = await res.json();
        if (data && data.success) {
          currentRoom = data.roomData;
          renderRoomState(currentRoom);
        }
      } catch (e) {
        // Polling retry
      }
    }, 800);
  }

  function renderRoomState(room) {
    if (!room) return;
    const { state, players, question, answerStats, timeLeft, buzzerLockedBy, buzzerPlayerName, reactions } = room;

    headerRoomCode.textContent = room.code;

    // Check for new reactions
    if (reactions && reactions.length > 0) {
      reactions.forEach(r => {
        if (r.timestamp > lastProcessedReactionTime) {
          spawnReaction(r.emoji, r.senderName, r.x);
          if (window.soundEngine) window.soundEngine.playPop();
          lastProcessedReactionTime = r.timestamp;
        }
      });
    }

    // Check buzzer trigger
    if (buzzerLockedBy && buzzerLockedBy !== prevBuzzerLocked) {
      prevBuzzerLocked = buzzerLockedBy;
      if (buzzerLockBanner && buzzerLockText) {
        buzzerLockText.textContent = `🚨 ${buzzerPlayerName ? buzzerPlayerName.toUpperCase() : 'SOMEONE'} BUZZED IN!`;
        buzzerLockBanner.classList.add('active');
      }
      if (window.soundEngine) window.soundEngine.playBuzzer();
    } else if (!buzzerLockedBy) {
      prevBuzzerLocked = null;
      if (buzzerLockBanner) buzzerLockBanner.classList.remove('active');
    }

    // 1. LOBBY
    if (state === 'LOBBY') {
      switchView('LOBBY');
      playerCountBadge.textContent = `${players.length} Player${players.length === 1 ? '' : 's'}`;
      btnStartGame.textContent = `Start Game (${players.length} Player${players.length === 1 ? '' : 's'})`;
      btnStartGame.disabled = players.length === 0;

      if (players.length === 0) {
        lobbyPlayersGrid.innerHTML = `
          <div class="empty-roster-msg">
            <span style="font-size: 3rem;">👋</span>
            <span>Waiting for players to join with code <strong>${room.code}</strong>...</span>
          </div>
        `;
      } else {
        lobbyPlayersGrid.innerHTML = players.map(p => `
          <div class="player-token">
            <div class="player-avatar">${p.avatar}</div>
            <div class="player-name">${escapeHtml(p.name)}</div>
          </div>
        `).join('');
      }
    }

    // 2. INTRO
    else if (state === 'INTRO') {
      switchView('INTRO');
      if (question) {
        introCategory.textContent = question.mode === 'buzzer' ? '⚡ LIGHTNING BUZZER ROUND' : question.category;
        introRoundTitle.textContent = `Question ${question.index} of ${question.total}`;
      }
      introCountdown.textContent = timeLeft;
    }

    // 3. ACTIVE QUESTION
    else if (state === 'QUESTION') {
      switchView('QUESTION');
      explanationPanel.classList.remove('active');
      btnNextStep.style.display = 'none';

      if (question) {
        qProgressBadge.textContent = `Question ${question.index} of ${question.total}`;
        qCategoryBadge.textContent = question.category;
        questionText.textContent = question.question;

        timerBubble.textContent = timeLeft;
        if (timeLeft <= 5) {
          timerBubble.classList.add('urgent');
          if (window.soundEngine) window.soundEngine.playTick();
        } else {
          timerBubble.classList.remove('urgent');
        }

        // Render Options
        question.options.forEach((opt, idx) => {
          const card = document.getElementById(`opt-card-${idx}`);
          const text = document.getElementById(`opt-text-${idx}`);
          const stats = document.getElementById(`opt-stats-${idx}`);
          if (card && text) {
            text.textContent = opt;
            card.classList.remove('dimmed', 'correct');
            if (stats) stats.style.width = '0%';
          }
        });

        // Answered count
        const answeredCount = players.filter(p => p.hasAnswered).length;
        answeredStatusBar.textContent = `Answers In: ${answeredCount} / ${players.length}`;
      }
    }

    // 4. REVEAL
    else if (state === 'REVEAL') {
      switchView('QUESTION');
      if (question && question.correctIndex !== null) {
        question.options.forEach((opt, idx) => {
          const card = document.getElementById(`opt-card-${idx}`);
          const stats = document.getElementById(`opt-stats-${idx}`);
          if (card) {
            if (idx === question.correctIndex) {
              card.classList.add('correct');
              card.classList.remove('dimmed');
            } else {
              card.classList.add('dimmed');
              card.classList.remove('correct');
            }
          }
          if (stats && answerStats) {
            const totalAnswers = answerStats.reduce((a, b) => a + b, 0) || 1;
            const percentage = Math.round((answerStats[idx] / totalAnswers) * 100);
            stats.style.width = `${percentage}%`;
          }
        });

        if (question.explanation) {
          explanationText.textContent = question.explanation;
          explanationPanel.classList.add('active');
        }

        btnNextStep.style.display = 'inline-block';
        btnNextStep.textContent = (question.index >= question.total) ? 'See Final Winners 🏆' : 'See Leaderboard →';
      }
    }

    // 5. LEADERBOARD
    else if (state === 'LEADERBOARD') {
      switchView('LEADERBOARD');
      const sorted = [...players].sort((a, b) => b.score - a.score);

      leaderboardList.innerHTML = sorted.map((p, idx) => `
        <div class="leaderboard-row rank-${idx + 1}">
          <div class="lb-rank">#${idx + 1}</div>
          <div class="lb-avatar">${p.avatar}</div>
          <div class="lb-info">
            <div class="lb-name">
              <span>${escapeHtml(p.name)}</span>
              ${p.streak >= 2 ? `<span class="streak-chip">🔥 ${p.streak}x STREAK</span>` : ''}
            </div>
          </div>
          <div class="lb-score-block">
            <div class="lb-score">${p.score.toLocaleString()} pts</div>
            ${p.lastPoints > 0 ? `<div class="lb-gain">+${p.lastPoints}</div>` : ''}
          </div>
        </div>
      `).join('');

      if (question && question.index >= question.total) {
        btnNextQuestion.textContent = 'Crown The Champion 👑';
      } else {
        btnNextQuestion.textContent = 'Next Question →';
      }
    }

    // 6. PODIUM
    else if (state === 'PODIUM') {
      switchView('PODIUM');
      const sorted = [...players].sort((a, b) => b.score - a.score);

      if (sorted[0]) {
        document.getElementById('podium-avatar-1').textContent = sorted[0].avatar;
        document.getElementById('podium-name-1').textContent = sorted[0].name;
        document.getElementById('podium-score-1').textContent = `${sorted[0].score.toLocaleString()} pts`;
      }
      if (sorted[1]) {
        document.getElementById('podium-avatar-2').textContent = sorted[1].avatar;
        document.getElementById('podium-name-2').textContent = sorted[1].name;
        document.getElementById('podium-score-2').textContent = `${sorted[1].score.toLocaleString()} pts`;
        document.getElementById('podium-pillar-2').style.display = 'flex';
      } else {
        document.getElementById('podium-pillar-2').style.display = 'none';
      }
      if (sorted[2]) {
        document.getElementById('podium-avatar-3').textContent = sorted[2].avatar;
        document.getElementById('podium-name-3').textContent = sorted[2].name;
        document.getElementById('podium-score-3').textContent = `${sorted[2].score.toLocaleString()} pts`;
        document.getElementById('podium-pillar-3').style.display = 'flex';
      } else {
        document.getElementById('podium-pillar-3').style.display = 'none';
      }

      if (window.soundEngine) window.soundEngine.playFanfare();
      if (window.launchConfetti) window.launchConfetti(5000);
    }
  }

  function spawnReaction(emoji, senderName, xPercent) {
    const stream = document.getElementById('reaction-stream');
    if (!stream) return;

    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.style.left = `${xPercent || 50}%`;
    el.innerHTML = `
      ${senderName ? `<div class="reaction-sender">${escapeHtml(senderName)}</div>` : ''}
      <span>${emoji}</span>
    `;

    stream.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3000);
  }

  // Event Listeners
  btnStartGame.addEventListener('click', async () => {
    if (window.soundEngine) window.soundEngine.init();
    await apiCall('start_game', { code: currentRoomCode });
  });

  btnNextStep.addEventListener('click', async () => {
    await apiCall('next_leaderboard', { code: currentRoomCode });
  });

  btnNextQuestion.addEventListener('click', async () => {
    await apiCall('next_question', { code: currentRoomCode });
  });

  btnRestartGame.addEventListener('click', async () => {
    await apiCall('restart_game', { code: currentRoomCode });
  });

  btnSoundToggle.addEventListener('click', () => {
    if (window.soundEngine) {
      window.soundEngine.init();
      window.soundEngine.muted = !window.soundEngine.muted;
      btnSoundToggle.textContent = window.soundEngine.muted ? '🔇' : '🔊';
    }
  });

  // Rules Modal toggle
  const btnRulesHost = document.getElementById('btn-rules-host');
  const rulesModal = document.getElementById('rules-modal');
  const btnCloseRules = document.getElementById('btn-close-rules');

  if (btnRulesHost && rulesModal && btnCloseRules) {
    btnRulesHost.addEventListener('click', () => {
      rulesModal.style.display = 'flex';
      if (window.soundEngine) window.soundEngine.playPop();
    });
    btnCloseRules.addEventListener('click', () => {
      rulesModal.style.display = 'none';
    });
    rulesModal.addEventListener('click', (e) => {
      if (e.target === rulesModal) rulesModal.style.display = 'none';
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Start
  initRoom();
})();
