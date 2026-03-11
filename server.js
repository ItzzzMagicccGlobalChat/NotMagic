import express from "express";
import http from "http";
import WebSocket from "ws";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

/* ---------------- ENV ---------------- */

dotenv.config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* ---------------- CRASH PROTECTION ---------------- */

process.on("uncaughtException", (err) => {
console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
console.error("Unhandled Rejection:", err);
});

/* ---------------- EXPRESS ---------------- */

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

/* ---------------- RATE LIMIT ---------------- */

const authLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 20
});

app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);

/* ---------------- HEALTH CHECK ---------------- */

app.get("/", (req, res) => {
res.json({
service: "NotMagic Chat",
status: "online",
uptime: process.uptime()
});
});

/* ---------------- SERVER ---------------- */

const server = http.createServer(app);

const wss = new WebSocket.Server({
server,
maxPayload: 1024 * 1024
});

/* ---------------- MEMORY STORAGE ---------------- */

const users = new Map();
const messages = [];
const dmMessages = new Map();
const userSessions = new Map();

const MAX_MESSAGES = 50;
const MAX_DM_MESSAGES = 50;
const MAX_CONNECTIONS = 500;

/* ---------------- UTILITIES ---------------- */

function sanitize(text = "") {
return text.replace(/[<>]/g, "").substring(0, 500);
}

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

/* ---------------- SPAM PROTECTION ---------------- */

const lastMessageTime = new Map();

function canSend(user) {
const now = Date.now();
const last = lastMessageTime.get(user) || 0;

if (now - last < 500) return false;

lastMessageTime.set(user, now);
return true;
}

/* ---------------- AUTH ROUTES ---------------- */

app.post("/api/register", async (req, res) => {

try {

```
const { username, password } = req.body;

if (!username || !password)
  return res.status(400).json({ error: "Missing credentials" });

if (users.has(username))
  return res.status(409).json({ error: "User exists" });

const hash = await bcrypt.hash(password, 10);

users.set(username, {
  username,
  passwordHash: hash,
  rank: "MEMBER",
  isBanned: false
});

res.json({
  token: generateToken(username),
  username
});
```

} catch {

```
res.status(500).json({ error: "Registration failed" });
```

}

});

app.post("/api/login", async (req, res) => {

try {

```
const { username, password } = req.body;

const user = users.get(username);

if (!user)
  return res.status(401).json({ error: "Invalid credentials" });

const valid = await bcrypt.compare(password, user.passwordHash);

if (!valid)
  return res.status(401).json({ error: "Invalid credentials" });

res.json({
  token: generateToken(username),
  username,
  rank: user.rank
});
```

} catch {

```
res.status(500).json({ error: "Login failed" });
```

}

});

/* ---------------- WEBSOCKET ---------------- */

wss.on("connection", (ws) => {

if (wss.clients.size > MAX_CONNECTIONS) {
ws.close();
return;
}

ws.isAlive = true;
let currentUser = null;

ws.on("pong", () => {
ws.isAlive = true;
});

ws.on("message", (data) => {

```
let msg;

try {
  msg = JSON.parse(data);
} catch {
  ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
  return;
}

try {

  /* AUTH */

  if (msg.type === "auth") {

    const decoded = verifyToken(msg.token);

    if (!decoded) {
      ws.close();
      return;
    }

    currentUser = decoded.username;

    userSessions.set(currentUser, ws);

    ws.send(JSON.stringify({
      type: "auth_success",
      username: currentUser
    }));

    broadcastOnline();

    return;
  }

  if (!currentUser) return;

  /* CHAT */

  if (msg.type === "chat") {

    if (!canSend(currentUser)) return;

    const message = {
      id: Date.now(),
      username: currentUser,
      text: sanitize(msg.text),
      timestamp: Date.now()
    };

    messages.push(message);

    if (messages.length > MAX_MESSAGES)
      messages.shift();

    broadcast({
      type: "chat",
      message
    });

  }

  /* DIRECT MESSAGE */

  if (msg.type === "dm") {

    const recipient = msg.recipient;

    if (!users.has(recipient)) return;

    const key = [currentUser, recipient].sort().join(":");

    if (!dmMessages.has(key))
      dmMessages.set(key, []);

    const dm = {
      id: Date.now(),
      sender: currentUser,
      recipient,
      text: sanitize(msg.text),
      timestamp: Date.now()
    };

    const list = dmMessages.get(key);

    list.push(dm);

    if (list.length > MAX_DM_MESSAGES)
      list.shift();

    const recipientWS = userSessions.get(recipient);

    if (recipientWS) {

      recipientWS.send(JSON.stringify({
        type: "dm",
        message: dm
      }));

    }

  }

} catch (err) {

  console.error("Message handler error:", err);

}
```

});

ws.on("close", () => {

```
if (currentUser) {

  userSessions.delete(currentUser);
  broadcastOnline();

}
```

});

});

/* ---------------- BROADCAST ---------------- */

function broadcast(data) {

const msg = JSON.stringify(data);

for (const client of wss.clients) {

```
if (client.readyState === WebSocket.OPEN) {

  try {
    client.send(msg);
  } catch {}

}
```

}

}

function broadcastOnline() {

const online = [];

for (const username of userSessions.keys()) {

```
online.push({ username });
```

}

broadcast({
type: "online_users",
users: online
});

}

/* ---------------- HEARTBEAT ---------------- */

setInterval(() => {

for (const ws of wss.clients) {

```
if (!ws.isAlive) {
  ws.terminate();
  continue;
}

ws.isAlive = false;
ws.ping();
```

}

}, 30000);

/* ---------------- CLEANUP ---------------- */

setInterval(() => {

for (const [username, socket] of userSessions.entries()) {

```
if (socket.readyState !== WebSocket.OPEN) {
  userSessions.delete(username);
}
```

}

}, 30000);

/* ---------------- MEMORY WATCH ---------------- */

setInterval(() => {

const mem = process.memoryUsage().heapUsed / 1024 / 1024;

if (mem > 400) {
console.warn("High memory usage:", mem.toFixed(2), "MB");
}

}, 60000);

/* ---------------- START SERVER ---------------- */

server.listen(PORT, "0.0.0.0", () => {

console.log(`🚀 NotMagic server running on port ${PORT}`);

});

/* ---------------- GRACEFUL SHUTDOWN ---------------- */

process.on("SIGTERM", () => {

console.log("Shutting down server...");

server.close(() => {
process.exit(0);
});

});
