const dgram = require('dgram');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const EventEmitter = require('events');
const KeyboardSimulator = require('./keyboard');

class MoztroServer extends EventEmitter {
  static getDefaultStoragePath() {
    try {
      const electron = require('electron');
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.getPath === 'function') {
        const userDir = app.getPath('userData');
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        return path.join(userDir, 'paired-devices.json');
      }
    } catch (_) {}

    try {
      if (process.env.APPDATA) {
        const userDir = path.join(process.env.APPDATA, 'Moztro');
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        return path.join(userDir, 'paired-devices.json');
      }
    } catch (_) {}

    return path.join(__dirname, '../../paired-devices.json');
  }

  constructor(options = {}) {
    super();
    this.wsPort = options.wsPort || 8765;
    this.udpPort = options.udpPort || 8766;
    this.storagePath = options.storagePath || MoztroServer.getDefaultStoragePath();
    this.fileSaveDirectory = options.fileSaveDirectory || path.join(os.homedir(), 'Documents');
    this.clipboard = options.clipboard || null;
    this.captureHandler = options.captureHandler || null;
    this.evalHandler = options.evalHandler || null;
    this.pairedDevices = new Map(); // deviceId -> { deviceId, deviceName, ip, pairedAt }
    this.pendingPairings = new Map(); // deviceId -> { socket, info, timeout }
    this.activeSockets = new Map(); // deviceId -> socket
    this.detectedDevices = new Map(); // deviceId -> { deviceId, deviceName, ip, lastSeen }
    this.keyboard = new KeyboardSimulator();
    this.httpServer = null;
    this.wss = null;
    this.udpSocket = null;
    this.pingInterval = null;
    this.pingSeq = 0;
    this.isRunning = false;

    this.loadPairedDevices();
  }

  setClipboardText(text) {
    if (typeof text !== 'string') text = String(text || '');
    try {
      if (this.clipboard && typeof this.clipboard.writeText === 'function') {
        this.clipboard.writeText(text);
        return true;
      }
      try {
        const electron = require('electron');
        if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
          electron.clipboard.writeText(text);
          return true;
        }
      } catch (_) {}

      // PowerShell fallback
      const { execSync } = require('child_process');
      const escaped = text.replace(/'/g, "''");
      execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${escaped}'"`, { windowsHide: true });
      return true;
    } catch (err) {
      console.error('[MoztroServer] setClipboardText error:', err.message);
      return false;
    }
  }

  getClipboardText() {
    try {
      if (this.clipboard && typeof this.clipboard.readText === 'function') {
        return this.clipboard.readText();
      }
      try {
        const electron = require('electron');
        if (electron && electron.clipboard && typeof electron.clipboard.readText === 'function') {
          return electron.clipboard.readText();
        }
      } catch (_) {}

      // PowerShell fallback
      const { execSync } = require('child_process');
      const out = execSync(`powershell -NoProfile -Command "Get-Clipboard"`, { windowsHide: true, encoding: 'utf8' });
      return out.trim();
    } catch (err) {
      console.error('[MoztroServer] getClipboardText error:', err.message);
      return '';
    }
  }

  setSaveDirectory(dir) {
    if (dir && typeof dir === 'string') {
      this.fileSaveDirectory = dir;
      this.emit('log', `File save directory set to: ${dir}`);
    }
  }

  getUniqueFilePath(dir, fileName) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {}

    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let targetPath = path.join(dir, fileName);
    let counter = 1;

    while (fs.existsSync(targetPath)) {
      targetPath = path.join(dir, `${base} (${counter})${ext}`);
      counter++;
    }
    return targetPath;
  }

  loadPairedDevices() {
    try {
      let targetPath = this.storagePath;
      if (!fs.existsSync(targetPath)) {
        const fallbackCandidates = [
          path.join(__dirname, '../../paired-devices.json'),
          path.join(process.cwd(), 'paired-devices.json'),
          process.env.APPDATA ? path.join(process.env.APPDATA, 'Moztro', 'paired-devices.json') : null
        ].filter(Boolean);

        for (const candidate of fallbackCandidates) {
          if (fs.existsSync(candidate) && candidate !== targetPath) {
            targetPath = candidate;
            break;
          }
        }
      }

      if (fs.existsSync(targetPath)) {
        const raw = fs.readFileSync(targetPath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach(dev => {
            if (dev && dev.deviceId) {
              this.pairedDevices.set(dev.deviceId, dev);
            }
          });
          console.log(`[MoztroServer] Loaded ${this.pairedDevices.size} paired devices from ${targetPath}.`);
          if (targetPath !== this.storagePath && this.pairedDevices.size > 0) {
            this.savePairedDevices();
          }
        }
      } else {
        console.log(`[MoztroServer] No paired devices found at ${this.storagePath}`);
      }
    } catch (e) {
      console.warn(`[MoztroServer] Could not load paired devices: ${e.message}`);
    }
  }

  savePairedDevices() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.pairedDevices.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), 'utf8');
      console.log(`[MoztroServer] Saved ${list.length} paired devices to ${this.storagePath}`);
    } catch (e) {
      console.warn(`[MoztroServer] Could not save paired devices to ${this.storagePath}: ${e.message}`);
    }
  }

  getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push({ interface: name, address: net.address });
        }
      }
    }
    return ips;
  }

  getPrimaryIP() {
    const ips = this.getLocalIPs();
    // Prioritize 192.168.x.x or 10.x.x.x
    const wifiOrLan = ips.find(item => item.address.startsWith('192.168.') || item.address.startsWith('10.'));
    return wifiOrLan ? wifiOrLan.address : (ips[0] ? ips[0].address : '127.0.0.1');
  }

  getPrimaryMAC() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          return net.mac;
        }
      }
    }
    return '00:00:00:00:00:00';
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        const primaryIp = this.getPrimaryIP();
        const primaryMac = this.getPrimaryMAC();
        const hostname = os.hostname();

        // 1. Start HTTP Server and attach WebSocket Server
        this.httpServer = http.createServer((req, res) => {
          // Enable CORS
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name, X-File-Size, X-Device-Id');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          if (req.method === 'POST' && req.url.startsWith('/upload')) {
            this.handleFileUpload(req, res);
            return;
          }

          if (req.url.startsWith('/api/clipboard')) {
            if (req.method === 'GET') {
              const text = this.getClipboardText();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, text: text }));
              return;
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body || '{}');
                  const success = this.setClipboardText(data.text || '');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: success }));
                } catch (e) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: e.message }));
                }
              });
              return;
            }
          }

          if (req.url.startsWith('/api/screenshot')) {
            if (this.captureHandler) {
              Promise.resolve(this.captureHandler()).then(filePath => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filePath: filePath }));
              }).catch(err => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              });
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'no captureHandler' }));
            }
            return;
          }
          if (req.url.startsWith('/api/eval')) {
            if (this.evalHandler) {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const data = JSON.parse(body || '{}');
                  Promise.resolve(this.evalHandler(data.code || '')).then(result => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, result }));
                  }).catch(err => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                  });
                } catch (e) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: e.message }));
                }
              });
            } else {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'no evalHandler' }));
            }
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', name: 'Moztro' }));
        });

        this.wss = new WebSocketServer({ server: this.httpServer });

        this.httpServer.listen(this.wsPort, '0.0.0.0', () => {
          this.emit('log', `Server running on ws://${primaryIp}:${this.wsPort} (HTTP on port ${this.wsPort})`);
          this.startHeartbeat();
        });

        this.wss.on('connection', (ws, req) => {
          const clientIp = req.socket.remoteAddress ? req.socket.remoteAddress.replace(/^.*:/, '') : 'unknown';
          this.emit('log', `New incoming connection from ${clientIp}`);

          ws.isAlive = true;
          let clientDeviceId = null;

          ws.on('pong', () => {
            ws.isAlive = true;
          });

          ws.on('message', (data) => {
            ws.isAlive = true;
            try {
              const msg = JSON.parse(data.toString());
              this.handleClientMessage(ws, msg, clientIp);
              if (msg.deviceId) {
                clientDeviceId = msg.deviceId;
                ws.deviceId = msg.deviceId;
              }
            } catch (err) {
              this.emit('log', `Error parsing message from ${clientIp}: ${err.message}`);
            }
          });

          ws.on('close', () => {
            if (clientDeviceId) {
              this.activeSockets.delete(clientDeviceId);
              this.emit('deviceDisconnected', { deviceId: clientDeviceId });
              this.emit('log', `Device ${clientDeviceId} disconnected`);
            }
          });

          ws.on('error', (err) => {
            if (clientDeviceId) {
              this.activeSockets.delete(clientDeviceId);
              this.emit('deviceDisconnected', { deviceId: clientDeviceId });
            }
            this.emit('log', `WebSocket error from ${clientIp}: ${err.message}`);
          });
        });

        // 2. Start UDP Discovery Listener
        this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.udpSocket.on('error', (err) => {
          this.emit('log', `UDP Discovery Error: ${err.message}`);
        });

        this.udpSocket.on('message', (msg, rinfo) => {
          const content = msg.toString().trim();
          try {
            if (content.startsWith('{')) {
              const data = JSON.parse(content);
              if (data.type === 'MOZTRO_CLIENT_BEACON') {
                const { deviceId, deviceName } = data;
                if (deviceId) {
                  const wasKnown = this.detectedDevices.has(deviceId);
                  this.detectedDevices.set(deviceId, {
                    deviceId,
                    deviceName: deviceName || 'Android Device',
                    ip: rinfo.address,
                    lastSeen: Date.now()
                  });
                  if (!wasKnown) {
                    this.emit('deviceDetected', { deviceId, deviceName: deviceName || 'Android Device', ip: rinfo.address });
                  }
                }
                return;
              } else if (data.type === 'MOZTRO_CLIENT_BYE') {
                if (data.deviceId) {
                  this.detectedDevices.delete(data.deviceId);
                  this.emit('deviceUndetected', { deviceId: data.deviceId });
                }
                return;
              }
            }
          } catch (e) {}

          if (content === 'MOZTRO_DISCOVER' || content.includes('MOZTRO_DISCOVER')) {
            this.emit('log', `UDP Discovery received from ${rinfo.address}:${rinfo.port}`);
            const responseData = JSON.stringify({
              type: 'MOZTRO_SERVER_ANNOUNCE',
              hostname: hostname,
              ip: primaryIp,
              mac: primaryMac,
              wsPort: this.wsPort,
              platform: process.platform,
              version: '1.0.1'
            });

            this.udpSocket.send(responseData, rinfo.port, rinfo.address, (err) => {
              if (err) {
                this.emit('log', `Failed to send UDP response to ${rinfo.address}: ${err.message}`);
              } else {
                this.emit('log', `Sent UDP announcement to ${rinfo.address}:${rinfo.port}`);
              }
            });
          }
        });

        this.udpSocket.bind(this.udpPort, '0.0.0.0', () => {
          try {
            this.udpSocket.setBroadcast(true);
          } catch (e) {}
          this.emit('log', `UDP Discovery listener active on port ${this.udpPort}`);
          this.isRunning = true;
          this.startPingLoop();
          this.emit('started', { ip: primaryIp, hostname, wsPort: this.wsPort, udpPort: this.udpPort, mac: primaryMac });
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  handleClientMessage(ws, msg, clientIp) {
    const { exec } = require('child_process');
    switch (msg.type) {
      case 'PAIR_REQUEST': {
        const { deviceId, deviceName, manufacturer, model } = msg;
        const displayName = deviceName || `${manufacturer || ''} ${model || 'Unknown Android'}`.trim();
        const primaryMac = this.getPrimaryMAC();

        // Check if already paired
        if (this.pairedDevices.has(deviceId)) {
          const paired = this.pairedDevices.get(deviceId);
          paired.ip = clientIp;
          if (displayName) paired.deviceName = displayName;
          paired.lastConnected = new Date().toISOString();
          this.pairedDevices.set(deviceId, paired);
          this.savePairedDevices();

          this.activeSockets.set(deviceId, ws);
          ws.deviceId = deviceId;
          ws.send(JSON.stringify({
            type: 'PAIR_RESPONSE',
            status: 'ACCEPTED',
            serverHostname: os.hostname(),
            mac: primaryMac,
            message: 'Device already paired and authorized.'
          }));
          this.emit('deviceConnected', { deviceId, deviceName: displayName, ip: clientIp });
          this.emit('log', `Device ${displayName} (${deviceId}) reconnected.`);
        } else {
          // Store pending and ask user in UI
          const timeout = setTimeout(() => {
            if (this.pendingPairings.has(deviceId)) {
              this.pendingPairings.delete(deviceId);
              ws.send(JSON.stringify({
                type: 'PAIR_RESPONSE',
                status: 'TIMEOUT',
                message: 'Pairing request timed out.'
              }));
              this.emit('pairingTimeout', { deviceId });
            }
          }, 30000);

          this.pendingPairings.set(deviceId, { ws, info: { deviceId, deviceName: displayName, ip: clientIp }, timeout });
          this.emit('pairingRequest', { deviceId, deviceName: displayName, ip: clientIp });
          this.emit('log', `Pairing request from ${displayName} (${clientIp})`);
        }
        break;
      }

      case 'POWER_COMMAND': {
        const action = (msg.action || '').toUpperCase();
        this.emit('log', `Received POWER_COMMAND: ${action} from ${clientIp}`);

        if (action === 'SHUTDOWN') {
          exec('shutdown /s /t 0', (err) => {
            if (err) this.emit('log', `Shutdown error: ${err.message}`);
          });
        } else if (action === 'RESTART') {
          exec('shutdown /r /t 0', (err) => {
            if (err) this.emit('log', `Restart error: ${err.message}`);
          });
        } else if (action === 'SLEEP') {
          exec('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)"', (err) => {
            if (err) this.emit('log', `Sleep error: ${err.message}`);
          });
        }
        break;
      }

      case 'CLIPBOARD_SEND': {
        const text = msg.text || '';
        this.emit('log', `Received CLIPBOARD_SEND (${text.length} chars) from ${clientIp}`);
        const success = this.setClipboardText(text);
        ws.send(JSON.stringify({
          type: 'CLIPBOARD_SEND_RESPONSE',
          success: success,
          message: success ? 'Clipboard updated on PC.' : 'Failed to update PC clipboard.'
        }));
        this.emit('clipboardReceived', { text, clientIp });
        break;
      }

      case 'CLIPBOARD_GET_REQUEST': {
        this.emit('log', `Received CLIPBOARD_GET_REQUEST from ${clientIp}`);
        const text = this.getClipboardText();
        ws.send(JSON.stringify({
          type: 'CLIPBOARD_GET_RESPONSE',
          text: text,
          success: true
        }));
        break;
      }

      case 'CLIPBOARD_GET_RESPONSE': {
        const text = msg.text || '';
        this.emit('log', `Received CLIPBOARD_GET_RESPONSE from phone (${text.length} chars)`);
        if (this.setClipboardText) {
          this.setClipboardText(text);
        }
        this.emit('clipboardReceived', { text, clientIp });
        break;
      }

      case 'FILE_TRANSFER_PROGRESS': {
        this.emit('fileTransferProgress', {
          transferId: msg.transferId,
          status: msg.status,
          progress: msg.progress,
          speedFormatted: msg.speedFormatted,
          error: msg.error
        });
        break;
      }

      case 'PING': {
        // High speed ping / pong response
        const { timestamp, seq } = msg;
        const now = Date.now();
        ws.send(JSON.stringify({
          type: 'PONG',
          clientTimestamp: timestamp,
          serverTimestamp: now,
          seq: seq || 0
        }));

        this.emit('pingReceived', {
          deviceId: msg.deviceId || 'unknown',
          rtt: Math.max(0, now - (timestamp || now)),
          clientTimestamp: timestamp,
          serverTimestamp: now,
          seq: seq || 0
        });
        break;
      }

      case 'PONG': {
        const { clientTimestamp, seq, deviceId } = msg;
        const now = Date.now();
        const rtt = clientTimestamp ? Math.max(0, now - clientTimestamp) : 0;
        this.emit('pingReceived', {
          deviceId: deviceId || 'unknown',
          rtt: rtt,
          seq: seq || 0,
          timestamp: now
        });
        break;
      }

      case 'KEY_EVENT': {
        const { key, modifiers } = msg;
        this.emit('log', `Received KEY_EVENT: ${key} (modifiers: ${modifiers ? modifiers.join(',') : 'none'}) from ${clientIp}`);
        if (modifiers && Array.isArray(modifiers) && modifiers.length > 0) {
          if (this.keyboard) this.keyboard.sendKeyCombo(modifiers, key);
        } else {
          this.simulateKey(key);
        }
        break;
      }

      case 'MODIFIER_EVENT': {
        const { modifier, isDown } = msg;
        this.emit('log', `Received MODIFIER_EVENT: ${modifier} isDown=${isDown} from ${clientIp}`);
        if (this.keyboard) {
          if (isDown) {
            this.keyboard.sendModifierDown(modifier);
          } else {
            this.keyboard.sendModifierUp(modifier);
          }
        }
        break;
      }

      case 'RELEASE_ALL_MODIFIERS': {
        this.emit('log', `Received RELEASE_ALL_MODIFIERS from ${clientIp}`);
        if (this.keyboard) {
          this.keyboard.releaseAll();
        }
        break;
      }

      case 'MOUSE_MOVE': {
        if (this.keyboard && typeof msg.dx === 'number' && typeof msg.dy === 'number') {
          this.keyboard.sendMouseMove(msg.dx, msg.dy);
        }
        break;
      }

      case 'MOUSE_CLICK': {
        if (this.keyboard) {
          this.keyboard.sendMouseClick(msg.button || 'LEFT');
        }
        break;
      }

      case 'MOUSE_DOWN': {
        if (this.keyboard) {
          this.keyboard.sendMouseDown(msg.button || 'LEFT');
        }
        break;
      }

      case 'MOUSE_UP': {
        if (this.keyboard) {
          this.keyboard.sendMouseUp(msg.button || 'LEFT');
        }
        break;
      }

      case 'MOUSE_SCROLL': {
        if (this.keyboard) {
          const delta = typeof msg.deltaY === 'number' ? msg.deltaY : (typeof msg.delta === 'number' ? msg.delta : 120);
          this.keyboard.sendMouseScroll(delta);
        }
        break;
      }

      case 'REQUEST_SCREEN_SOURCES': {
        this.emit('requestScreenSources', { deviceId: msg.deviceId });
        break;
      }

      case 'START_OVERDRIVE_STREAM': {
        this.emit('startOverdriveStream', {
          deviceId: msg.deviceId,
          sourceId: msg.sourceId,
          quality: msg.quality || 'BALANCED',
          audioEnabled: msg.audioEnabled !== false
        });

        // Start periodic cursor sync (every 50ms / 20fps) to ensure smooth cursor tracking
        if (!this.overdriveCursorTimers) this.overdriveCursorTimers = new Map();
        if (this.overdriveCursorTimers.has(msg.deviceId)) {
          clearInterval(this.overdriveCursorTimers.get(msg.deviceId));
        }

        const sendCursor = () => {
          try {
            const electron = require('electron');
            if (!electron || !electron.screen) return;
            const cursorPos = electron.screen.getCursorScreenPoint();
            const primaryDisplay = electron.screen.getPrimaryDisplay();
            const { width: sw, height: sh } = primaryDisplay.bounds;
            this.sendJsonToDevice(msg.deviceId, {
              type: 'CURSOR_POS',
              x: cursorPos.x,
              y: cursorPos.y,
              screenW: sw,
              screenH: sh
            });
          } catch (_) {}
        };

        sendCursor();
        const cursorInterval = setInterval(sendCursor, 50);
        this.overdriveCursorTimers.set(msg.deviceId, cursorInterval);
        break;
      }

      case 'STOP_OVERDRIVE_STREAM': {
        if (this.overdriveCursorTimers && this.overdriveCursorTimers.has(msg.deviceId)) {
          clearInterval(this.overdriveCursorTimers.get(msg.deviceId));
          this.overdriveCursorTimers.delete(msg.deviceId);
        }
        this.emit('stopOverdriveStream', { deviceId: msg.deviceId });
        break;
      }

      case 'OVERDRIVE_INPUT_TOUCH': {
        const { action, x, y, dx, dy, button, deltaY } = msg;
        if (this.keyboard) {
          if (typeof x === 'number' && typeof y === 'number') {
            this.keyboard.sendMouseMoveAbs(x, y);
            if (action === 'DOWN') {
              this.keyboard.sendMouseDown(button || 'LEFT');
            } else if (action === 'UP') {
              this.keyboard.sendMouseUp(button || 'LEFT');
            } else if (action === 'CLICK') {
              this.keyboard.sendMouseClick(button || 'LEFT');
            } else if (action === 'SCROLL') {
              this.keyboard.sendMouseScroll(deltaY || 120);
            }
          } else {
            if (action === 'MOVE' && typeof dx === 'number' && typeof dy === 'number') {
              this.keyboard.sendMouseMove(dx, dy);
              // Send real cursor position back to Android for accurate dot overlay
              try {
                const electron = require('electron');
                const cursorPos = electron.screen.getCursorScreenPoint();
                const primaryDisplay = electron.screen.getPrimaryDisplay();
                const { width: sw, height: sh } = primaryDisplay.bounds;
                this.sendJsonToDevice(msg.deviceId, {
                  type: 'CURSOR_POS',
                  x: cursorPos.x,
                  y: cursorPos.y,
                  screenW: sw,
                  screenH: sh
                });
              } catch (_) {}
            } else if (action === 'CLICK') {
              this.keyboard.sendMouseClick(button || 'LEFT');
            } else if (action === 'DOWN') {
              this.keyboard.sendMouseDown(button || 'LEFT');
            } else if (action === 'UP') {
              this.keyboard.sendMouseUp(button || 'LEFT');
            } else if (action === 'SCROLL') {
              this.keyboard.sendMouseScroll(deltaY || 120);
            }
          }
        }
        break;
      }

      case 'OVERDRIVE_CHANGE_MONITOR': {
        this.emit('changeOverdriveMonitor', { deviceId: msg.deviceId, sourceId: msg.sourceId });
        break;
      }

      case 'DISCONNECT': {
        if (this.keyboard) this.keyboard.releaseAll();
        if (msg.deviceId) {
          if (this.overdriveCursorTimers && this.overdriveCursorTimers.has(msg.deviceId)) {
            clearInterval(this.overdriveCursorTimers.get(msg.deviceId));
            this.overdriveCursorTimers.delete(msg.deviceId);
          }
          this.emit('stopOverdriveStream', { deviceId: msg.deviceId });
          this.activeSockets.delete(msg.deviceId);
          this.emit('deviceDisconnected', { deviceId: msg.deviceId });
        }
        break;
      }

      default:
        this.emit('message', { clientIp, msg });
        break;
    }
  }

  approvePairing(deviceId) {
    const pending = this.pendingPairings.get(deviceId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    const { ws, info } = pending;
    this.pendingPairings.delete(deviceId);

    this.pairedDevices.set(deviceId, {
      ...info,
      pairedAt: new Date().toISOString()
    });
    this.savePairedDevices();
    this.activeSockets.set(deviceId, ws);
    ws.deviceId = deviceId;

    ws.send(JSON.stringify({
      type: 'PAIR_RESPONSE',
      status: 'ACCEPTED',
      serverHostname: os.hostname(),
      message: 'Pairing approved by host PC.'
    }));

    this.emit('deviceConnected', info);
    this.emit('log', `Pairing approved for ${info.deviceName}`);
    return true;
  }

  rejectPairing(deviceId) {
    const pending = this.pendingPairings.get(deviceId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    const { ws, info } = pending;
    this.pendingPairings.delete(deviceId);

    ws.send(JSON.stringify({
      type: 'PAIR_RESPONSE',
      status: 'REJECTED',
      message: 'Pairing request was rejected by host PC.'
    }));

    this.emit('log', `Pairing rejected for ${info.deviceName}`);
    return true;
  }

  simulateKey(key) {
    if (this.keyboard) {
      this.keyboard.send(key);
    }
  }

  sendOverdriveBinary(deviceId, buffer) {
    let ws = deviceId ? this.activeSockets.get(deviceId) : null;
    if (!ws && this.activeSockets.size === 1) {
      ws = Array.from(this.activeSockets.values())[0];
    }
    if (ws && ws.readyState === 1) {
      try {
        ws.send(buffer, { binary: true });
        return true;
      } catch (err) {
        console.error('sendOverdriveBinary error:', err);
      }
    }
    return false;
  }

  sendJsonToDevice(deviceId, data) {
    let ws = deviceId ? this.activeSockets.get(deviceId) : null;
    if (!ws && this.activeSockets.size === 1) {
      ws = Array.from(this.activeSockets.values())[0];
    }
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(data));
        return true;
      } catch (err) {
        console.error('sendJsonToDevice error:', err);
      }
    }
    return false;
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      // 1. Check WebSocket clients
      if (this.wss) {
        this.wss.clients.forEach((ws) => {
          if (ws.isAlive === false) {
            if (ws.deviceId) {
              this.activeSockets.delete(ws.deviceId);
              this.emit('deviceDisconnected', { deviceId: ws.deviceId });
              this.emit('log', `Device ${ws.deviceId} disconnected (heartbeat timeout).`);
            }
            return ws.terminate();
          }
          ws.isAlive = false;
          try {
            ws.ping();
          } catch (e) {}
        });
      }

      // 2. Clean up expired UDP presence beacons (older than 4.5 seconds)
      const now = Date.now();
      for (const [id, dev] of this.detectedDevices) {
        if (!this.activeSockets.has(id) && (now - dev.lastSeen > 4500)) {
          this.detectedDevices.delete(id);
          this.emit('deviceUndetected', { deviceId: id });
        }
      }
    }, 1500);
  }

  getDetectedDevicesList() {
    const now = Date.now();
    const list = [];
    const processedIds = new Set();

    // 1. First add actively connected sockets
    for (const [id, ws] of this.activeSockets) {
      processedIds.add(id);
      const paired = this.pairedDevices.get(id);
      const detected = this.detectedDevices.get(id);
      list.push({
        deviceId: id,
        deviceName: paired?.deviceName || detected?.deviceName || 'Android Device',
        ip: paired?.ip || detected?.ip || 'unknown',
        isConnected: true
      });
    }

    // 2. Add devices running app (detected via beacon) but not yet connected
    for (const [id, dev] of this.detectedDevices) {
      if (!processedIds.has(id) && (now - dev.lastSeen <= 4500)) {
        processedIds.add(id);
        const paired = this.pairedDevices.get(id);
        list.push({
          deviceId: id,
          deviceName: paired?.deviceName || dev.deviceName || 'Android Device',
          ip: dev.ip,
          isConnected: false
        });
      }
    }

    return list;
  }

  startPingLoop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (!this.isRunning || this.activeSockets.size === 0) return;
      const now = Date.now();
      for (const [deviceId, ws] of this.activeSockets) {
        if (ws && ws.readyState === 1) {
          const seq = ++this.pingSeq;
          try {
            ws.send(JSON.stringify({
              type: 'PING',
              deviceId: 'server',
              timestamp: now,
              seq: seq
            }));
          } catch (e) {}
        }
      }
    }, 1000);
  }

  stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  handleFileUpload(req, res) {
    try {
      let rawFileName = req.headers['x-file-name'];
      if (!rawFileName && req.url.includes('name=')) {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          rawFileName = urlObj.searchParams.get('name');
        } catch (_) {}
      }

      let fileName = 'received_file';
      if (rawFileName) {
        try {
          fileName = decodeURIComponent(rawFileName);
        } catch (_) {
          fileName = rawFileName;
        }
      }

      // Sanitize fileName to prevent directory traversal
      fileName = path.basename(fileName);
      if (!fileName || fileName === '.' || fileName === '..') {
        fileName = `file_${Date.now()}`;
      }

      const totalSize = parseInt(req.headers['x-file-size'] || req.headers['content-length'] || '0', 10) || 0;
      const transferId = 'rx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

      const saveDir = this.fileSaveDirectory || path.join(os.homedir(), 'Documents');
      const targetPath = this.getUniqueFilePath(saveDir, fileName);
      const writeStream = fs.createWriteStream(targetPath);
      let bytesReceived = 0;
      let lastProgressTime = Date.now();
      let lastProgressBytes = 0;

      // Emit UPLOADING start immediately
      this.emit('fileTransferProgress', {
        transferId,
        fileName,
        direction: 'down',
        status: 'UPLOADING',
        progress: 0,
        speedFormatted: '0 KB/s'
      });

      this.emit('log', `Starting incoming file transfer: ${fileName} -> ${targetPath}`);

      req.on('data', (chunk) => {
        bytesReceived += chunk.length;

        const now = Date.now();
        const elapsed = now - lastProgressTime;
        if (elapsed >= 200) {
          const deltaBytes = bytesReceived - lastProgressBytes;
          const speed = elapsed > 0 ? (deltaBytes / elapsed) * 1000 : 0;
          lastProgressTime = now;
          lastProgressBytes = bytesReceived;

          const progress = totalSize > 0 ? Math.min(bytesReceived / totalSize, 0.99) : 0;
          const speedFormatted = this.formatSpeed(speed);

          this.emit('fileTransferProgress', {
            transferId,
            fileName,
            direction: 'down',
            status: 'UPLOADING',
            progress,
            speedFormatted
          });
        }
      });

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const finalName = path.basename(targetPath);
        const speed = bytesReceived > 0 ? this.formatSpeed(bytesReceived / Math.max(1, (Date.now() - lastProgressTime + 200) / 1000)) : '0 KB/s';

        // Emit 100% complete
        this.emit('fileTransferProgress', {
          transferId,
          fileName: finalName,
          direction: 'down',
          status: 'COMPLETE',
          progress: 1,
          speedFormatted: speed,
          path: targetPath
        });

        this.emit('log', `Successfully received file: ${finalName} (${bytesReceived} bytes)`);
        this.emit('fileReceived', {
          fileName: finalName,
          originalName: fileName,
          path: targetPath,
          size: bytesReceived
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          fileName: finalName,
          path: targetPath,
          size: bytesReceived
        }));
      });

      writeStream.on('error', (err) => {
        this.emit('log', `Error saving file ${fileName}: ${err.message}`);
        this.emit('fileTransferProgress', {
          transferId,
          fileName,
          direction: 'down',
          status: 'FAILED',
          progress: 0,
          speedFormatted: ''
        });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });

      req.on('error', (err) => {
        this.emit('log', `Error in file upload request: ${err.message}`);
        this.emit('fileTransferProgress', {
          transferId,
          fileName,
          direction: 'down',
          status: 'FAILED',
          progress: 0,
          speedFormatted: ''
        });
        writeStream.destroy();
        try {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        } catch (_) {}
      });
    } catch (err) {
      this.emit('log', `File upload exception: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  requestPhoneClipboard(deviceId) {
    const ws = deviceId ? this.activeSockets.get(deviceId) : this.activeSockets.values().next().value;
    if (!ws || ws.readyState !== 1) {
      return { success: false, error: 'No phone connected' };
    }
    ws.send(JSON.stringify({
      type: 'CLIPBOARD_GET_REQUEST',
      timestamp: Date.now()
    }));
    return { success: true };
  }

  sendClipboardToPhone(deviceId, text) {
    const ws = deviceId ? this.activeSockets.get(deviceId) : this.activeSockets.values().next().value;
    if (!ws || ws.readyState !== 1) {
      return { success: false, error: 'No phone connected' };
    }
    ws.send(JSON.stringify({
      type: 'CLIPBOARD_SEND',
      text: text,
      timestamp: Date.now()
    }));
    return { success: true };
  }

  async sendFileToPhone(deviceId, fileInfo) {
    const ws = deviceId ? this.activeSockets.get(deviceId) : this.activeSockets.values().next().value;
    if (!ws || ws.readyState !== 1) {
      throw new Error('No phone connected');
    }

    const { transferId, fileName, buffer, mimeType } = fileInfo;
    const totalBytes = buffer.length;

    // Send Start
    ws.send(JSON.stringify({
      type: 'FILE_TRANSFER_START',
      transferId,
      fileName,
      fileSize: totalBytes,
      mimeType: mimeType || ''
    }));

    this.emit('fileTransferProgress', {
      transferId,
      fileName,
      direction: 'up',
      status: 'UPLOADING',
      progress: 0,
      speedFormatted: 'Starting...'
    });

    // Send Chunks
    const chunkSize = 64 * 1024; // 64 KB
    let offset = 0;
    let chunkIndex = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    while (offset < totalBytes) {
      if (this.cancelledTransfers && this.cancelledTransfers.has(transferId)) {
        ws.send(JSON.stringify({
          type: 'FILE_TRANSFER_CANCEL',
          transferId
        }));
        this.emit('fileTransferProgress', {
          transferId,
          fileName,
          direction: 'up',
          status: 'CANCELLED',
          progress: 0,
          speedFormatted: 'Cancelled'
        });
        throw new Error('Transfer cancelled');
      }

      const end = Math.min(offset + chunkSize, totalBytes);
      const slice = buffer.subarray(offset, end);
      const isLast = end >= totalBytes;
      const chunkBase64 = slice.toString('base64');

      ws.send(JSON.stringify({
        type: 'FILE_TRANSFER_CHUNK',
        transferId,
        chunkBase64,
        chunkIndex,
        isLast
      }));

      offset = end;
      chunkIndex++;

      const now = Date.now();
      const timeDiff = now - lastTime;
      if (timeDiff >= 200 || isLast) {
        const bytesDiff = offset - lastBytes;
        const speedBytesPerSec = timeDiff > 0 ? Math.round((bytesDiff * 1000) / timeDiff) : 0;
        const speedFormatted = this.formatSpeed(speedBytesPerSec);
        const progress = totalBytes > 0 ? Math.min(1, offset / totalBytes) : 0;

        this.emit('fileTransferProgress', {
          transferId,
          fileName,
          direction: 'up',
          status: isLast ? 'COMPLETE' : 'UPLOADING',
          progress: progress,
          speedFormatted: isLast ? 'Complete' : speedFormatted,
          bytesUploaded: offset,
          totalBytes: totalBytes
        });

        lastTime = now;
        lastBytes = offset;
      }

      // Backpressure: if WS send buffer is getting large, pause to let it drain
      if (ws.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise(r => setTimeout(r, 50));
      } else if (chunkIndex % 8 === 0) {
        await new Promise(r => setImmediate(r));
      }
    }

    return { success: true };
  }

  formatSpeed(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    } else if (bytesPerSec >= 1024) {
      return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    } else {
      return bytesPerSec + ' B/s';
    }
  }

  cancelFileTransfer(transferId) {
    if (!this.cancelledTransfers) this.cancelledTransfers = new Set();
    this.cancelledTransfers.add(transferId);
    for (const ws of this.activeSockets.values()) {
      try {
        ws.send(JSON.stringify({
          type: 'FILE_TRANSFER_CANCEL',
          transferId
        }));
      } catch (_) {}
    }
  }

  stop() {
    this.stopPingLoop();
    this.stopHeartbeat();
    if (this.keyboard) {
      this.keyboard.stop();
      this.keyboard = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }
    this.isRunning = false;
    this.emit('stopped');
  }
}

// If run directly (headless mode)
if (require.main === module) {
  const server = new MoztroServer();
  server.on('log', msg => console.log(`[MoztroServer] ${msg}`));
  server.on('pairingRequest', req => {
    console.log(`Auto-approving pairing for test from ${req.deviceName} (${req.ip})`);
    server.approvePairing(req.deviceId);
  });
  server.start().then(() => {
    console.log('Moztro Server is ready.');
  });
}

module.exports = MoztroServer;
