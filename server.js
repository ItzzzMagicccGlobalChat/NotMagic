import express from "express";
import http from "http";
import WebSocket from "ws";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

/* ----------------------------- ENV VALIDATION ----------------------------- */

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET missing from environment variables.");
  process.exit(1);
}

/* ------------------------------ PATH SETUP ------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------ EXPRESS APP ------------------------------ */

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  maxPayload: 1024 * 1024
});

/* ------------------------------ MIDDLEWARE ------------------------------ */

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ------------------------------ RATE LIMITS ------------------------------ */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20
});

app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);

/* ------------------------------ HEALTH CHECK ------------------------------ */

app.get("/", (req, res) => {
  res.json({
    service: "NotMagic Chat",
    status: "online",
    uptime: process.uptime()
  });
});

/* ------------------------------ DATABASE (MEMORY) ------------------------------ */

const users = new Map();
const messages = [];
const dmMessages = new Map();
const userSessions = new Map();

const MAX_MESSAGES = 100;
const MAX_DM_MESSAGES = 100;

/* ------------------------------ RANK SYSTEM ------------------------------ */

const RANKS = {
  OWNER: { level: 5, permissions: ["ban", "kick", "timeout"] },
  CO_OWNER: { level: 4, permissions: ["ban", "kick", "timeout"] },
  SENIOR_ADMIN: { level: 3, permissions: ["kick", "timeout"] },
  ADMIN: { level: 2, permissions: ["kick", "timeout"] },
  TRIAL_ADMIN: { level: 1, permissions: ["timeout"] },
  MEMBER: { level: 0, permissions: [] }
};

/* ------------------------------ UTILITIES ------------------------------ */

const sanitize = (text = "") =>
  text
    .replace(/[<>"']/g, "")
    .substring(0, 500);

function generateToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: "24h" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/* ------------------------------ AUTH API ------------------------------ */

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "Missing credentials" });

  if (users.has(username))
    return res.status(409).json({ error: "User exists" });

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    users.set(username, {
      username,
      passwordHash,
      rank: "MEMBER",
      createdAt: new Date(),
      isBanned: false
    });

    res.json({
      token: generateToken(username),
      username
    });
  } catch {
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users.get(username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  res.json({
    token: generateToken(username),
    username,
    rank: user.rank
  });
});

/* ------------------------------ WEBSOCKET ------------------------------ */

wss.on("connection", (ws) => {
  let currentUser = null;
  ws.isAlive = true;

  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", async (data) => {
    let message;

    try {
      message = JSON.parse(data);
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
      return;
    }

    /* -------- AUTH -------- */

    if (message.type === "auth") {
      const decoded = verifyToken(message.token);

      if (!decoded) {
        ws.close();
        return;
      }

      const user = users.get(decoded.username);

      if (!user || user.isBanned) {
        ws.close();
        return;
      }

      currentUser = decoded.username;
      userSessions.set(currentUser, ws);

      ws.send(
        JSON.stringify({
          type: "auth_success",
          user: {
            username: currentUser,
            rank: user.rank
          }
        })
      );

      broadcastOnlineUsers();
      return;
    }

    if (!currentUser) return;

    const user = users.get(currentUser);

    /* -------- GLOBAL CHAT -------- */

    if (message.type === "chat") {
      const chatMessage = {
        id: Date.now(),
        username: currentUser,
        text: sanitize(message.text),
        rank: user.rank,
        timestamp: Date.now(),
        reactions: []
      };

      messages.push(chatMessage);

      if (messages.length > MAX_MESSAGES) messages.shift();

      broadcast({
        type: "chat",
        message: chatMessage
      });
    }

    /* -------- DM -------- */

    if (message.type === "dm") {
      const recipient = message.recipient;

      if (!users.has(recipient)) return;

      const key = [currentUser, recipient].sort().join(":");

      if (!dmMessages.has(key)) dmMessages.set(key, []);

      const dm = {
        id: Date.now(),
        sender: currentUser,
        recipient,
        text: sanitize(message.text),
        timestamp: Date.now()
      };

      const list = dmMessages.get(key);

      list.push(dm);

      if (list.length > MAX_DM_MESSAGES) list.shift();

      const recipientWS = userSessions.get(recipient);

      if (recipientWS) {
        recipientWS.send(
          JSON.stringify({
            type: "dm",
            message: dm
          })
        );
      }

      ws.send(JSON.stringify({ type: "dm_sent", message: dm }));
    }
  });

  ws.on("close", () => {
    if (currentUser) {
      userSessions.delete(currentUser);
      broadcastOnlineUsers();
    }
  });

  ws.on("error", () => {
    if (currentUser) {
      userSessions.delete(currentUser);
      broadcastOnlineUsers();
    }
  });
});

/* ------------------------------ BROADCAST ------------------------------ */

function broadcast(data) {
  const message = JSON.stringify(data);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function broadcastOnlineUsers() {
  const online = [];

  for (const username of userSessions.keys()) {
    const user = users.get(username);

    online.push({
      username,
      rank: user.rank
    });
  }

  broadcast({
    type: "online_users",
    users: online
  });
}

/* ------------------------------ HEARTBEAT ------------------------------ */

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

/* ------------------------------ SERVER START ------------------------------ */

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 NotMagic Chat running on port ${PORT}`);
});

/* ------------------------------ GRACEFUL SHUTDOWN ------------------------------ */

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  server.close(() => process.exit(0));
});
