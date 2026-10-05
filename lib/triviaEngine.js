// Helper logic outside netlify/functions
const questionsData = [
  {
    category: "Tech & AI",
    mode: "quiz",
    question: "What does the 'GPT' in ChatGPT stand for?",
    options: [
      "Generative Pre-trained Transformer",
      "General Purpose Technology",
      "Global Predictive Text",
      "Graph Processed Tokenizer"
    ],
    correctIndex: 0,
    timeLimit: 15,
    explanation: "GPT stands for Generative Pre-trained Transformer, introduced in 2018."
  },
  {
    category: "Lightning Buzzer",
    mode: "buzzer",
    question: "BUZZER ROUND: Which animal can sleep for up to 3 years?",
    options: ["Snail", "Sloth", "Koala", "Bullfrog"],
    correctIndex: 0,
    timeLimit: 15,
    explanation: "Snails need moisture to survive; in extreme dryness, they can hibernate for up to 3 years."
  },
  {
    category: "Science & Cosmos",
    mode: "quiz",
    question: "Which planet in our solar system rotates clockwise (retrograde)?",
    options: ["Mars", "Venus", "Jupiter", "Neptune"],
    correctIndex: 1,
    timeLimit: 15,
    explanation: "Venus rotates east-to-west (clockwise), opposite to most other planets!"
  },
  {
    category: "Pop Culture",
    mode: "quiz",
    question: "Which Marvel character has visited the most planets across the MCU?",
    options: ["Thor", "Star-Lord", "Captain Marvel", "Thanos"],
    correctIndex: 0,
    timeLimit: 15,
    explanation: "Thor has journeyed through the Nine Realms and numerous cosmic worlds over 1,500 years."
  },
  {
    category: "Gaming",
    mode: "quiz",
    question: "In Minecraft, which mob was accidentally created while trying to make a pig?",
    options: ["Zombie", "Enderman", "Creeper", "Skeleton"],
    correctIndex: 2,
    timeLimit: 15,
    explanation: "Notch accidentally swapped length and height when coding a pig, creating the iconic Creeper!"
  }
];

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createInitialRoom(code) {
  // 3-round game configuration
  const selectedQuestions = shuffle(questionsData).slice(0, 3);
  return {
    code,
    hostId: 'host_' + Math.random().toString(36).substring(2, 9),
    state: 'LOBBY', // LOBBY, INTRO, QUESTION, REVEAL, LEADERBOARD, PODIUM
    players: {},
    questions: selectedQuestions,
    currentQIndex: 0,
    qStartTime: 0,
    buzzerLockedBy: null,
    reactions: [],
    version: 1,
    updatedAt: Date.now()
  };
}

function getSafeRoomView(room) {
  if (!room) return null;

  const now = Date.now();
  const curQ = room.questions[room.currentQIndex] || null;

  // Calculate remaining time for question or intro
  let timeLeft = 0;
  if (room.state === 'INTRO') {
    const elapsed = Math.floor((now - room.qStartTime) / 1000);
    timeLeft = Math.max(0, 3 - elapsed);
    if (timeLeft === 0 && room.qStartTime > 0) {
      // Auto-advance state to QUESTION
      room.state = 'QUESTION';
      room.qStartTime = Date.now();
    }
  }

  if (room.state === 'QUESTION' && curQ) {
    const elapsed = Math.floor((now - room.qStartTime) / 1000);
    timeLeft = Math.max(0, (curQ.timeLimit || 15) - elapsed);
    if (timeLeft === 0 && room.qStartTime > 0) {
      // Time is up, auto-advance to REVEAL
      resolveQuestionReveal(room);
    }
  }

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

  let questionData = null;
  if (curQ && room.state !== 'LOBBY' && room.state !== 'PODIUM') {
    questionData = {
      index: room.currentQIndex + 1,
      total: room.questions.length,
      category: curQ.category,
      mode: curQ.mode,
      question: curQ.question,
      options: curQ.options,
      timeLimit: curQ.timeLimit || 15,
      correctIndex: (room.state === 'REVEAL' || room.state === 'LEADERBOARD') ? curQ.correctIndex : null,
      explanation: (room.state === 'REVEAL' || room.state === 'LEADERBOARD') ? curQ.explanation : null
    };
  }

  let answerStats = [0, 0, 0, 0];
  if (room.state === 'REVEAL' || room.state === 'LEADERBOARD') {
    Object.values(room.players).forEach(p => {
      if (p.currentAnswer !== null && p.currentAnswer >= 0 && p.currentAnswer < 4) {
        answerStats[p.currentAnswer]++;
      }
    });
  }

  // Filter recent reactions (past 4 seconds)
  const recentReactions = (room.reactions || []).filter(r => (now - r.timestamp) < 4000);

  return {
    code: room.code,
    state: room.state,
    players: playersList,
    question: questionData,
    timeLeft,
    buzzerLockedBy: room.buzzerLockedBy,
    buzzerPlayerName: room.buzzerLockedBy ? (room.players[room.buzzerLockedBy]?.name || 'Someone') : null,
    answerStats: (room.state === 'REVEAL') ? answerStats : null,
    reactions: recentReactions,
    updatedAt: room.updatedAt
  };
}

function resolveQuestionReveal(room) {
  room.state = 'REVEAL';
  const curQ = room.questions[room.currentQIndex];
  if (!curQ) return;

  Object.values(room.players).forEach(p => {
    if (p.currentAnswer === curQ.correctIndex) {
      const basePoints = curQ.mode === 'buzzer' ? 1000 : 500;
      const speedBonus = curQ.mode === 'buzzer' ? 0 : Math.max(50, Math.round(500 * (p.answerTimeLeft / 15)));
      const streakBonus = Math.min((p.streak || 0) * 50, 250);
      const earned = basePoints + speedBonus + streakBonus;

      p.score += earned;
      p.streak = (p.streak || 0) + 1;
      p.lastPoints = earned;
    } else if (p.currentAnswer !== null) {
      p.streak = 0;
      p.lastPoints = curQ.mode === 'buzzer' ? -200 : 0;
      p.score = Math.max(0, p.score + p.lastPoints);
    } else {
      p.streak = 0;
      p.lastPoints = 0;
    }
  });
}

module.exports = {
  questionsData,
  generateCode,
  createInitialRoom,
  getSafeRoomView,
  resolveQuestionReveal
};
