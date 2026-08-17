const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class KeyboardSimulator {
  constructor() {
    this.exePath = this.resolveKeySenderPath();
    this.worker = null;
    this.ready = false;
    this.startWorker();
  }

  resolveKeySenderPath() {
    const candidates = [
      // 1. Packaged via extraResources: <install_dir>/resources/bin/KeySender.exe
      path.join(process.resourcesPath || '', 'bin/KeySender.exe'),
      // 2. Packaged via asarUnpack: <install_dir>/resources/app.asar.unpacked/bin/KeySender.exe
      path.join(process.resourcesPath || '', 'app.asar.unpacked/bin/KeySender.exe'),
      // 3. Dev / Root relative:
      path.join(__dirname, '../../bin/KeySender.exe'),
      path.join(__dirname, '../../../bin/KeySender.exe'),
      path.join(__dirname, '../bin/KeySender.exe'),
      path.join(process.cwd(), 'bin/KeySender.exe'),
      path.join(process.cwd(), 'pc-server/bin/KeySender.exe')
    ];

    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) {
          console.log(`[KeyboardSimulator] Found KeySender at: ${p}`);
          return p;
        }
      } catch (_) {}
    }
    console.warn(`[KeyboardSimulator] KeySender.exe not found in candidate paths. Falling back to default.`);
    return path.join(__dirname, '../../bin/KeySender.exe');
  }

  startWorker() {
    if (!this.exePath || !fs.existsSync(this.exePath)) {
      this.exePath = this.resolveKeySenderPath();
    }
    if (!fs.existsSync(this.exePath)) {
      console.warn(`[KeyboardSimulator] KeySender.exe not found at ${this.exePath}`);
      return;
    }

    try {
      this.worker = spawn(this.exePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      this.ready = false;

      this.worker.stdout.on('data', (data) => {
        const out = data.toString().trim();
        if (out.includes('READY')) {
          this.ready = true;
          console.log('[KeyboardSimulator] KeySender ready');
        }
        // 'OK' lines are acknowledgements per command — no action needed
      });

      this.worker.stderr.on('data', (data) => {
        console.warn('[KeyboardSimulator] KeySender stderr:', data.toString().trim());
      });

      this.worker.on('exit', (code) => {
        console.warn(`[KeyboardSimulator] KeySender exited with code ${code}`);
        this.worker = null;
        this.ready = false;
      });

      this.worker.on('error', (err) => {
        console.warn('[KeyboardSimulator] Worker error:', err.message);
        this.ready = false;
      });
    } catch (e) {
      console.warn('[KeyboardSimulator] Failed to spawn KeySender:', e.message);
    }
  }

  _write(line) {
    if (!this.worker || !this.worker.stdin || !this.worker.stdin.writable) {
      this.startWorker();
      // Give it a moment to start then send
      setTimeout(() => {
        if (this.worker && this.worker.stdin && this.worker.stdin.writable) {
          this.worker.stdin.write(line + '\n');
        }
      }, 200);
      return;
    }
    this.worker.stdin.write(line + '\n');
  }

  /**
   * Send a key with optional modifiers.
   * If modifiers is empty, send RAW:<key>
   * If modifiers present, send COMBO:<mod1,mod2>+<key>
   */
  sendKeyCombo(modifiers, key) {
    const mods = (modifiers || []).filter(m => m && m.length > 0);
    if (mods.length === 0) {
      // No modifiers → RAW
      this._write(`RAW:${key}`);
    } else {
      // COMBO:<MODS>+<KEY>
      this._write(`COMBO:${mods.join(',')}+${key}`);
    }
  }

  /**
   * Hold down a modifier key (e.g. ALT for Alt-Tab task switching)
   */
  sendModifierDown(mod) {
    this._write(`KEY_DOWN:${mod}`);
  }

  /**
   * Release a modifier key
   */
  sendModifierUp(mod) {
    this._write(`KEY_UP:${mod}`);
  }

  /**
   * Release all held modifiers safely
   */
  releaseAll() {
    this._write('RELEASE_ALL');
  }

  /**
   * Send a single raw key (no modifiers)
   */
  send(key) {
    this._write(`RAW:${key}`);
  }

  /**
   * Send relative mouse movement
   */
  sendMouseMove(dx, dy) {
    this._write(`M:${Number(dx).toFixed(2)},${Number(dy).toFixed(2)}`);
  }

  /**
   * Send absolute mouse movement (for Direct Touch in Overdrive)
   */
  sendMouseMoveAbs(x, y) {
    this._write(`M_ABS:${Math.round(x)},${Math.round(y)}`);
  }

  /**
   * Send mouse click (LEFT, RIGHT, MIDDLE)
   */
  sendMouseClick(button = 'LEFT') {
    this._write(`MOUSE_CLICK:${button}`);
  }

  /**
   * Send mouse button down (for drag & drop)
   */
  sendMouseDown(button = 'LEFT') {
    this._write(`MOUSE_DOWN:${button}`);
  }

  /**
   * Send mouse button up (release drag)
   */
  sendMouseUp(button = 'LEFT') {
    this._write(`MOUSE_UP:${button}`);
  }

  /**
   * Send mouse scroll wheel event
   */
  sendMouseScroll(delta = 120) {
    this._write(`MOUSE_SCROLL:${delta}`);
  }

  stop() {
    if (this.worker) {
      try {
        this.worker.stdin.write('EXIT\n');
      } catch (e) {}
      setTimeout(() => {
        if (this.worker) {
          try { this.worker.kill(); } catch (e) {}
          this.worker = null;
        }
      }, 200);
    }
  }
}

module.exports = KeyboardSimulator;
