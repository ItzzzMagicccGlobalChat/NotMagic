// NotMagic Chat Application
class NotMagicChat {
  constructor() {
    this.token = localStorage.getItem('token');
    this.username = localStorage.getItem('username');
    this.currentUser = null;
    this.ws = null;
    this.peers = new Map();
    this.localStream = null;
    this.voiceActive = false;
    this.messages = [];
    this.dmMessages = new Map();
    this.onlineUsers = [];

    this.init();
  }

  init() {
    const app = document.getElementById('app');
    
    if (this.token && this.username) {
      this.renderChatUI();
      this.connectWebSocket();
    } else {
      this.renderAuthUI();
    }
  }

  renderAuthUI() {
    document.getElementById('app').innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <h1>✨ NotMagic</h1>
          <div id="auth-form">
            <h2>Login</h2>
            <div class="input-group">
              <label>Username</label>
              <input type="text" id="auth-username" placeholder="Enter username">
            </div>
            <div class="input-group">
              <label>Password</label>
              <input type="password" id="auth-password" placeholder="Enter password">
            </div>
            <div class="button-group">
              <button onclick="chat.login()">Login</button>
              <button class="secondary" onclick="chat.toggleAuthMode()">Register</button>
            </div>
            <p style="text-align: center; margin-top: 20px; color: var(--secondary-neon); font-size: 0.9em;">
              <strong>Demo:</strong> Username: <code>NotMagic</code> Password: <code>Kiomara@8</code>
            </p>
          </div>
        </div>
      </div>
    `;
  }

  renderChatUI() {
    document.getElementById('app').innerHTML = `
      <div class="chat-container">
        <div class="sidebar scrollbar-hide">
          <div class="sidebar-header">
            <h2>🌐 NotMagic</h2>
            <div class="user-profile" onclick="chat.openUserMenu()">
              <div class="user-avatar" style="cursor: pointer;">
                ${this.currentUser?.username?.charAt(0).toUpperCase()}
                ${this.currentUser?.rank && this.currentUser.rank !== 'MEMBER' ? 
                  `<div class="rank-badge" style="background-color: #FF00FF;">👑</div>` : ''}
              </div>
              <div class="user-info">
                <div class="username">${this.currentUser?.username}</div>
                <div class="rank">${this.currentUser?.rank || 'Member'}</div>
              </div>
            </div>
          </div>

          <div class="sidebar-nav">
            <div class="nav-item active" onclick="chat.switchTab('global')">💬 Global Chat</div>
            <div class="nav-item" onclick="chat.switchTab('direct')">📧 Direct Messages</div>
            <div class="nav-item" onclick="chat.switchTab('voice')">🎙️ Voice Chat</div>
          </div>

          <div class="online-users scrollbar-hide">
            <h3>👥 Online (${this.onlineUsers.length})</h3>
            <div id="online-list"></div>
          </div>
        </div>

        <div class="main-content">
          <div class="chat-header">
            <h2 id="tab-title">Global Chat</h2>
          </div>

          <div id="global-tab" class="messages-container scrollbar-hide">
            <div class="system-message">Welcome to NotMagic! 🎉</div>
          </div>

          <div id="direct-tab" class="messages-container scrollbar-hide" style="display: none;">
            <div class="system-message">Select a user to start direct messaging</div>
            <div id="dm-users" style="padding: 10px;"></div>
          </div>

          <div id="voice-tab" style="display: none; padding: 20px; flex: 1; display: flex; flex-direction: column;">
            <div class="system-message" style="margin-bottom: 20px;">🎙️ Voice Chat (WebRTC)</div>
            <div id="voice-container" style="flex: 1; display: flex; gap: 20px;">
              <div style="flex: 1;">
                <video id="local-video" autoplay muted playsinline style="width: 100%; border: 2px solid var(--primary-neon); border-radius: 10px;"></video>
                <p style="text-align: center; margin-top: 10px; color: var(--secondary-neon);">Your Video</p>
              </div>
              <div style="flex: 1;">
                <video id="remote-video" autoplay playsinline style="width: 100%; border: 2px solid var(--secondary-neon); border-radius: 10px;"></video>
                <p style="text-align: center; margin-top: 10px; color: var(--warning-neon);">Remote User</p>
              </div>
            </div>
            <button onclick="chat.toggleVoiceChat()" style="margin-top: 20px; padding: 15px; background: var(--tertiary-neon); color: var(--darker-bg); font-weight: bold; border-radius: 5px; cursor: pointer;">
              🎤 Start Voice Chat
            </button>
          </div>

          <div class="input-area">
            <input type="text" id="message-input" class="message-input" placeholder="Type your message..." onkeypress="event.key === 'Enter' && chat.sendMessage()">
            <button onclick="chat.sendMessage()" style="width: 120px;">Send 📤</button>
          </div>
        </div>
      </div>

      <div id="mod-modal" class="modal" onclick="this.classList.remove('active')">
        <div class="modal-content" onclick="event.stopPropagation()">
          <h2>Moderation Menu</h2>
          <p id="mod-target-user" style="color: var(--secondary-neon); margin-bottom: 15px;"></p>
          <div class="mod-menu" id="mod-buttons"></div>
          <button onclick="document.getElementById('mod-modal').classList.remove('active')" style="margin-top: 15px; width: 100%;">Close</button>
        </div>
      </div>
    `;

    this.setupMessageInputListener();
  }

  connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${wsProtocol}://${window.location.host}`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: this.token
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      alert('Connection error. Please refresh the page.');
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'auth_success':
        this.currentUser = data.user;
        this.renderChatUI();
        break;
      case 'chat':
        this.addGlobalMessage(data.message);
        break;
      case 'dm':
        this.addDirectMessage(data.message);
        break;
      case 'online_users':
        this.updateOnlineUsers(data.users);
        break;
      case 'system':
        this.addSystemMessage(data.text);
        break;
      case 'moderation':
        this.handleModeration(data);
        break;
      case 'voice_signal':
        this.handleVoiceSignal(data);
        break;
      case 'error':
        alert('Error: ' + data.error);
        break;
    }
  }

  addGlobalMessage(message) {
    this.messages.push(message);
    const container = document.getElementById('global-tab');
    
    const rankClass = message.rank.toLowerCase().replace('_', '');
    const rankColor = {
      'owner': '#FF00FF',
      'co_owner': '#FF00FF',
      'senior_admin': '#00FFFF',
      'admin': '#00FF00',
      'trial_admin': '#FFFF00',
      'member': '#FFFFFF'
    }[message.rank.toLowerCase()];

    const msgElement = document.createElement('div');
    msgElement.className = 'message';
    msgElement.innerHTML = `
      <div class="message-avatar" onclick="chat.openUserModMenu('${message.username}')">
        ${message.username.charAt(0).toUpperCase()}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-username">${this.escapeHtml(message.username)}</span>
          ${message.rank !== 'MEMBER' ? `<span class="message-rank ${rankClass}">${message.rank}</span>` : ''}
        </div>
        <div class="message-text">${this.escapeHtml(message.text)}</div>
        <div class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</div>
        ${message.reactions.length > 0 ? `
          <div class="message-reactions">
            ${message.reactions.map(r => `<span class="reaction">${r.emoji}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
    
    container.appendChild(msgElement);
    container.scrollTop = container.scrollHeight;
  }

  addDirectMessage(message) {
    const key = [message.sender, message.recipient].sort().join(':');
    if (!this.dmMessages.has(key)) {
      this.dmMessages.set(key, []);
    }
    this.dmMessages.get(key).push(message);
  }

  addSystemMessage(text) {
    const container = document.getElementById('global-tab');
    const msgElement = document.createElement('div');
    msgElement.className = 'system-message';
    msgElement.textContent = text;
    container.appendChild(msgElement);
    container.scrollTop = container.scrollHeight;
  }

  updateOnlineUsers(users) {
    this.onlineUsers = users;
    const list = document.getElementById('online-list');
    if (list) {
      list.innerHTML = users
        .filter(u => u.username !== this.username)
        .map(u => `
          <div class="online-user" onclick="chat.openDMWith('${u.username}')">
            <div class="online-indicator"></div>
            <span>${this.escapeHtml(u.username)}</span>
          </div>
        `).join('');
    }
  }

  openUserModMenu(username) {
    if (!this.currentUser || this.currentUser.rank === 'MEMBER') return;

    const modal = document.getElementById('mod-modal');
    document.getElementById('mod-target-user').textContent = `Target: ${username}`;
    
    const permissions = {
      'OWNER': ['timeout', 'kick', 'ban'],
      'CO_OWNER': ['timeout', 'kick', 'ban'],
      'SENIOR_ADMIN': ['timeout', 'kick'],
      'ADMIN': ['timeout', 'kick'],
      'TRIAL_ADMIN': ['timeout']
    };

    const buttons = permissions[this.currentUser.rank] || [];
    const buttonsHtml = buttons.map(action => {
      const buttonClass = `mod-button ${action}`;
      return `<button class="${buttonClass}" onclick="chat.executeModAction('${username}', '${action}')">${action.toUpperCase()}</button>`;
    }).join('');

    document.getElementById('mod-buttons').innerHTML = buttonsHtml;
    modal.classList.add('active');
  }

  executeModAction(username, action) {
    if (!this.ws) return;

    const data = {
      type: action,
      targetUsername: username
    };

    if (action === 'timeout') {
      data.minutes = prompt('Timeout duration (minutes):', '5');
      if (!data.minutes) return;
    }

    this.ws.send(JSON.stringify(data));
    document.getElementById('mod-modal').classList.remove('active');
  }

  handleModeration(data) {
    alert(`Moderation Action: ${data.action} - ${data.reason || ''}`);
    if (data.action === 'kick' || data.action === 'ban') {
      setTimeout(() => {
        this.logout();
      }, 1000);
    }
  }

  async toggleVoiceChat() {
    if (this.voiceActive) {
      this.stopVoiceChat();
    } else {
      await this.startVoiceChat();
    }
  }

  async startVoiceChat() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      const localVideo = document.getElementById('local-video');
      localVideo.srcObject = this.localStream;
      
      this.voiceActive = true;
      alert('Voice chat started! Waiting for peer connection...');
    } catch (error) {
      console.error('Error accessing media:', error);
      alert('Could not access camera/microphone');
    }
  }

  stopVoiceChat() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.voiceActive = false;
  }

  handleVoiceSignal(data) {
    console.log('Voice signal from:', data.sender);
  }

  switchTab(tab) {
    ['global', 'direct', 'voice'].forEach(t => {
      const elem = document.getElementById(`${t}-tab`);
      if (elem) elem.style.display = t === tab ? 'flex' : 'none';
    });

    const titles = {
      'global': '💬 Global Chat',
      'direct': '📧 Direct Messages',
      'voice': '🎙️ Voice Chat'
    };
    document.getElementById('tab-title').textContent = titles[tab];

    if (tab === 'direct') {
      this.renderDirectMessagesTab();
    }
  }

  renderDirectMessagesTab() {
    const container = document.getElementById('dm-users');
    container.innerHTML = this.onlineUsers
      .filter(u => u.username !== this.username)
      .map(u => `
        <div class="nav-item" onclick="chat.openDMWith('${u.username}')" style="margin: 10px 0; cursor: pointer;">
          💬 Chat with ${this.escapeHtml(u.username)}
        </div>
      `).join('');
  }

  openDMWith(username) {
    const tab = document.getElementById('direct-tab');
    tab.innerHTML = `
      <div style="padding: 10px; border-bottom: 2px solid var(--primary-neon); margin-bottom: 10px;">
        <h3 style="color: var(--secondary-neon);">Chatting with: ${this.escapeHtml(username)}</h3>
      </div>
      <div id="dm-messages" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px;"></div>
      <div style="display: flex; gap: 10px;">
        <input type="text" id="dm-input" class="message-input" placeholder="Type DM..." onkeypress="event.key === 'Enter' && chat.sendDM('${username}')">
        <button onclick="chat.sendDM('${username}')" style="width: 120px;">Send 📤</button>
      </div>
    `;

    const key = [this.username, username].sort().join(':');
    const messages = this.dmMessages.get(key) || [];
    const msgContainer = document.getElementById('dm-messages');
    
    messages.forEach(msg => {
      const isOwn = msg.sender === this.username;
      const msgEl = document.createElement('div');
      msgEl.style.cssText = `
        align-self: ${isOwn ? 'flex-end' : 'flex-start'};
        max-width: 70%;
        padding: 10px;
        border-radius: 5px;
        background: ${isOwn ? 'rgba(255, 0, 255, 0.2)' : 'rgba(0, 255, 255, 0.2)'};
        border-left: 3px solid ${isOwn ? 'var(--primary-neon)' : 'var(--secondary-neon)'};
      `;
      msgEl.textContent = `${msg.sender}: ${msg.text}`;
      msgContainer.appendChild(msgEl);
    });

    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  sendDM(recipient) {
    const input = document.getElementById('dm-input');
    const text = input.value.trim();

    if (!text) return;

    this.ws.send(JSON.stringify({
      type: 'dm',
      recipient,
      text
    }));

    input.value = '';
  }

  sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();

    if (!text || !this.ws) return;

    this.ws.send(JSON.stringify({
      type: 'chat',
      text
    }));

    input.value = '';
  }

  setupMessageInputListener() {
    const input = document.getElementById('message-input');
    if (input) {
      input.focus();
    }
  }

  openUserMenu() {
    alert(`
      👤 User: ${this.currentUser?.username}
      🎖️ Rank: ${this.currentUser?.rank}
      
      Click on profile pictures in chat to access mod menu if you have permissions.
    `);
  }

  async login() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;

    if (!username || !password) {
      alert('Please enter username and password');
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        alert('Login failed: ' + data.error);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      this.token = data.token;
      this.username = data.username;
      this.init();
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed');
    }
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    this.token = null;
    this.username = null;
    this.ws?.close();
    this.init();
  }

  toggleAuthMode() {
    // Toggle between login and register
    const isLoginMode = document.querySelector('h2').textContent === 'Login';
    const form = document.getElementById('auth-form');

    if (isLoginMode) {
      form.innerHTML = `
        <h2>Register</h2>
        <div class="input-group">
          <label>Username</label>
          <input type="text" id="auth-username" placeholder="Choose a username">
        </div>
        <div class="input-group">
          <label>Password</label>
          <input type="password" id="auth-password" placeholder="Create a password">
        </div>
        <div class="button-group">
          <button onclick="chat.register()">Create Account</button>
          <button class="secondary" onclick="chat.toggleAuthMode()">Back to Login</button>
        </div>
      `;
    } else {
      this.renderAuthUI();
    }
  }

  async register() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;

    if (!username || !password) {
      alert('Please enter username and password');
      return;
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        alert('Registration failed: ' + data.error);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      this.token = data.token;
      this.username = data.username;
      this.init();
    } catch (error) {
      console.error('Register error:', error);
      alert('Registration failed');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the chat when DOM is ready
let chat;
document.addEventListener('DOMContentLoaded', () => {
  chat = new NotMagicChat();
});
