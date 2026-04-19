const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, "data", "bricks.json");

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ bricks: [] }, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.bricks)) {
      return { bricks: [] };
    }
    return parsed;
  } catch (error) {
    return { bricks: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function createStoredBrick(payload) {
  const rawNote = typeof payload.note === "string" ? payload.note : "";
  const note = rawNote.trim().slice(0, 220);
  return {
    id: payload.id || randomUUID(),
    x: Number(payload.x),
    y: Number(payload.y),
    angle: Number(payload.angle || 0),
    width: Number(payload.width || 80),
    height: Number(payload.height || 24),
    note: note || undefined
  };
}

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  const db = readDb();
  socket.emit("tower:init", db.bricks);

  socket.on("brick:place", (incoming) => {
    const dbState = readDb();
    const brick = createStoredBrick(incoming);

    if (
      !Number.isFinite(brick.x) ||
      !Number.isFinite(brick.y) ||
      !Number.isFinite(brick.angle)
    ) {
      return;
    }

    dbState.bricks.push(brick);
    writeDb(dbState);
    io.emit("brick:placed", brick);
  });
});

function startServer(port, retriesLeft = 10) {
  const onError = (error) => {
    cleanup();
    if (error.code === "EADDRINUSE" && retriesLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy, retrying on ${nextPort}...`);
      startServer(nextPort, retriesLeft - 1);
      return;
    }
    throw error;
  };

  const onListening = () => {
    cleanup();
    const address = server.address();
    const actualPort = address && typeof address === "object" ? address.port : port;
    console.log(`Server listening on http://localhost:${actualPort}`);
  };

  function cleanup() {
    server.off("error", onError);
    server.off("listening", onListening);
  }

  server.on("error", onError);
  server.on("listening", onListening);
  server.listen(port);
}

startServer(DEFAULT_PORT);
