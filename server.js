const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Serve static assets from /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Parity router for Netlify Function endpoint: /.netlify/functions/game
const triviaEngine = require('./lib/triviaEngine');
const localNetlifyRooms = new Map();

app.all('/.netlify/functions/game', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const action = req.query.action || req.body?.action;
  const body = req.body || {};

  // 1. Create Room
  if (action === 'create_room') {
    let code = triviaEngine.generateCode();
    while (localNetlifyRooms.has(code)) {
      code = triviaEngine.generateCode();
    }
    const newRoom = triviaEngine.createInitialRoom(code);
    localNetlifyRooms.set(code, newRoom);
    return res.json({ success: true, code, roomData: triviaEngine.getSafeRoomView(newRoom) });
  }

  // 2. Get Room
  if (action === 'get_room') {
    const code = (req.query.code || body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    const view = triviaEngine.getSafeRoomView(room);
    return res.json({ success: true, roomData: view });
  }

  // 3. Join Room
  if (action === 'join_room') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room) return res.status(404).json({ success: false, error: `Room "${code}" not found.` });

    const playerId = body.playerId || 'player_' + Math.random().toString(36).substring(2, 9);
    if (!room.players[playerId]) {
      room.players[playerId] = {
        id: playerId,
        name: (body.name || 'Player').slice(0, 16),
        avatar: body.avatar || '⚡',
        score: 0,
        streak: 0,
        lastPoints: 0,
        currentAnswer: null,
        answerTimeLeft: 0
      };
    }
    return res.json({
      success: true,
      playerId,
      player: room.players[playerId],
      roomData: triviaEngine.getSafeRoomView(room)
    });
  }

  // 4. Start Game
  if (action === 'start_game') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    room.currentQIndex = 0;
    room.state = 'INTRO';
    room.qStartTime = Date.now();
    room.buzzerLockedBy = null;
    Object.values(room.players).forEach(p => {
      p.currentAnswer = null;
      p.lastPoints = 0;
      p.answerTimeLeft = 0;
    });
    return res.json({ success: true, roomData: triviaEngine.getSafeRoomView(room) });
  }

  // 5. Submit Answer
  if (action === 'submit_answer') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room || room.state !== 'QUESTION') return res.status(400).json({ error: 'Question not active' });

    const player = room.players[body.playerId];
    if (!player || player.currentAnswer !== null) return res.status(400).json({ error: 'Already answered' });

    const curQ = room.questions[room.currentQIndex];
    if (curQ.mode === 'buzzer' && room.buzzerLockedBy !== player.id) {
      return res.status(403).json({ error: 'Buzzer locked by someone else' });
    }

    const elapsed = Math.floor((Date.now() - room.qStartTime) / 1000);
    const timeLeft = Math.max(0, (curQ.timeLimit || 15) - elapsed);

    player.currentAnswer = body.optionIndex;
    player.answerTimeLeft = timeLeft;

    const activePlayers = Object.values(room.players);
    const allAnswered = activePlayers.every(p => p.currentAnswer !== null);

    if (curQ.mode === 'buzzer' || allAnswered) {
      triviaEngine.resolveQuestionReveal(room);
    }
    return res.json({ success: true, optionIndex: body.optionIndex, roomData: triviaEngine.getSafeRoomView(room) });
  }

  // 6. Press Buzzer
  if (action === 'press_buzzer') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room || room.state !== 'QUESTION') return res.status(400).json({ error: 'Question not active' });

    if (!room.buzzerLockedBy) {
      room.buzzerLockedBy = body.playerId;
    }
    return res.json({ success: true, buzzerLockedBy: room.buzzerLockedBy, roomData: triviaEngine.getSafeRoomView(room) });
  }

  // 7. Next Leaderboard
  if (action === 'next_leaderboard') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    room.state = 'LEADERBOARD';
    return res.json({ success: true, roomData: triviaEngine.getSafeRoomView(room) });
  }

  // 8. Next Question
  if (action === 'next_question') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (room.currentQIndex + 1 < room.questions.length) {
      room.currentQIndex++;
      room.state = 'INTRO';
      room.qStartTime = Date.now();
      room.buzzerLockedBy = null;
      Object.values(room.players).forEach(p => {
        p.currentAnswer = null;
        p.lastPoints = 0;
        p.answerTimeLeft = 0;
      });
    } else {
      room.state = 'PODIUM';
    }
    return res.json({ success: true, roomData: triviaEngine.getSafeRoomView(room) });
  }

  // 9. Send Reaction
  if (action === 'send_reaction') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (room) {
      const player = room.players[body.playerId];
      if (!room.reactions) room.reactions = [];
      room.reactions.push({
        id: Math.random().toString(36).substring(2, 9),
        emoji: body.emoji || '🎉',
        senderName: player ? player.name : '',
        x: Math.random() * 80 + 10,
        timestamp: Date.now()
      });
    }
    return res.json({ success: true });
  }

  // 10. Restart Game
  if (action === 'restart_game') {
    const code = (body.code || '').toUpperCase().trim();
    const room = localNetlifyRooms.get(code);
    if (room) {
      const freshRoom = triviaEngine.createInitialRoom(code);
      Object.values(room.players).forEach(p => {
        freshRoom.players[p.id] = {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          score: 0,
          streak: 0,
          lastPoints: 0,
          currentAnswer: null,
          answerTimeLeft: 0
        };
      });
      localNetlifyRooms.set(code, freshRoom);
      return res.json({ success: true, roomData: triviaEngine.getSafeRoomView(freshRoom) });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
});

// Load question bank
let questionBank = [];
try {
  const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  questionBank = JSON.parse(data);
} catch (err) {
  console.error('Error loading questions.json:', err);
  questionBank = [
    {
      category: "General",
      mode: "quiz",
      question: "What is the capital of France?",
      options: ["Berlin", "London", "Paris", "Rome"],
      correctIndex: 2,
      timeLimit: 15,
      explanation: "Paris is the capital and most populous city of France."
    }
  ];
}

// In-memory Room Storage
// rooms[code] = {
//   code, hostSocketId, players: { [id]: { id, name, avatar, score, streak, lastPoints, currentAnswer, buzzed } },
//   state: 'LOBBY' | 'INTRO' | 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'PODIUM',
//   questions: [], currentQIndex: 0,
//   timer: null, timeLeft: 0, buzzerLockedBy: null,
//   settings: { totalQuestions: 6 }
// }
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

function getSafeRoomData(room) {
  const playersList = Object.values(room.players).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    streak: p.streak,
    lastPoints: p.lastPoints || 0,
    hasAnswered: p.currentAnswer !== null,
    isBuzzed: room.buzzerLockedBy === p.id
  }));

  const curQ = room.questions[room.currentQIndex] || null;
  let questionData = null;
  if (curQ && room.state !== 'LOBBY' && room.state !== 'PODIUM') {
    questionData = {
      index: room.currentQIndex + 1,
      total: room.questions.length,
      category: curQ.category,
      mode: curQ.mode,
      question: curQ.question,
      options: curQ.options,
      timeLimit: curQ.timeLimit,
      // Only reveal correctIndex & explanation during REVEAL or LEADERBOARD
      correctIndex: (room.state === 'REVEAL' || room.state === 'LEADERBOARD') ? curQ.correctIndex : null,
      explanation: (room.state === 'REVEAL' || room.state === 'LEADERBOARD') ? curQ.explanation : null
    };
  }

  // Calculate answer statistics if in REVEAL
  let answerStats = [0, 0, 0, 0];
  if (room.state === 'REVEAL' || room.state === 'LEADERBOARD') {
    Object.values(room.players).forEach(p => {
      if (p.currentAnswer !== null && p.currentAnswer >= 0 && p.currentAnswer < 4) {
        answerStats[p.currentAnswer]++;
      }
    });
  }

  return {
    code: room.code,
    state: room.state,
    players: playersList,
    question: questionData,
    timeLeft: room.timeLeft,
    buzzerLockedBy: room.buzzerLockedBy,
    buzzerPlayerName: room.buzzerLockedBy ? (room.players[room.buzzerLockedBy]?.name || 'Someone') : null,
    answerStats: (room.state === 'REVEAL') ? answerStats : null
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room_sync', getSafeRoomData(room));
}

function startTimer(room, duration, onTick, onComplete) {
  if (room.timer) clearInterval(room.timer);
  room.timeLeft = duration;
  io.to(room.code).emit('timer_tick', { timeLeft: room.timeLeft });

  room.timer = setInterval(() => {
    room.timeLeft--;
    if (onTick) onTick(room.timeLeft);
    io.to(room.code).emit('timer_tick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      if (onComplete) onComplete();
    }
  }, 1000);
}

function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function checkAllAnswered(room) {
  const activePlayers = Object.values(room.players);
  if (activePlayers.length === 0) return false;
  return activePlayers.every(p => p.currentAnswer !== null);
}

function revealQuestion(room) {
  stopTimer(room);
  room.state = 'REVEAL';

  const curQ = room.questions[room.currentQIndex];
  if (curQ) {
    // Calculate and assign points
    Object.values(room.players).forEach(p => {
      if (p.currentAnswer === curQ.correctIndex) {
        const timeFactor = Math.max(0.2, (p.answerTimeLeft || 1) / (curQ.timeLimit || 15));
        const basePoints = curQ.mode === 'buzzer' ? 1000 : 500;
        const speedBonus = curQ.mode === 'buzzer' ? 0 : Math.round(500 * timeFactor);
        const streakBonus = Math.min(p.streak * 50, 250);
        const earned = basePoints + speedBonus + streakBonus;

        p.score += earned;
        p.streak = (p.streak || 0) + 1;
        p.lastPoints = earned;
      } else if (p.currentAnswer !== null) {
        p.streak = 0;
        p.lastPoints = curQ.mode === 'buzzer' ? -200 : 0;
        p.score = Math.max(0, p.score + p.lastPoints);
      } else {
        // Did not answer
        p.streak = 0;
        p.lastPoints = 0;
      }
    });
  }

  broadcastRoom(room);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Socket.io handlers
io.on('connection', (socket) => {
  let userRoomCode = null;
  let userPlayerId = null;
  let isHost = false;

  // HOST creates a new room
  socket.on('create_room', () => {
    const code = generateRoomCode();
    // Pick 6-8 randomized questions
    const selectedQuestions = shuffle(questionBank).slice(0, 7);

    rooms[code] = {
      code,
      hostSocketId: socket.id,
      players: {},
      state: 'LOBBY',
      questions: selectedQuestions,
      currentQIndex: 0,
      timer: null,
      timeLeft: 0,
      buzzerLockedBy: null
    };

    userRoomCode = code;
    isHost = true;
    socket.join(code);
    socket.emit('room_created', { code, roomData: getSafeRoomData(rooms[code]) });
    console.log(`[ROOM] Created: ${code} by Host ${socket.id}`);
  });

  // PLAYER joins room
  socket.on('join_room', ({ code, name, avatar, existingId }) => {
    const cleanCode = (code || '').toUpperCase().trim();
    const room = rooms[cleanCode];

    if (!room) {
      return socket.emit('join_error', { message: `Room "${cleanCode}" not found! Check code and try again.` });
    }

    const playerId = existingId || socket.id;
    userRoomCode = cleanCode;
    userPlayerId = playerId;
    socket.join(cleanCode);

    // If player reconnected or new
    if (!room.players[playerId]) {
      room.players[playerId] = {
        id: playerId,
        name: (name || 'Player ' + Math.floor(Math.random() * 900 + 100)).slice(0, 16),
        avatar: avatar || '⚡',
        score: 0,
        streak: 0,
        lastPoints: 0,
        currentAnswer: null,
        answerTimeLeft: 0,
        socketId: socket.id
      };
    } else {
      room.players[playerId].socketId = socket.id;
      if (name) room.players[playerId].name = name.slice(0, 16);
      if (avatar) room.players[playerId].avatar = avatar;
    }

    socket.emit('joined_successfully', {
      playerId,
      player: room.players[playerId],
      roomData: getSafeRoomData(room)
    });

    broadcastRoom(room);
    console.log(`[PLAYER] ${room.players[playerId].name} joined room ${cleanCode}`);
  });

  // HOST starts game
  socket.on('start_game', () => {
    const room = rooms[userRoomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    if (Object.keys(room.players).length === 0) {
      return socket.emit('host_error', { message: "Wait for at least 1 player to join before starting!" });
    }

    room.currentQIndex = 0;
    launchQuestionIntro(room);
  });

  function launchQuestionIntro(room) {
    stopTimer(room);
    room.state = 'INTRO';
    room.buzzerLockedBy = null;
    const curQ = room.questions[room.currentQIndex];

    // Reset player answers
    Object.values(room.players).forEach(p => {
      p.currentAnswer = null;
      p.answerTimeLeft = 0;
      p.lastPoints = 0;
    });

    broadcastRoom(room);

    // 3.5 second intro countdown before question begins
    startTimer(room, 3, null, () => {
      launchActiveQuestion(room);
    });
  }

  function launchActiveQuestion(room) {
    stopTimer(room);
    room.state = 'QUESTION';
    const curQ = room.questions[room.currentQIndex];
    broadcastRoom(room);

    startTimer(room, curQ.timeLimit || 15, (t) => {
      // Tick handler
    }, () => {
      // Time is up!
      revealQuestion(room);
    });
  }

  // PLAYER submits answer
  socket.on('submit_answer', ({ optionIndex }) => {
    const room = rooms[userRoomCode];
    if (!room || room.state !== 'QUESTION') return;
    const player = room.players[userPlayerId];
    if (!player || player.currentAnswer !== null) return;

    const curQ = room.questions[room.currentQIndex];
    // In buzzer mode, only the locked buzzer player can answer
    if (curQ.mode === 'buzzer' && room.buzzerLockedBy !== player.id) {
      return;
    }

    player.currentAnswer = optionIndex;
    player.answerTimeLeft = room.timeLeft;

    // Send acknowledgement to player
    socket.emit('answer_received', { optionIndex });

    // Check if buzzer round answer was wrong
    if (curQ.mode === 'buzzer') {
      revealQuestion(room);
      return;
    }

    // In normal quiz mode, check if all players answered
    if (checkAllAnswered(room)) {
      revealQuestion(room);
    } else {
      broadcastRoom(room);
    }
  });

  // PLAYER hits buzzer
  socket.on('press_buzzer', () => {
    const room = rooms[userRoomCode];
    if (!room || room.state !== 'QUESTION') return;
    const curQ = room.questions[room.currentQIndex];
    if (curQ.mode !== 'buzzer') return;

    // First one gets the lock
    if (!room.buzzerLockedBy) {
      room.buzzerLockedBy = userPlayerId;
      const buzzerPlayer = room.players[userPlayerId];
      io.to(room.code).emit('buzzer_hit', {
        playerId: userPlayerId,
        playerName: buzzerPlayer ? buzzerPlayer.name : 'Player',
        playerAvatar: buzzerPlayer ? buzzerPlayer.avatar : '🚨'
      });
      broadcastRoom(room);
    }
  });

  // HOST advances to Leaderboard
  socket.on('next_leaderboard', () => {
    const room = rooms[userRoomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    stopTimer(room);
    room.state = 'LEADERBOARD';
    broadcastRoom(room);
  });

  // HOST advances to next question or Podium
  socket.on('next_question', () => {
    const room = rooms[userRoomCode];
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.currentQIndex + 1 < room.questions.length) {
      room.currentQIndex++;
      launchQuestionIntro(room);
    } else {
      stopTimer(room);
      room.state = 'PODIUM';
      broadcastRoom(room);
    }
  });

  // HOST restarts game / back to lobby
  socket.on('restart_game', () => {
    const room = rooms[userRoomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    stopTimer(room);
    room.state = 'LOBBY';
    room.currentQIndex = 0;
    room.buzzerLockedBy = null;
    room.questions = shuffle(questionBank).slice(0, 7);
    Object.values(room.players).forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.lastPoints = 0;
      p.currentAnswer = null;
    });
    broadcastRoom(room);
  });

  // EMOJI REACTION CANNON (Any player can burst reactions)
  socket.on('send_reaction', ({ emoji }) => {
    if (!userRoomCode) return;
    const room = rooms[userRoomCode];
    if (!room) return;
    const player = room.players[userPlayerId];
    io.to(userRoomCode).emit('new_reaction', {
      emoji: emoji || '🎉',
      senderName: player ? player.name : '',
      x: Math.random() * 80 + 10 // Random x position (10% to 90%)
    });
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    if (userRoomCode && rooms[userRoomCode]) {
      const room = rooms[userRoomCode];
      if (isHost) {
        console.log(`[ROOM] Host left room ${userRoomCode}`);
        io.to(userRoomCode).emit('host_disconnected');
        stopTimer(room);
        delete rooms[userRoomCode];
      } else if (userPlayerId) {
        // Player disconnected
        setTimeout(() => {
          // If socket not reconnected after 30 seconds, remove player
          if (room && room.players[userPlayerId] && room.players[userPlayerId].socketId === socket.id) {
            delete room.players[userPlayerId];
            broadcastRoom(room);
          }
        }, 30000);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 BuzzParty Game Server running on port ${PORT}`);
  console.log(`📺 Host Big-Screen: http://localhost:${PORT}`);
  console.log(`📱 Player Controller: http://localhost:${PORT}/player.html`);
  console.log(`===============================================`);
});
