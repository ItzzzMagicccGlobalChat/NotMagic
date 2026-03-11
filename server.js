import express from "express";
import http from "http";
import WebSocket from "ws";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

/* ---------------- CONFIG ---------------- */

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "notmagic_dev_secret";

/* ---------------- APP ---------------- */

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: "1mb" }));
app.use(cors());
app.use(helmet());

const limiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 200
});

app.use(limiter);

/* ---------------- DATABASE (MEMORY) ---------------- */

const users = new Map();
const sessions = new Map();
const messages = [];

/* ---------------- RANKS ---------------- */

const RANKS = {
OWNER: { level: 5 },
ADMIN: { level: 3 },
MEMBER: { level: 0 }
};

/* ---------------- UTIL ---------------- */

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

function sanitize(text) {
if (!text) return "";
return text
.replace(/</g, "<")
.replace(/>/g, ">")
.substring(0, 500);
}

/* ---------------- DEFAULT USER ---------------- */

async function createDefaultUser() {

if (users.has("NotMagic")) return;

const hash = await bcrypt.hash("Kiomara@8", 10);

users.set("NotMagic", {
username: "NotMagic",
passwordHash: hash,
rank: "OWNER",
createdAt: new Date(),
isBanned: false
});

console.log("✅ Default user created");
}

/* ---------------- API ---------------- */

app.get("/", (req, res) => {
res.json({
service: "NotMagic Chat",
status: "online"
});
});

/* REGISTER */

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
  createdAt: new Date(),
  isBanned: false
});

const token = generateToken(username);

res.json({ token, username });
```

} catch (err) {

```
console.error(err);
res.status(500).json({ error: "Register failed" });
```

}

});

/* LOGIN */

app.post("/api/login", async (req, res) => {

try {

```
const { username, password } = req.body;

const user = users.get(username);

if (!user)
  return res.status(401).json({ error: "Invalid login" });

const valid = await bcrypt.compare(password, user.passwordHash);

if (!valid)
  return res.status(401).json({ error: "Invalid login" });

const token = generateToken(username);

res.json({
  token,
  username,
  rank: user.rank
});
```

} catch (err) {

```
console.error(err);
res.status(500).json({ error: "Login failed" });
```

}

});

/* ---------------- WEBSOCKET ---------------- */

wss.on("connection", (ws) => {

let currentUser = null;

ws.on("message", (raw) => {

```
let data;

try {
  data = JSON.parse(raw);
} catch {
  return;
}

/* AUTH */

if (data.type === "auth") {

  const decoded = verifyToken(data.token);

  if (!decoded) {
    ws.send(JSON.stringify({ type: "error", error: "Invalid token" }));
    return;
  }

  currentUser = decoded.username;

  sessions.set(currentUser, ws);

  ws.send(JSON.stringify({
    type: "auth_success",
    username: currentUser
  }));

  return;
}

if (!currentUser) return;

const user = users.get(currentUser);

if (!user) return;

/* CHAT MESSAGE */

if (data.type === "chat") {

  const msg = {
    id: Date.now(),
    username: currentUser,
    text: sanitize(data.text),
    timestamp: Date.now()
  };

  messages.push(msg);

  if (messages.length > 100)
    messages.shift();

  broadcast({
    type: "chat",
    message: msg
  });

}
```

});

ws.on("close", () => {

```
if (currentUser)
  sessions.delete(currentUser);
```

});

});

/* ---------------- BROADCAST ---------------- */

function broadcast(data) {

const msg = JSON.stringify(data);

wss.clients.forEach(client => {

```
if (client.readyState === WebSocket.OPEN) {
  client.send(msg);
}
```

});

}

/* ---------------- CRASH PROTECTION ---------------- */

process.on("uncaughtException", err => {
console.error("UNCAUGHT ERROR", err);
});

process.on("unhandledRejection", err => {
console.error("UNHANDLED PROMISE", err);
});

/* ---------------- START SERVER ---------------- */

async function start() {

await createDefaultUser();

server.listen(PORT, "0.0.0.0", () => {

```
console.log("🚀 NotMagic Chat running");
console.log("PORT:", PORT);
```

});

}

start();
