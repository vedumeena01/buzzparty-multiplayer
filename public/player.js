// Player Mobile Controller Script (Netlify Function & Local Compatible)
(function() {
  const API_ENDPOINT = '/.netlify/functions/game';

  let myPlayerId = sessionStorage.getItem('buzzparty_player_id') || ('player_' + Math.random().toString(36).substring(2, 9));
  sessionStorage.setItem('buzzparty_player_id', myPlayerId);

  let myRoomCode = null;
  let myName = '';
  let selectedAvatar = '⚡';
  let hasAnsweredCurrent = false;
  let pollInterval = null;
  let prevRoundState = null;

  // DOM Elements
  const headerStatsMini = document.getElementById('player-stats-mini');
  const headerAvatar = document.getElementById('header-avatar');
  const headerName = document.getElementById('header-name');
  const headerScore = document.getElementById('header-score');

  // Views
  const views = {
    JOIN: document.getElementById('view-join'),
    LOBBY: document.getElementById('view-lobby'),
    INTRO: document.getElementById('view-intro'),
    QUESTION: document.getElementById('view-question'),
    REVEAL: document.getElementById('view-reveal'),
    LEADERBOARD: document.getElementById('view-leaderboard'),
    PODIUM: document.getElementById('view-podium')
  };

  // Join Elements
  const inputRoomCode = document.getElementById('input-room-code');
  const inputPlayerName = document.getElementById('input-player-name');
  const btnJoin = document.getElementById('btn-join');
  const joinErrorBanner = document.getElementById('join-error-banner');
  const avatarButtons = document.querySelectorAll('.avatar-btn');

  // Lobby Elements
  const lobbyWaitAvatar = document.getElementById('lobby-wait-avatar');
  const lobbyCodeDisplay = document.getElementById('lobby-code-display');

  // Intro Elements
  const introPlayerTimer = document.getElementById('intro-player-timer');

  // Question Elements
  const quizPadContainer = document.getElementById('quiz-pad-container');
  const buzzerModeContainer = document.getElementById('buzzer-mode-container');
  const btnBuzzerSlam = document.getElementById('btn-buzzer-slam');
  const buzzerStatusMsg = document.getElementById('buzzer-status-msg');
  const questionStatusMsg = document.getElementById('question-status-msg');
  const padButtons = [0, 1, 2, 3].map(i => document.getElementById(`pad-btn-${i}`));
  const padLabels = [0, 1, 2, 3].map(i => document.getElementById(`pad-label-${i}`));

  // Reveal Elements
  const resultIcon = document.getElementById('result-icon');
  const resultTitle = document.getElementById('result-title');
  const resultPoints = document.getElementById('result-points');
  const resultStreak = document.getElementById('result-streak');

  // Leaderboard Elements
  const playerMyRank = document.getElementById('player-my-rank');
  const playerMyScore = document.getElementById('player-my-score');

  // Podium Elements
  const podiumFinalRank = document.getElementById('podium-final-rank');
  const podiumFinalScore = document.getElementById('podium-final-score');

  // Reaction Dock
  const reactionDock = document.getElementById('reaction-dock');

  function switchView(viewName) {
    Object.keys(views).forEach(k => {
      if (views[k]) views[k].classList.remove('active');
    });
    const target = views[viewName] || views.JOIN;
    target.classList.add('active');
  }

  // Pre-fill Room Code if present in URL
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  if (roomFromUrl) {
    inputRoomCode.value = roomFromUrl.toUpperCase();
  }

  // Avatar Selection
  avatarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      avatarButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAvatar = btn.getAttribute('data-avatar');
      if (window.soundEngine) window.soundEngine.playPop();
    });
  });

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

  // Join Action
  btnJoin.addEventListener('click', async () => {
    const code = inputRoomCode.value.trim().toUpperCase();
    const name = inputPlayerName.value.trim();

    if (!code || code.length !== 4) {
      showError("Please enter a valid 4-letter room code.");
      return;
    }
    if (!name) {
      showError("Please enter a nickname.");
      return;
    }

    if (window.soundEngine) window.soundEngine.init();

    const data = await apiCall('join_room', {
      code,
      name,
      avatar: selectedAvatar,
      playerId: myPlayerId
    });

    if (!data || !data.success) {
      showError(data ? data.error : "Could not connect to room.");
      if (window.soundEngine) window.soundEngine.playWrong();
      return;
    }

    myRoomCode = code;
    myName = name;
    joinErrorBanner.style.display = 'none';

    // Update Header
    headerStatsMini.style.display = 'flex';
    headerAvatar.textContent = selectedAvatar;
    headerName.textContent = myName;
    headerScore.textContent = '0 pts';

    // Show Reaction Dock
    reactionDock.style.display = 'flex';

    // Update Lobby
    lobbyWaitAvatar.textContent = selectedAvatar;
    lobbyCodeDisplay.textContent = myRoomCode;

    if (window.soundEngine) window.soundEngine.playCorrect();
    renderPlayerState(data.roomData);
    startPolling();
  });

  function showError(msg) {
    joinErrorBanner.textContent = msg;
    joinErrorBanner.style.display = 'block';
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!myRoomCode) return;
      try {
        const res = await fetch(`${API_ENDPOINT}?action=get_room&code=${myRoomCode}`);
        const data = await res.json();
        if (data && data.success) {
          renderPlayerState(data.roomData);
        }
      } catch (e) {
        // Polling retry
      }
    }, 800);
  }

  function renderPlayerState(room) {
    if (!room || !myPlayerId) return;
    const { state, players, question, buzzerLockedBy, timeLeft } = room;
    const me = players.find(p => p.id === myPlayerId);

    if (me) {
      headerScore.textContent = `${me.score.toLocaleString()} pts`;
    }

    // State change sounds / transitions
    if (state !== prevRoundState) {
      if (state === 'INTRO') {
        hasAnsweredCurrent = false;
        if (window.soundEngine) window.soundEngine.playWhoosh();
      }
      prevRoundState = state;
    }

    // 1. LOBBY
    if (state === 'LOBBY') {
      switchView('LOBBY');
    }

    // 2. INTRO
    else if (state === 'INTRO') {
      switchView('INTRO');
      introPlayerTimer.textContent = timeLeft;
    }

    // 3. QUESTION
    else if (state === 'QUESTION') {
      switchView('QUESTION');

      if (question) {
        if (question.mode === 'buzzer') {
          if (!buzzerLockedBy) {
            buzzerModeContainer.classList.add('active');
            quizPadContainer.style.display = 'none';
            btnBuzzerSlam.disabled = false;
            buzzerStatusMsg.textContent = "SMASH THE BUZZER FIRST!";
          } else if (buzzerLockedBy === myPlayerId) {
            buzzerModeContainer.classList.remove('active');
            quizPadContainer.style.display = 'flex';
          } else {
            buzzerModeContainer.classList.add('active');
            quizPadContainer.style.display = 'none';
            btnBuzzerSlam.disabled = true;
            buzzerStatusMsg.textContent = "Someone buzzed in!";
          }
        } else {
          buzzerModeContainer.classList.remove('active');
          quizPadContainer.style.display = 'flex';
        }

        // Reset pad buttons if haven't answered
        if (!hasAnsweredCurrent && (!me || !me.hasAnswered)) {
          questionStatusMsg.textContent = "Tap your answer!";
          padButtons.forEach((btn, idx) => {
            btn.classList.remove('selected', 'dimmed');
            btn.disabled = false;
            if (padLabels[idx] && question.options[idx]) {
              padLabels[idx].textContent = question.options[idx];
            }
          });
        }
      }
    }

    // 4. REVEAL
    else if (state === 'REVEAL') {
      switchView('REVEAL');
      if (me) {
        const isCorrect = me.lastPoints > 0;
        if (isCorrect) {
          resultIcon.textContent = '🎉';
          resultTitle.textContent = 'Correct!';
          resultTitle.style.color = '#34d399';
          resultPoints.textContent = `+${me.lastPoints.toLocaleString()} pts`;
          resultPoints.style.color = '#38bdf8';
          if (me.streak >= 2) {
            resultStreak.textContent = `🔥 ${me.streak}x STREAK!`;
            resultStreak.style.display = 'inline-block';
          } else {
            resultStreak.style.display = 'none';
          }
        } else {
          resultIcon.textContent = '💀';
          resultTitle.textContent = 'Wrong!';
          resultTitle.style.color = '#f87171';
          resultPoints.textContent = me.lastPoints < 0 ? `${me.lastPoints} pts` : '+0 pts';
          resultPoints.style.color = '#94a3b8';
          resultStreak.style.display = 'none';
        }
      }
    }

    // 5. LEADERBOARD
    else if (state === 'LEADERBOARD') {
      switchView('LEADERBOARD');
      const sorted = [...players].sort((a, b) => b.score - a.score);
      const myRankIndex = sorted.findIndex(p => p.id === myPlayerId);
      const myRank = myRankIndex !== -1 ? myRankIndex + 1 : '-';

      playerMyRank.textContent = `#${myRank}`;
      if (me) {
        playerMyScore.textContent = `${me.score.toLocaleString()} pts`;
      }
    }

    // 6. PODIUM
    else if (state === 'PODIUM') {
      switchView('PODIUM');
      const sorted = [...players].sort((a, b) => b.score - a.score);
      const myRankIndex = sorted.findIndex(p => p.id === myPlayerId);
      const myRank = myRankIndex !== -1 ? myRankIndex + 1 : '-';

      podiumFinalRank.textContent = `#${myRank}`;
      if (me) {
        podiumFinalScore.textContent = `${me.score.toLocaleString()} pts`;
      }
    }
  }

  // Answer pad click handlers
  padButtons.forEach((btn, idx) => {
    btn.addEventListener('click', async () => {
      if (hasAnsweredCurrent) return;
      hasAnsweredCurrent = true;
      questionStatusMsg.textContent = "Answer submitted! Waiting for results...";
      padButtons.forEach((b, i) => {
        if (i === idx) {
          b.classList.add('selected');
        } else {
          b.classList.add('dimmed');
        }
        b.disabled = true;
      });

      if (navigator.vibrate) navigator.vibrate([40]);
      if (window.soundEngine) window.soundEngine.playTick();

      await apiCall('submit_answer', {
        code: myRoomCode,
        playerId: myPlayerId,
        optionIndex: idx
      });
    });
  });

  // Buzzer slam handler
  btnBuzzerSlam.addEventListener('click', async () => {
    if (window.soundEngine) window.soundEngine.playBuzzer();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const res = await apiCall('press_buzzer', {
      code: myRoomCode,
      playerId: myPlayerId
    });

    if (res && res.success && res.buzzerLockedBy === myPlayerId) {
      buzzerModeContainer.classList.remove('active');
      quizPadContainer.style.display = 'flex';
      buzzerStatusMsg.textContent = "YOU BUZZED IN! Answer now!";
    }
  });

  // Reaction Dock Buttons
  const reactionButtons = document.querySelectorAll('.btn-reaction');
  reactionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-reaction');
      apiCall('send_reaction', {
        code: myRoomCode,
        playerId: myPlayerId,
        emoji
      });

      if (window.soundEngine) window.soundEngine.playPop();
      if (navigator.vibrate) navigator.vibrate([25]);

      btn.style.transform = 'scale(1.4)';
      setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
    });
  });

  // Player Rules Modal toggle
  const btnPlayerRules = document.getElementById('btn-player-rules');
  const playerRulesModal = document.getElementById('player-rules-modal');
  const btnClosePlayerRules = document.getElementById('btn-close-player-rules');

  if (btnPlayerRules && playerRulesModal && btnClosePlayerRules) {
    btnPlayerRules.addEventListener('click', () => {
      playerRulesModal.style.display = 'flex';
      if (window.soundEngine) window.soundEngine.playPop();
    });
    btnClosePlayerRules.addEventListener('click', () => {
      playerRulesModal.style.display = 'none';
    });
    playerRulesModal.addEventListener('click', (e) => {
      if (e.target === playerRulesModal) playerRulesModal.style.display = 'none';
    });
  }
})();
