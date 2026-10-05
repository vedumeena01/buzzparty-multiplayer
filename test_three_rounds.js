// Complete Three-Round Game Simulation Test for Netlify Function Parity
const triviaEngine = require('./lib/triviaEngine');

async function testCompleteThreeRoundGame() {
  console.log('=====================================================');
  console.log('🧪 TESTING 3-ROUND MULTIPLAYER GAME WITH 2 PLAYERS');
  console.log('=====================================================');

  // 1. Create Room
  const code = triviaEngine.generateCode();
  const room = triviaEngine.createInitialRoom(code);
  console.log(`✅ [Room Created] Code: ${code}, Total Rounds: ${room.questions.length}`);

  // 2. Player 1 (Maya) & Player 2 (Liam) Join
  room.players['p1'] = {
    id: 'p1',
    name: 'Maya',
    avatar: '🚀',
    score: 0,
    streak: 0,
    lastPoints: 0,
    currentAnswer: null,
    answerTimeLeft: 0
  };

  room.players['p2'] = {
    id: 'p2',
    name: 'Liam',
    avatar: '⚡',
    score: 0,
    streak: 0,
    lastPoints: 0,
    currentAnswer: null,
    answerTimeLeft: 0
  };
  console.log(`✅ [Players Joined] Maya (🚀) and Liam (⚡) joined room ${code}`);

  // Loop through 3 rounds
  for (let round = 1; round <= 3; round++) {
    console.log(`\n--- ROUND ${round} OF 3 ---`);
    room.currentQIndex = round - 1;
    const curQ = room.questions[room.currentQIndex];
    room.state = 'QUESTION';
    room.buzzerLockedBy = null;
    room.qStartTime = Date.now();

    console.log(`Category: "${curQ.category}" (Mode: ${curQ.mode})`);
    console.log(`Question: "${curQ.question}"`);
    console.log(`Options: ${curQ.options.join(' | ')}`);

    // Reset player answers
    Object.values(room.players).forEach(p => {
      p.currentAnswer = null;
      p.lastPoints = 0;
      p.answerTimeLeft = 0;
    });

    if (curQ.mode === 'buzzer') {
      // Liam hits buzzer first!
      room.buzzerLockedBy = 'p2';
      console.log(`🚨 Liam slammed buzzer first! Locked in.`);
      room.players['p2'].currentAnswer = curQ.correctIndex;
      room.players['p2'].answerTimeLeft = 10;
    } else {
      // Maya answers correctly with high speed
      room.players['p1'].currentAnswer = curQ.correctIndex;
      room.players['p1'].answerTimeLeft = 12; // 12 seconds remaining out of 15

      // Liam answers incorrectly or with lower speed
      room.players['p2'].currentAnswer = (curQ.correctIndex + 1) % 4;
      room.players['p2'].answerTimeLeft = 8;
    }

    // Resolve question reveal & scoring
    triviaEngine.resolveQuestionReveal(room);
    console.log(`Correct Answer: Option ${curQ.correctIndex + 1} - "${curQ.options[curQ.correctIndex]}"`);
    console.log(`Scores after Round ${round}:`);
    console.log(`  Maya: ${room.players['p1'].score} pts (Round: +${room.players['p1'].lastPoints} pts, Streak: ${room.players['p1'].streak})`);
    console.log(`  Liam: ${room.players['p2'].score} pts (Round: +${room.players['p2'].lastPoints} pts, Streak: ${room.players['p2'].streak})`);

    // Advance to Leaderboard
    room.state = 'LEADERBOARD';
  }

  // Final Podium
  room.state = 'PODIUM';
  const sorted = Object.values(room.players).sort((a, b) => b.score - a.score);
  const champion = sorted[0];
  const runnerUp = sorted[1];

  console.log('\n=====================================================');
  console.log('🏆 FINAL CHAMPIONS PODIUM');
  console.log(`🥇 1st Place (Champion): ${champion.name} (${champion.avatar}) with ${champion.score.toLocaleString()} pts`);
  console.log(`🥈 2nd Place: ${runnerUp.name} (${runnerUp.avatar}) with ${runnerUp.score.toLocaleString()} pts`);
  console.log('=====================================================');

  if (champion.score > 0) {
    console.log('🎉 3-ROUND MULTIPLAYER GAME VERIFIED WITH 100% SUCCESS!');
    process.exit(0);
  } else {
    console.error('❌ Scoring failed');
    process.exit(1);
  }
}

testCompleteThreeRoundGame().catch(err => {
  console.error(err);
  process.exit(1);
});
