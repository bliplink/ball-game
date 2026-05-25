const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const rooms = new Map();
let nextClientId = 1;

function send(ws, payload) {
  if (!ws || ws.readyState !== ws.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function getRoomClientIds(room) {
  return [room.hostClientId, room.guestClientId].filter(Boolean);
}

function getOtherClient(room, clientId) {
  if (room.hostClientId === clientId) {
    return room.guestSocket;
  }
  if (room.guestClientId === clientId) {
    return room.hostSocket;
  }
  return null;
}

function cleanupClient(ws) {
  for (const [roomCode, room] of rooms.entries()) {
    if (room.hostSocket === ws || room.guestSocket === ws) {
      const otherSocket = room.hostSocket === ws ? room.guestSocket : room.hostSocket;
      send(otherSocket, { type: "peer_left", roomCode });
      rooms.delete(roomCode);
      return;
    }
  }
}

const server = http.createServer((req, res) => {
  let targetPath = req.url === "/" ? "/index.html" : req.url;
  if (targetPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  targetPath = decodeURIComponent(targetPath.split("?")[0]);
  const filePath = path.normalize(path.join(ROOT, targetPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.clientId = `client-${nextClientId}`;
  nextClientId += 1;
  send(ws, { type: "hello", clientId: ws.clientId });

  ws.on("message", (buffer) => {
    let data;
    try {
      data = JSON.parse(buffer.toString());
    } catch (error) {
      send(ws, { type: "error", message: "消息不是合法的 JSON。" });
      return;
    }

    if (data.type === "create_room") {
      const roomCode = generateRoomCode();
      rooms.set(roomCode, {
        roomCode,
        hostClientId: ws.clientId,
        hostSocket: ws,
        guestClientId: null,
        guestSocket: null,
      });
      send(ws, { type: "room_created", roomCode });
      return;
    }

    if (data.type === "join_room") {
      const room = rooms.get(data.roomCode);
      if (!room) {
        send(ws, { type: "error", message: "房间不存在。" });
        return;
      }
      if (room.guestSocket) {
        send(ws, { type: "error", message: "房间已满。" });
        return;
      }
      room.guestSocket = ws;
      room.guestClientId = ws.clientId;
      send(ws, { type: "room_joined", roomCode: room.roomCode, isHost: false });
      send(room.hostSocket, { type: "peer_joined", roomCode: room.roomCode });
      return;
    }

    if (data.type === "host_snapshot") {
      const room = rooms.get(data.roomCode);
      if (!room || room.hostClientId !== ws.clientId) {
        return;
      }
      send(room.guestSocket, { type: "host_snapshot", roomCode: room.roomCode, snapshot: data.snapshot });
      return;
    }

    if (data.type === "relay_action") {
      const room = rooms.get(data.roomCode);
      if (!room) {
        return;
      }
      const otherSocket = getOtherClient(room, ws.clientId);
      send(otherSocket, { type: "relay_action", roomCode: room.roomCode, action: data.action });
      return;
    }
  });

  ws.on("close", () => {
    cleanupClient(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Velvet Break server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
