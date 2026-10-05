// Automated End-to-End Simulation Test for BuzzParty
const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function runSimulation() {
  console.log('--- STARTING BUZZPARTY MULTIPLAYER TEST ---');

  // 1. Connect Host
  const hostSocket = io(SERVER_URL);
  let roomCode = null;

  await new Promise((resolve) => {
    hostSocket.on('connect', () => {
      console.log('✅ Host connected to server');
      hostSocket.emit('create_room');
    });

    hostSocket.on('room_created', ({ code, roomData }) => {
      roomCode = code;
      console.log(`✅ Host created room with code: [${code}]`);
      console.log(`Initial room state: ${roomData.state}, Players: ${roomData.players.length}`);
      resolve();
    });
  });

  // 2. Connect Player 1 (Alex)
  const p1Socket = io(SERVER_URL);
  await new Promise((resolve) => {
    p1Socket.on('connect', () => {
      p1Socket.emit('join_room', {
        code: roomCode,
        name: 'Alex The Great',
        avatar: '🚀'
      });
    });

    p1Socket.on('joined_successfully', ({ player, roomData }) => {
      console.log(`✅ Player 1 joined: ${player.name} (${player.avatar}), Room: ${roomData.code}`);
      resolve();
    });
  });

  // 3. Connect Player 2 (Sam)
  const p2Socket = io(SERVER_URL);
  await new Promise((resolve) => {
    p2Socket.on('connect', () => {
      p2Socket.emit('join_room', {
        code: roomCode,
        name: 'Sam Samurai',
        avatar: '⚡'
      });
    });

    p2Socket.on('joined_successfully', ({ player, roomData }) => {
      console.log(`✅ Player 2 joined: ${player.name} (${player.avatar}), Total Players in Room: ${roomData.players.length}`);
      resolve();
    });
  });

  // 4. Test Reaction Cannon
  await new Promise((resolve) => {
    hostSocket.once('new_reaction', (data) => {
      console.log(`✅ Reaction Cannon broadcast received by Host: ${data.emoji} from ${data.senderName}`);
      resolve();
    });
    p1Socket.emit('send_reaction', { emoji: '🔥' });
  });

  // 5. Host Starts Game
  console.log('▶️ Host starting game...');
  hostSocket.emit('start_game');

  // Wait for Question to become active
  await new Promise((resolve) => {
    p1Socket.on('room_sync', (roomData) => {
      console.log(`🔄 Room State Synced: [${roomData.state}]`);
      if (roomData.state === 'QUESTION') {
        console.log(`✅ Question is ACTIVE: "${roomData.question.question}"`);
        console.log(`Options: ${JSON.stringify(roomData.question.options)}`);
        resolve();
      }
    });
  });

  // 6. Players submit answers
  console.log('⚡ Players submitting answers...');
  p1Socket.emit('submit_answer', { optionIndex: 0 });
  p2Socket.emit('submit_answer', { optionIndex: 1 });

  // 7. Wait for Reveal & Score calculation
  await new Promise((resolve) => {
    hostSocket.on('room_sync', (roomData) => {
      if (roomData.state === 'REVEAL') {
        console.log(`✅ REVEAL State Reached!`);
        console.log(`Correct Index: ${roomData.question.correctIndex} - ${roomData.question.options[roomData.question.correctIndex]}`);
        console.log(`Explanation: "${roomData.question.explanation}"`);
        roomData.players.forEach(p => {
          console.log(`Player ${p.name}: Score = ${p.score} pts (Earned: ${p.lastPoints} pts, Streak: ${p.streak})`);
        });
        resolve();
      }
    });
  });

  // 8. Advance to Leaderboard
  console.log('▶️ Host advancing to Leaderboard...');
  hostSocket.emit('next_leaderboard');

  await new Promise((resolve) => {
    hostSocket.on('room_sync', (roomData) => {
      if (roomData.state === 'LEADERBOARD') {
        console.log(`✅ LEADERBOARD State Verified! Top player: ${roomData.players[0].name} with ${roomData.players[0].score} pts`);
        resolve();
      }
    });
  });

  console.log('🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');

  // Cleanup sockets
  p1Socket.disconnect();
  p2Socket.disconnect();
  hostSocket.disconnect();
  process.exit(0);
}

runSimulation().catch(err => {
  console.error('❌ Simulation Error:', err);
  process.exit(1);
});
