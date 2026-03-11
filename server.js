import express from 'express';
import WebSocket from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'NotMagic_Secure_Key_2026';

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// In-memory databases
let users = new Map();
let messages = [];
let dmMessages = new Map();
let userSessions = new Map();

// Rank hierarchy and permissions
const RANKS = {
  OWNER: { level: 5, color: '#FF00FF', permissions: ['ban', 'kick', 'timeout'] },
  CO_OWNER: { level: 4, color: '#FF00FF', permissions: ['ban', 'kick', 'timeout'] },
  SENIOR_ADMIN: { level: 3, color: '#00FFFF', permissions: ['kick', 'timeout'] },
  ADMIN: { level: 2, color: '#00FF00', permissions: ['kick', 'timeout'] },
  TRIAL_ADMIN: { level: 1, color: '#FFFF00', permissions: ['timeout'] },
  MEMBER: { level: 0, color: '#FFFFFF', permissions: [] }
};

const DEFAULT_USER = {
  username: 'NotMagic',
  password: 'Kiomara@8',
  rank: 'OWNER'
};

// Initialize default user
const saltRounds = 10;
bcrypt.hash(DEFAULT_USER.password, saltRounds, (err, hash) => {
  if (!err) {
    users.set(DEFAULT_USER.username, {
      username: DEFAULT_USER.username,
      passwordHash: hash,
      rank: DEFAULT_USER.rank,
      profilePicture: null,
      createdAt: new Date(),
      isBanned: false,
      timeoutUntil: null
    });
  }
});

// Utility functions
function generateToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function sanitizeInput(input) {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .substring(0, 500);
}

// Auth endpoints
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Username must be 3+ chars, password 6+ chars' });
  }

  if (users.has(username)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, saltRounds);
    users.set(username, {
      username,
      passwordHash,
      rank: 'MEMBER',
      profilePicture: null,
      createdAt: new Date(),
      isBanned: false,
      timeoutUntil: null
    });

    const token = generateToken(username);
    res.json({ token, username });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const user = users.get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(username);
  res.json({ token, username, rank: user.rank });
});

app.get('/api/user/:username', (req, res) => {
  const user = users.get(req.params.username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    username: user.username,
    rank: user.rank,
    profilePicture: user.profilePicture,
    isBanned: user.isBanned
  });
});

// WebSocket handling
wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      // Authentication
      if (message.type === 'auth') {
        const decoded = verifyToken(message.token);
        if (!decoded) {
          ws.send(JSON.stringify({ type: 'error', error: 'Invalid token' }));
          ws.close();
          return;
        }

        const user = users.get(decoded.username);
        if (user.isBanned) {
          ws.send(JSON.stringify({ type: 'error', error: 'You are banned' }));
          ws.close();
          return;
        }

        currentUser = decoded.username;
        userSessions.set(currentUser, ws);
        
        ws.send(JSON.stringify({
          type: 'auth_success',
          user: {
            username: currentUser,
            rank: user.rank,
            profilePicture: user.profilePicture
          }
        }));

        // Broadcast online users
        broadcastOnlineUsers();
        return;
      }

      if (!currentUser) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
        return;
      }

      const user = users.get(currentUser);

      // Check if user is timed out
      if (user.timeoutUntil && new Date() < new Date(user.timeoutUntil)) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'You are timed out' 
        }));
        return;
      }

      // Global chat message
      if (message.type === 'chat') {
        const sanitizedText = sanitizeInput(message.text);
        const chatMessage = {
          id: Date.now(),
          username: currentUser,
          text: sanitizedText,
          rank: user.rank,
          profilePicture: user.profilePicture,
          timestamp: new Date(),
          reactions: []
        };

        messages.push(chatMessage);
        if (messages.length > 100) messages.shift();

        broadcastMessage({
          type: 'chat',
          message: chatMessage
        });
      }

      // Direct message
      if (message.type === 'dm') {
        const recipient = message.recipient;
        if (!users.has(recipient)) {
          ws.send(JSON.stringify({ type: 'error', error: 'User not found' }));
          return;
        }

        const dmKey = [currentUser, recipient].sort().join(':');
        if (!dmMessages.has(dmKey)) {
          dmMessages.set(dmKey, []);
        }

        const dm = {
          id: Date.now(),
          sender: currentUser,
          recipient,
          text: sanitizeInput(message.text),
          replyTo: message.replyTo || null,
          reactions: [],
          timestamp: new Date()
        };

        dmMessages.get(dmKey).push(dm);

        // Send to recipient
        const recipientWs = userSessions.get(recipient);
        if (recipientWs) {
          recipientWs.send(JSON.stringify({
            type: 'dm',
            message: dm
          }));
        }

        ws.send(JSON.stringify({
          type: 'dm_sent',
          message: dm
        }));
      }

      // Message reaction
      if (message.type === 'react') {
        if (message.isGlobalChat) {
          const msg = messages.find(m => m.id === message.messageId);
          if (msg) {
            const reaction = { user: currentUser, emoji: message.emoji };
            msg.reactions.push(reaction);
            broadcastMessage({
              type: 'reaction',
              messageId: message.messageId,
              reactions: msg.reactions
            });
          }
        }
      }

      // Moderation: Timeout
      if (message.type === 'timeout' && RANKS[user.rank].permissions.includes('timeout')) {
        const targetUser = users.get(message.targetUsername);
        if (targetUser && RANKS[targetUser.rank].level < RANKS[user.rank].level) {
          const timeoutMinutes = message.minutes || 5;
          targetUser.timeoutUntil = new Date(Date.now() + timeoutMinutes * 60000);
          
          const targetWs = userSessions.get(message.targetUsername);
          if (targetWs) {
            targetWs.send(JSON.stringify({
              type: 'moderation',
              action: 'timeout',
              duration: timeoutMinutes
            }));
          }

          broadcastMessage({
            type: 'system',
            text: `${message.targetUsername} was timed out for ${timeoutMinutes} minutes by ${currentUser}`
          });
        }
      }

      // Moderation: Kick
      if (message.type === 'kick' && RANKS[user.rank].permissions.includes('kick')) {
        const targetUser = users.get(message.targetUsername);
        if (targetUser && RANKS[targetUser.rank].level < RANKS[user.rank].level) {
          const targetWs = userSessions.get(message.targetUsername);
          if (targetWs) {
            targetWs.send(JSON.stringify({
              type: 'moderation',
              action: 'kick',
              reason: message.reason || 'You were kicked'
            }));
            targetWs.close();
          }

          userSessions.delete(message.targetUsername);
          broadcastMessage({
            type: 'system',
            text: `${message.targetUsername} was kicked by ${currentUser}`
          });
        }
      }

      // Moderation: Ban
      if (message.type === 'ban' && RANKS[user.rank].permissions.includes('ban')) {
        const targetUser = users.get(message.targetUsername);
        if (targetUser && RANKS[targetUser.rank].level < RANKS[user.rank].level) {
          targetUser.isBanned = true;

          const targetWs = userSessions.get(message.targetUsername);
          if (targetWs) {
            targetWs.send(JSON.stringify({
              type: 'moderation',
              action: 'ban',
              reason: message.reason || 'You were banned'
            }));
            targetWs.close();
          }

          userSessions.delete(message.targetUsername);
          broadcastMessage({
            type: 'system',
            text: `${message.targetUsername} was banned by ${currentUser}`
          });
        }
      }

      // Voice chat signal
      if (message.type === 'voice_signal') {
        const recipientWs = userSessions.get(message.recipient);
        if (recipientWs) {
          recipientWs.send(JSON.stringify({
            type: 'voice_signal',
            sender: currentUser,
            signal: message.signal
          }));
        }
      }

    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (currentUser) {
      userSessions.delete(currentUser);
      broadcastOnlineUsers();
    }
  });
});

function broadcastMessage(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function broadcastOnlineUsers() {
  const onlineUsers = Array.from(userSessions.keys()).map(username => {
    const user = users.get(username);
    return {
      username,
      rank: user.rank,
      profilePicture: user.profilePicture
    };
  });

  broadcastMessage({
    type: 'online_users',
    users: onlineUsers
  });
}

server.listen(PORT, () => {
  console.log(`🚀 NotMagic Chat Server running on port ${PORT}`);
  console.log('🔐 Security enabled with Helmet and rate limiting');
});
