# NotMagic - Global Chat Platform

A dynamic, real-time chat platform built with Node.js, WebSockets, and modern web technologies.

## Features

✨ **Core Features:**
- 🌐 Real-time global chat with WebSocket technology
- 💬 Direct messaging (DM) system with replies and reactions
- 🎙️ Voice chat integration (WebRTC ready)
- 👥 User profiles with customizable avatars
- 🎖️ Ranked user system (Owner, Co-Owner, Senior Admin, Admin, Trial Admin, Member)

🔐 **Security Features:**
- JWT authentication with secure token verification
- Password hashing with bcrypt
- Input sanitization to prevent XSS attacks
- Helmet.js for HTTP security headers
- Rate limiting on API endpoints
- CORS protection

🛡️ **Moderation System:**
- Owner: Ban, Kick, Timeout
- Co-Owner: Ban, Kick, Timeout
- Senior Admin: Kick, Timeout
- Admin: Kick, Timeout
- Trial Admin: Timeout
- Member: No moderation powers

🎨 **UI Design:**
- Neon purple and black color scheme
- Clean, bright, and modern interface
- Real-time online user status
- Animated message transitions
- Responsive design

## Installation

```
bpm install
```

## Running the Server

```
npm start
```

Development mode with hot reload:
```
npm run dev
```

## Demo Account

- **Username:** NotMagic
- **Password:** Kiomara@8
- **Rank:** Owner (Full moderation access)

## Project Structure

```
NotMagic/
├── server.js           # Main server and WebSocket handler
├── package.json        # Dependencies
├── .env                # Environment variables
├── public/
│   ├── index.html      # Main HTML file
│   ├── styles.css      # Neon UI styling
│   └── app.js          # Client-side chat application
└── README.md           # This file
```

## Security Implementation

1. **Authentication:** JWT tokens with 24-hour expiration
2. **Password Security:** bcrypt hashing with salt rounds
3. **Input Validation:** HTML entity encoding and length limits
4. **Rate Limiting:** 100 requests per 15 minutes per IP
5. **CORS:** Cross-origin protection
6. **Helmet:** Security headers (CSP, X-Frame-Options, etc.)

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - Login user
- `GET /api/user/:username` - Get user profile

### WebSocket Messages

**Chat Messages:**
- `type: 'auth'` - Authenticate connection
- `type: 'chat'` - Send global message
- `type: 'dm'` - Send direct message
- `type: 'react'` - Add reaction to message

**Moderation:**
- `type: 'timeout'` - Timeout user
- `type: 'kick'` - Kick user
- `type: 'ban'` - Ban user

**Voice:**
- `type: 'voice_signal'` - WebRTC signaling

## Features In Development

- 🎬 Full WebRTC implementation for voice/video chat
- 🎙️ Voice message recording
- 🖼️ Profile picture upload
- 📁 File sharing
- 🔔 Notification system
- 💾 Message persistence with database
- 🌍 Clustering for scalability

## License

MIT License

## Support

For issues or questions, contact the NotMagic team.

---

**NotMagic - Bringing People Together in Real-Time** ✨
