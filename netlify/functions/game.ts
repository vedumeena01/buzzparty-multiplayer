import { getStore } from "@netlify/blobs";
// Helper imported from outside netlify/functions as strictly required
const {
  generateCode,
  createInitialRoom,
  getSafeRoomView,
  resolveQuestionReveal
} = require("../../lib/triviaEngine");

// In-memory fallback cache for local dev / testing if Blobs store context is not connected
const localMemoryStore = new Map<string, any>();

function getRoomsStore() {
  try {
    return getStore({ name: "buzzparty-rooms", consistency: "strong" });
  } catch (e) {
    return null;
  }
}

async function readRoom(code: string): Promise<any> {
  const store = getRoomsStore();
  if (store) {
    try {
      const data = await store.get(code, { type: "json" });
      if (data) return data;
    } catch (e) {
      // Fallback
    }
  }
  return localMemoryStore.get(code) || null;
}

async function saveRoom(code: string, room: any): Promise<void> {
  room.version = (room.version || 0) + 1;
  room.updatedAt = Date.now();

  const store = getRoomsStore();
  if (store) {
    try {
      // Conditional write using strong consistency
      await store.setJSON(code, room);
    } catch (e) {
      // Fallback to local memory if store is not available
    }
  }
  localMemoryStore.set(code, room);
}

// Universal handler supporting both Netlify Functions v2 (Request/Response) and v1 (event)
export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  let body: any = {};

  if (req.method === "POST") {
    try {
      body = await req.json();
      if (body.action) action = body.action;
    } catch (e) {
      body = {};
    }
  }

  const responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate"
  };

  try {
    // 1. CREATE ROOM
    if (action === "create_room") {
      let code = generateCode();
      while (await readRoom(code)) {
        code = generateCode();
      }
      const newRoom = createInitialRoom(code);
      await saveRoom(code, newRoom);

      return new Response(
        JSON.stringify({ success: true, code, roomData: getSafeRoomView(newRoom) }),
        { status: 200, headers: responseHeaders }
      );
    }

    // 2. GET ROOM STATE
    if (action === "get_room") {
      const code = (url.searchParams.get("code") || body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room) {
        return new Response(
          JSON.stringify({ success: false, error: "Room not found" }),
          { status: 404, headers: responseHeaders }
        );
      }
      // Evaluate automatic time expirations
      const safeView = getSafeRoomView(room);
      await saveRoom(code, room);

      return new Response(
        JSON.stringify({ success: true, roomData: safeView }),
        { status: 200, headers: responseHeaders }
      );
    }

    // 3. JOIN ROOM
    if (action === "join_room") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room) {
        return new Response(
          JSON.stringify({ success: false, error: `Room "${code}" not found.` }),
          { status: 404, headers: responseHeaders }
        );
      }

      const playerId = body.playerId || "player_" + Math.random().toString(36).substring(2, 9);
      if (!room.players[playerId]) {
        room.players[playerId] = {
          id: playerId,
          name: (body.name || "Player").slice(0, 16),
          avatar: body.avatar || "⚡",
          score: 0,
          streak: 0,
          lastPoints: 0,
          currentAnswer: null,
          answerTimeLeft: 0
        };
      } else {
        if (body.name) room.players[playerId].name = body.name.slice(0, 16);
        if (body.avatar) room.players[playerId].avatar = body.avatar;
      }

      await saveRoom(code, room);
      return new Response(
        JSON.stringify({
          success: true,
          playerId,
          player: room.players[playerId],
          roomData: getSafeRoomView(room)
        }),
        { status: 200, headers: responseHeaders }
      );
    }

    // 4. START GAME
    if (action === "start_game") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: responseHeaders });

      room.currentQIndex = 0;
      room.state = "INTRO";
      room.qStartTime = Date.now();
      room.buzzerLockedBy = null;

      Object.values(room.players).forEach((p: any) => {
        p.currentAnswer = null;
        p.lastPoints = 0;
        p.answerTimeLeft = 0;
      });

      await saveRoom(code, room);
      return new Response(JSON.stringify({ success: true, roomData: getSafeRoomView(room) }), { status: 200, headers: responseHeaders });
    }

    // 5. SUBMIT ANSWER
    if (action === "submit_answer") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room || room.state !== "QUESTION") {
        return new Response(JSON.stringify({ error: "Question not active" }), { status: 400, headers: responseHeaders });
      }

      const player = room.players[body.playerId];
      if (!player || player.currentAnswer !== null) {
        return new Response(JSON.stringify({ error: "Already answered or player not found" }), { status: 400, headers: responseHeaders });
      }

      const curQ = room.questions[room.currentQIndex];
      if (curQ.mode === "buzzer" && room.buzzerLockedBy !== player.id) {
        return new Response(JSON.stringify({ error: "Buzzer not locked by you" }), { status: 403, headers: responseHeaders });
      }

      const elapsed = Math.floor((Date.now() - room.qStartTime) / 1000);
      const timeLeft = Math.max(0, (curQ.timeLimit || 15) - elapsed);

      player.currentAnswer = body.optionIndex;
      player.answerTimeLeft = timeLeft;

      // Check if all players answered
      const activePlayers = Object.values(room.players);
      const allAnswered = activePlayers.every((p: any) => p.currentAnswer !== null);

      if (curQ.mode === "buzzer" || allAnswered) {
        resolveQuestionReveal(room);
      }

      await saveRoom(code, room);
      return new Response(JSON.stringify({ success: true, optionIndex: body.optionIndex, roomData: getSafeRoomView(room) }), { status: 200, headers: responseHeaders });
    }

    // 6. PRESS BUZZER
    if (action === "press_buzzer") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room || room.state !== "QUESTION") {
        return new Response(JSON.stringify({ error: "Question not active" }), { status: 400, headers: responseHeaders });
      }

      if (!room.buzzerLockedBy) {
        room.buzzerLockedBy = body.playerId;
        await saveRoom(code, room);
      }

      return new Response(JSON.stringify({ success: true, buzzerLockedBy: room.buzzerLockedBy, roomData: getSafeRoomView(room) }), { status: 200, headers: responseHeaders });
    }

    // 7. ADVANCE TO LEADERBOARD
    if (action === "next_leaderboard") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: responseHeaders });

      room.state = "LEADERBOARD";
      await saveRoom(code, room);
      return new Response(JSON.stringify({ success: true, roomData: getSafeRoomView(room) }), { status: 200, headers: responseHeaders });
    }

    // 8. NEXT QUESTION OR PODIUM
    if (action === "next_question") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: responseHeaders });

      if (room.currentQIndex + 1 < room.questions.length) {
        room.currentQIndex++;
        room.state = "INTRO";
        room.qStartTime = Date.now();
        room.buzzerLockedBy = null;
        Object.values(room.players).forEach((p: any) => {
          p.currentAnswer = null;
          p.lastPoints = 0;
          p.answerTimeLeft = 0;
        });
      } else {
        room.state = "PODIUM";
      }

      await saveRoom(code, room);
      return new Response(JSON.stringify({ success: true, roomData: getSafeRoomView(room) }), { status: 200, headers: responseHeaders });
    }

    // 9. REACTION CANNON
    if (action === "send_reaction") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (room) {
        const player = room.players[body.playerId];
        if (!room.reactions) room.reactions = [];
        room.reactions.push({
          id: Math.random().toString(36).substring(2, 9),
          emoji: body.emoji || "🎉",
          senderName: player ? player.name : "",
          x: Math.random() * 80 + 10,
          timestamp: Date.now()
        });
        await saveRoom(code, room);
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: responseHeaders });
    }

    // 10. RESTART GAME
    if (action === "restart_game") {
      const code = (body.code || "").toUpperCase().trim();
      const room = await readRoom(code);
      if (room) {
        const freshRoom = createInitialRoom(code);
        // keep players but reset scores
        Object.values(room.players).forEach((p: any) => {
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
        await saveRoom(code, freshRoom);
        return new Response(JSON.stringify({ success: true, roomData: getSafeRoomView(freshRoom) }), { status: 200, headers: responseHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: responseHeaders });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), { status: 500, headers: responseHeaders });
  }
};
