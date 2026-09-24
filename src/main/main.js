const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, clipboard, shell, desktopCapturer, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MoztroServer = require('./server');
const https = require('https');
const { spawn } = require('child_process');

// Set Application Identity for Windows Taskbar & System
app.setName('Moztro');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.moztro.app');
}

let mainWindow = null;
let server = null;
let tray = null;
let isQuitting = false;
let minimizeToTray = false;
let autoStart = false;
let fileSaveDirectory = path.join(os.homedir(), 'Documents');
let deleteFileOnClearHistory = false;

// Auto-updater state
let latestDownloadedInstaller = null;
let latestDownloadedVersion = null;
let isUpdateDownloading = false;

function getSettingsFilePath() {
  try {
    const userDir = app.getPath('userData');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return path.join(userDir, 'app-settings.json');
  } catch (_) {
    return path.join(__dirname, '../../app-settings.json');
  }
}

function getPairedDevicesFilePath() {
  try {
    const userDir = app.getPath('userData');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return path.join(userDir, 'paired-devices.json');
  } catch (_) {
    return path.join(__dirname, '../../paired-devices.json');
  }
}

function loadSettings() {
  try {
    const newSettingsPath = getSettingsFilePath();
    const legacySettingsPath = path.join(__dirname, '../../app-settings.json');
    let targetPath = newSettingsPath;

    if (!fs.existsSync(newSettingsPath) && fs.existsSync(legacySettingsPath)) {
      targetPath = legacySettingsPath;
    }

    if (fs.existsSync(targetPath)) {
      const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      if (typeof data.minimizeToTray === 'boolean') {
        minimizeToTray = data.minimizeToTray;
      }
      if (typeof data.autoStart === 'boolean') {
        autoStart = data.autoStart;
      }
      if (typeof data.fileSaveDirectory === 'string' && data.fileSaveDirectory.trim().length > 0) {
        fileSaveDirectory = data.fileSaveDirectory;
      }
      if (typeof data.deleteFileOnClearHistory === 'boolean') {
        deleteFileOnClearHistory = data.deleteFileOnClearHistory;
      }
    }
  } catch (e) {
    console.warn('Could not load app settings:', e.message);
  }
}

function saveSettings() {
  try {
    const savePath = getSettingsFilePath();
    fs.writeFileSync(savePath, JSON.stringify({
      minimizeToTray,
      autoStart,
      fileSaveDirectory,
      deleteFileOnClearHistory
    }, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not save app settings:', e.message);
  }
}

function applyAutoStart(enabled) {
  autoStart = !!enabled;
  saveSettings();

  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    const moztroExe = app.isPackaged ? process.execPath : path.resolve(__dirname, '../../Moztro.exe');

    // 1. Clean up any obsolete/duplicate registry keys created by Electron
    try {
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "electron.app.Electron" /f 2>nul');
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "com.moztro.app" /f 2>nul');
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Electron" /f 2>nul');
    } catch (_) {}

    // 2. Clean up any leftover shortcuts from Startup folder to avoid duplicates
    try {
      const startupFolder = path.join(app.getPath('appData'), 'Microsoft/Windows/Start Menu/Programs/Startup');
      const shortcutPath = path.join(startupFolder, 'Moztro.lnk');
      if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
      }
    } catch (_) {}

    // 3. Register or unregister Moztro.exe in HKCU Run registry with --autostart
    try {
      if (autoStart) {
        const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Moztro" /t REG_SZ /d "\\"${moztroExe}\\" --autostart" /f`;
        exec(cmd, (err) => {
          if (err) console.warn('Could not add Moztro to registry:', err.message);
        });
      } else {
        exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Moztro" /f 2>nul');
      }
    } catch (e) {
      console.warn('Could not update startup registry:', e.message);
    }
  } else {
    try {
      app.setLoginItemSettings({
        openAtLogin: autoStart,
        args: ['--autostart']
      });
    } catch (e) {
      console.warn('Could not update login item settings:', e.message);
    }
  }
}

function createTray() {
  try {
    const icoPath = path.join(__dirname, '../renderer/icon.ico');
    const pngPath = path.join(__dirname, '../renderer/icon.png');
    const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    tray.setToolTip('Moztro');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Moztro',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.warn('Could not create system tray:', e.message);
  }
}

// ─── Auto-Update Functions ──────────────────────────────────────
function isNewerVersion(remoteTag, localVer) {
  try {
    const parse = (v) => {
      const cleaned = (v || '').toLowerCase().replace(/^v/, '').split('-')[0].split(' ')[0].trim();
      return cleaned.split('.').map(p => parseInt(p, 10) || 0);
    };
    const [rMaj = 0, rMin = 0, rPat = 0] = parse(remoteTag);
    const [lMaj = 0, lMin = 0, lPat = 0] = parse(localVer);
    if (rMaj > lMaj) return true;
    if (rMaj === lMaj && rMin > lMin) return true;
    if (rMaj === lMaj && rMin === lMin && rPat > lPat) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function downloadFileWithRedirect(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function fetchUrl(targetUrl, redirectCount = 0) {
      if (redirectCount > 10) {
        return reject(new Error('Too many redirects'));
      }
      const client = targetUrl.startsWith('http:') ? require('http') : https;
      const req = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Moztro-PC-Server',
          'Accept': 'application/octet-stream'
        },
        timeout: 30000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP status ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const fileStream = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0 && onProgress) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            onProgress(pct, downloaded, total);
          }
        });
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destPath));
        });
        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });
      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
      req.on('timeout', () => {
        req.destroy();
        fs.unlink(destPath, () => {});
        reject(new Error('Download timeout'));
      });
    }
    fetchUrl(url);
  });
}

async function checkForGithubUpdates() {
  if (isUpdateDownloading) return { hasUpdate: false, downloading: true };
  const currentAppVersion = app.getVersion();

  return new Promise((resolve) => {
    const req = https.get('https://api.github.com/repos/measureofsuccess-studio/moztro-server/releases/latest', {
      headers: {
        'User-Agent': 'Moztro-PC-Server',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode !== 200) {
        console.warn('[AutoUpdate] GitHub API returned status:', res.statusCode);
        return resolve({ hasUpdate: false, statusCode: res.statusCode });
      }
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', async () => {
        try {
          const release = JSON.parse(body);
          const tagName = (release.tag_name || '').trim();
          const releaseName = (release.name || '').trim();
          const isBeta = !!release.prerelease || /beta/i.test(tagName) || /beta/i.test(releaseName);

          const hasNewer = isNewerVersion(tagName, currentAppVersion);
          if (!hasNewer) {
            console.log(`[AutoUpdate] Up-to-date (Current: v${currentAppVersion}, Latest: ${tagName})`);
            return resolve({ hasUpdate: false, currentVersion: currentAppVersion, latestTag: tagName });
          }

          // Format version label: (vX.X.X) or (vX.X.X) Beta
          const rawVer = tagName.replace(/^v/i, '').split('-')[0].split(' ')[0].trim();
          const formattedVer = `v${rawVer}` + (isBeta ? ' Beta' : '');

          // Find .exe asset
          const assets = Array.isArray(release.assets) ? release.assets : [];
          const exeAsset = assets.find(a => (a.name || '').toLowerCase().endsWith('.exe') && !a.name.includes('blockmap'));
          if (!exeAsset || !exeAsset.browser_download_url) {
            console.warn('[AutoUpdate] No .exe installer asset found in release:', tagName);
            return resolve({ hasUpdate: false });
          }

          console.log(`[AutoUpdate] Found newer release: ${formattedVer} (${exeAsset.name}, ${exeAsset.size} bytes)`);

          const updateDir = path.join(app.getPath('temp'), 'moztro-update');
          if (!fs.existsSync(updateDir)) {
            fs.mkdirSync(updateDir, { recursive: true });
          }
          const destPath = path.join(updateDir, exeAsset.name);

          // If already downloaded and complete
          if (fs.existsSync(destPath) && fs.statSync(destPath).size === exeAsset.size) {
            latestDownloadedInstaller = destPath;
            latestDownloadedVersion = formattedVer;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-download-complete', {
                versionLabel: formattedVer,
                installerPath: destPath
              });
            }
            return resolve({ hasUpdate: true, ready: true, version: formattedVer });
          }

          // Start Silent Background Download
          isUpdateDownloading = true;
          let lastReportedPct = -1;

          await downloadFileWithRedirect(exeAsset.browser_download_url, destPath, (pct, downloaded, total) => {
            if (pct !== lastReportedPct) {
              lastReportedPct = pct;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-download-progress', {
                  percent: pct,
                  downloaded,
                  total,
                  versionLabel: formattedVer
                });
              }
            }
          });

          isUpdateDownloading = false;
          latestDownloadedInstaller = destPath;
          latestDownloadedVersion = formattedVer;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-download-complete', {
              versionLabel: formattedVer,
              installerPath: destPath
            });
          }
          return resolve({ hasUpdate: true, ready: true, version: formattedVer });
        } catch (e) {
          isUpdateDownloading = false;
          console.warn('[AutoUpdate] Failed parsing release response:', e.message);
          return resolve({ hasUpdate: false, error: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[AutoUpdate] Error contacting GitHub API:', err.message);
      resolve({ hasUpdate: false, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      console.warn('[AutoUpdate] Request to GitHub API timed out');
      resolve({ hasUpdate: false, error: 'timeout' });
    });
  });
}

function createWindow() {
  const icoPath = path.join(__dirname, '../renderer/icon.ico');
  const pngPath = path.join(__dirname, '../renderer/icon.png');
  const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
  const appIcon = nativeImage.createFromPath(iconPath);

  // Check if launched by Windows Startup/Boot
  const isStartedAtBoot = process.argv.some(arg => arg === '--autostart');
  // Combo: If both auto-start on boot AND minimize to tray are enabled, start hidden directly into system tray!
  const startHidden = isStartedAtBoot && autoStart && minimizeToTray;

  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 750,
    minHeight: 550,
    title: 'Moztro',
    icon: appIcon,
    backgroundColor: '#0a0a0a',
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      checkForGithubUpdates().catch(err => {
        console.warn('[AutoUpdate] Initial update check failed:', err.message);
      });
    }, 2000);
  });

  // Periodic background check every 30 minutes
  setInterval(() => {
    checkForGithubUpdates().catch(err => {
      console.warn('[AutoUpdate] Periodic check failed:', err.message);
    });
  }, 30 * 60 * 1000);

  mainWindow.on('close', (event) => {
    if (minimizeToTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function parseFilePathsFromArgv(argv) {
  const files = [];
  if (!Array.isArray(argv)) return files;

  for (const rawArg of argv) {
    if (!rawArg || typeof rawArg !== 'string') continue;
    const arg = rawArg.trim().replace(/^["']|["']$/g, '');
    if (arg.startsWith('--') || arg.startsWith('-')) continue;
    if (arg.endsWith('.js') || arg.endsWith('electron.exe') || arg.endsWith('Moztro.exe') || arg.endsWith('Moztro.vbs')) continue;

    try {
      if (fs.existsSync(arg)) {
        const stat = fs.statSync(arg);
        if (stat.isFile()) {
          files.push({
            name: path.basename(arg),
            path: path.resolve(arg),
            size: stat.size
          });
        }
      }
    } catch (_) {}
  }
  return files;
}

function registerContextMenu() {
  if (process.platform !== 'win32') return;
  const { exec } = require('child_process');
  const icoPath = path.join(__dirname, '../renderer/icon.ico').replace(/\\/g, '\\\\');
  const appPath = app.getAppPath().replace(/\\/g, '\\\\');
  const execPath = process.execPath.replace(/\\/g, '\\\\');

  let launchCommand;
  let iconTarget;
  if (app.isPackaged) {
    launchCommand = `\\"${execPath}\\" \\"%1\\"`;
    iconTarget = `\\"${execPath}\\",0`;
  } else {
    launchCommand = `\\"${execPath}\\" \\"${appPath}\\" \\"%1\\"`;
    iconTarget = `\\"${icoPath}\\"`;
  }

  const regFile = path.join(os.tmpdir(), 'moztro_context_menu.reg');
  const regContent = `Windows Registry Editor Version 5.00\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\MoztroSend]\r\n` +
    `@="Send with Moztro"\r\n` +
    `"Icon"="${iconTarget}"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\MoztroSend\\command]\r\n` +
    `@="${launchCommand}"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\MoztroSend]\r\n` +
    `@="Send with Moztro"\r\n` +
    `"Icon"="${iconTarget}"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\MoztroSend\\command]\r\n` +
    `@="${launchCommand}"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\MoztroSend]\r\n` +
    `@="Send with Moztro"\r\n` +
    `"Icon"="${iconTarget}"\r\n\r\n` +
    `[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\MoztroSend\\command]\r\n` +
    `@="${launchCommand}"\r\n`;

  try {
    fs.writeFileSync(regFile, regContent, 'utf8');
    exec(`reg import "${regFile}"`, () => {
      try { fs.unlinkSync(regFile); } catch (_) {}
    });
  } catch (e) {
    console.warn('Could not register context menu:', e.message);
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();

      const files = parseFilePathsFromArgv(commandLine);
      if (files.length > 0) {
        mainWindow.webContents.send('open-and-send-files', files);
      }
    }
  });

  app.whenReady().then(async () => {
    loadSettings();
    if (autoStart) {
      applyAutoStart(true);
    }
    registerContextMenu();

    if (session && session.defaultSession) {
      try {
        session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
          desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
            if (sources && sources.length > 0) {
              callback({ video: sources[0], audio: 'loopback' });
            } else {
              callback({});
            }
          }).catch(() => callback({}));
        });
      } catch (e) {
        console.warn('setDisplayMediaRequestHandler not supported:', e.message);
      }
    }

    createWindow();
    createTray();

    mainWindow.webContents.on('did-finish-load', () => {
      const initialFiles = parseFilePathsFromArgv(process.argv);
      if (initialFiles.length > 0) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('open-and-send-files', initialFiles);
          }
        }, 500);
      }

      // Trigger silent GitHub update check after 3 seconds
      setTimeout(() => {
        checkForGithubUpdates().catch(e => console.warn('[AutoUpdate] Check error:', e));
      }, 3000);
    });

  const captureHandler = async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const img = await mainWindow.webContents.capturePage();
      const savePath = path.join(__dirname, '../../../pc_screenshot.png');
      fs.writeFileSync(savePath, img.toPNG());
      return savePath;
    }
    return null;
  };

  const evalHandler = async (code) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return await mainWindow.webContents.executeJavaScript(code);
    }
    return null;
  };

  // Initialize and start Server
  server = new MoztroServer({
    storagePath: getPairedDevicesFilePath(),
    fileSaveDirectory,
    clipboard,
    captureHandler,
    evalHandler
  });

  server.on('log', (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', {
        time: new Date().toLocaleTimeString(),
        message: msg
      });
    }
  });

  server.on('pairingRequest', (req) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pairing-request', req);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  server.on('deviceDetected', (dev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-detected', dev);
    }
  });

  server.on('deviceUndetected', (dev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-undetected', dev);
    }
  });

  server.on('deviceConnected', (dev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-connected', dev);
    }
  });

  server.on('deviceDisconnected', (dev) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-disconnected', dev);
    }
  });

  server.on('pingReceived', (pingData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ping-received', pingData);
    }
  });

  server.on('fileTransferProgress', (progressData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-transfer-progress', progressData);
    }
  });

  server.on('clipboardReceived', (clipData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clipboard-received', clipData);
    }
  });

  let overdriveMainCaptureTimer = null;
  let isMainCapturing = false;
  let overdriveActiveDeviceId = null;
  let overdriveActiveSourceId = null;
  let overdriveLastFrameAt = 0;       // Timestamp of last successful frame sent
  let overdriveEngineStatusTimer = null; // Periodic status broadcast to renderer

  function startMainProcessOverdriveCapture(deviceId, sourceId, quality) {
    stopMainProcessOverdriveCapture();
    overdriveActiveDeviceId = deviceId;
    overdriveActiveSourceId = sourceId;
    overdriveLastFrameAt = 0;

    const width = quality === 'HIGH' ? 1920 : (quality === 'BALANCED' ? 1280 : 854);
    const height = quality === 'HIGH' ? 1080 : (quality === 'BALANCED' ? 720 : 480);
    const jpegQuality = quality === 'HIGH' ? 80 : (quality === 'BALANCED' ? 65 : 50);
    // Faster intervals: HIGH=33ms(30fps), BALANCED=20ms(50fps), FAST=16ms(60fps)
    const intervalMs = quality === 'HIGH' ? 33 : (quality === 'BALANCED' ? 20 : 16);

    const captureTick = async () => {
      if (!overdriveActiveDeviceId || isMainCapturing) return;
      isMainCapturing = true;
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width, height }
        });
        let targetSource = sources.find(s => s.id === overdriveActiveSourceId) || sources[0];
        if (targetSource && targetSource.thumbnail && !targetSource.thumbnail.isEmpty()) {
          const jpegBuf = targetSource.thumbnail.toJPEG(jpegQuality);
          if (jpegBuf && jpegBuf.length > 100) {
            const frameBuf = Buffer.allocUnsafe(1 + jpegBuf.length);
            frameBuf[0] = 0x01; // Video JPEG Frame header
            jpegBuf.copy(frameBuf, 1);
            server.sendOverdriveBinary(overdriveActiveDeviceId, frameBuf);
            overdriveLastFrameAt = Date.now(); // Mark successful frame
          }
        }
      } catch (e) {
        console.warn('Main capturer error:', e.message);
      } finally {
        isMainCapturing = false;
      }
    };

    overdriveMainCaptureTimer = setInterval(captureTick, intervalMs);
    captureTick();

    // Broadcast engine status to renderer every 1 second so it can decide if fallback is needed
    overdriveEngineStatusTimer = setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const now = Date.now();
        const mainActive = (now - overdriveLastFrameAt) < 3000 && overdriveLastFrameAt > 0;
        mainWindow.webContents.send('overdrive-engine-status', { mainActive, lastFrameAt: overdriveLastFrameAt });
      }
    }, 1000);
  }

  function stopMainProcessOverdriveCapture() {
    if (overdriveMainCaptureTimer) {
      clearInterval(overdriveMainCaptureTimer);
      overdriveMainCaptureTimer = null;
    }
    if (overdriveEngineStatusTimer) {
      clearInterval(overdriveEngineStatusTimer);
      overdriveEngineStatusTimer = null;
    }
    isMainCapturing = false;
    overdriveLastFrameAt = 0;
    overdriveActiveDeviceId = null;
    // Notify renderer that main engine is now inactive
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('overdrive-engine-status', { mainActive: false, lastFrameAt: 0 });
    }
  }

  server.on('requestScreenSources', async (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('request-screen-sources', data);
    }
    try {
      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      });

      const list = sources.map((src, index) => {
        const matchedDisplay = displays.find(d => String(d.id) === src.display_id) || displays[index] || primaryDisplay;
        const isPrimary = matchedDisplay ? (matchedDisplay.id === primaryDisplay.id) : (index === 0);
        const width = matchedDisplay?.bounds?.width || 1920;
        const height = matchedDisplay?.bounds?.height || 1080;
        return {
          id: src.id,
          name: `Display ${index + 1}${isPrimary ? ' (Primary)' : ''}`,
          width,
          height,
          isPrimary
        };
      });

      server.sendJsonToDevice(data.deviceId, {
        type: 'SCREEN_SOURCES_RESPONSE',
        sources: list
      });
    } catch (e) {
      console.warn('requestScreenSources error:', e.message);
    }
  });

  server.on('startOverdriveStream', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('start-overdrive-stream', data);
    }
    startMainProcessOverdriveCapture(data.deviceId, data.sourceId, data.quality);

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      server.sendJsonToDevice(data.deviceId, {
        type: 'OVERDRIVE_STREAM_STARTED',
        width: primaryDisplay?.bounds?.width || 1920,
        height: primaryDisplay?.bounds?.height || 1080,
        sourceId: data.sourceId || 'screen:0:0'
      });
    } catch (_) {}
  });

  server.on('stopOverdriveStream', (data) => {
    stopMainProcessOverdriveCapture();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stop-overdrive-stream', data);
    }
  });

  server.on('changeOverdriveMonitor', (data) => {
    overdriveActiveSourceId = data.sourceId;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('change-overdrive-monitor', data);
    }
  });

  try {
    await server.start();
  } catch (err) {
    console.error('Failed to start Moztro Server:', err);
  }

  // Setup IPC Handlers
  ipcMain.handle('get-server-info', () => {
    return {
      ip: server.getPrimaryIP(),
      allIps: server.getLocalIPs(),
      wsPort: server.wsPort,
      udpPort: server.udpPort,
      isRunning: server.isRunning,
      detectedDevices: server.getDetectedDevicesList(),
      pairedDevices: Array.from(server.pairedDevices.values()).map(dev => ({
        ...dev,
        isConnected: server.activeSockets.has(dev.deviceId)
      })),
      connectedDevices: Array.from(server.activeSockets.keys()),
      pendingPairings: Array.from(server.pendingPairings.values()).map(p => p.info)
    };
  });

  ipcMain.handle('approve-pairing', (_event, deviceId) => {
    return server.approvePairing(deviceId);
  });

  ipcMain.handle('reject-pairing', (_event, deviceId) => {
    return server.rejectPairing(deviceId);
  });

  ipcMain.handle('get-minimize-to-tray', () => {
    return minimizeToTray;
  });

  ipcMain.handle('set-minimize-to-tray', (_event, enabled) => {
    minimizeToTray = !!enabled;
    saveSettings();
    return minimizeToTray;
  });

  ipcMain.handle('get-auto-start', () => {
    return autoStart;
  });

  ipcMain.handle('set-auto-start', (_event, enabled) => {
    applyAutoStart(enabled);
    return autoStart;
  });

  ipcMain.handle('get-file-save-directory', () => {
    return fileSaveDirectory;
  });

  ipcMain.handle('select-file-save-directory', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selected Directory for File Send',
        defaultPath: fileSaveDirectory,
        properties: ['openDirectory', 'createDirectory', 'promptToCreate']
      });

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        fileSaveDirectory = result.filePaths[0];
        saveSettings();
        if (server) {
          server.setSaveDirectory(fileSaveDirectory);
        }
      }
    } catch (e) {
      console.warn('Error choosing directory:', e.message);
    }
    return fileSaveDirectory;
  });

  ipcMain.handle('get-delete-file-on-clear-history', () => {
    return deleteFileOnClearHistory;
  });

  ipcMain.handle('set-delete-file-on-clear-history', (_event, enabled) => {
    deleteFileOnClearHistory = !!enabled;
    saveSettings();
    return deleteFileOnClearHistory;
  });

  ipcMain.handle('delete-transfer-files', (_event, items) => {
    if (!Array.isArray(items) || items.length === 0) return { success: true, deletedCount: 0 };
    let deletedCount = 0;
    for (const item of items) {
      try {
        if (item.path && fs.existsSync(item.path)) {
          fs.unlinkSync(item.path);
          deletedCount++;
        } else if (item.name) {
          const candidate = path.join(fileSaveDirectory, item.name);
          if (fs.existsSync(candidate)) {
            fs.unlinkSync(candidate);
            deletedCount++;
          }
        }
      } catch (err) {
        console.warn(`Could not delete file ${item.name || item.path}:`, err.message);
      }
    }
    return { success: true, deletedCount };
  });

  ipcMain.handle('read-clipboard-image', () => {
    try {
      const img = clipboard.readImage();
      if (img && !img.isEmpty()) {
        const pngBuf = img.toPNG();
        const dataUrl = img.toDataURL();
        const size = img.getSize();
        return {
          hasImage: true,
          dataUrl: dataUrl,
          width: size.width,
          height: size.height,
          byteLength: pngBuf.length,
          base64: pngBuf.toString('base64')
        };
      }
    } catch (e) {
      console.warn('Failed reading clipboard image:', e.message);
    }
    return { hasImage: false };
  });

  ipcMain.handle('get-clipboard-text', () => {
    return clipboard.readText();
  });

  ipcMain.handle('set-clipboard-text', (_event, text) => {
    clipboard.writeText(text || '');
    return true;
  });

  ipcMain.handle('select-files', async () => {
    try {
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Files to Send',
        properties: ['openFile', 'multiSelections']
      });
      if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        return res.filePaths.map(filePath => {
          const stat = fs.statSync(filePath);
          return {
            name: path.basename(filePath),
            path: filePath,
            size: stat.size
          };
        });
      }
    } catch (e) {
      console.warn('Error selecting files:', e.message);
    }
    return [];
  });

  ipcMain.handle('send-file-transfer', async (_event, options) => {
    try {
      const { deviceId, files, clipboardImage } = options || {};
      if (clipboardImage && clipboardImage.base64) {
        const buffer = Buffer.from(clipboardImage.base64, 'base64');
        const transferId = clipboardImage.customTransferId || clipboardImage.transferId || ('tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
        const fileName = clipboardImage.name || `Screenshot_${new Date().toISOString().replace(/[-:T]/g, '_').slice(0, 15)}.png`;
        await server.sendFileToPhone(deviceId, {
          transferId,
          fileName,
          buffer,
          mimeType: 'image/png'
        });
        return { success: true, transferIds: [transferId] };
      } else if (files && Array.isArray(files) && files.length > 0) {
        const transferIds = [];
        for (const f of files) {
          let buffer;
          if (f.base64) {
            buffer = Buffer.from(f.base64, 'base64');
          } else if (f.path) {
            buffer = fs.readFileSync(f.path);
          } else {
            throw new Error(`Cannot read file: ${f.name} (missing path or content)`);
          }

          const transferId = f.customTransferId || f.transferId || ('tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
          transferIds.push(transferId);
          await server.sendFileToPhone(deviceId, {
            transferId,
            fileName: f.name,
            buffer,
            mimeType: ''
          });
          // Small gap between consecutive files to avoid WS buffer flooding
          if (files.length > 1) await new Promise(r => setTimeout(r, 100));
        }
        return { success: true, transferIds };
      }
    } catch (e) {
      console.error('Error initiating file transfer:', e);
      return { success: false, error: e.message };
    }
    return { success: false, error: 'No files provided' };
  });

  ipcMain.handle('cancel-file-transfer', (_event, transferId) => {
    server.cancelFileTransfer(transferId);
    return true;
  });

  ipcMain.handle('request-phone-clipboard', (_event, deviceId) => {
    return server.requestPhoneClipboard(deviceId);
  });

  ipcMain.handle('send-clipboard-to-phone', (_event, text, deviceId) => {
    return server.sendClipboardToPhone(deviceId, text);
  });

  ipcMain.handle('open-file-path', async (_event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') return false;
      if (fs.existsSync(filePath)) {
        await shell.openPath(filePath);
        return true;
      }
    } catch (e) {
      console.warn('Could not open file path:', e.message);
    }
    return false;
  });

  ipcMain.handle('open-vod', async (_event, deviceIp, ftpPort = 2121) => {
    try {
      const targetIp = deviceIp || (server ? server.getPrimaryIP() : null);
      if (!targetIp) return { success: false, error: 'No device IP available' };
      const ftpUrl = `ftp://${targetIp}:${ftpPort}/`;
      const { exec } = require('child_process');
      exec(`explorer.exe "${ftpUrl}"`);
      return { success: true, ftpUrl };
    } catch (e) {
      console.error('Failed to open VOD in Windows Explorer:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-screen-sources', async () => {
    try {
      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      });

      return sources.map((src, index) => {
        const matchedDisplay = displays.find(d => String(d.id) === src.display_id) || displays[index] || primaryDisplay;
        const isPrimary = matchedDisplay ? (matchedDisplay.id === primaryDisplay.id) : (index === 0);
        const width = matchedDisplay?.bounds?.width || 1920;
        const height = matchedDisplay?.bounds?.height || 1080;
        return {
          id: src.id,
          name: `Display ${index + 1}${isPrimary ? ' (Primary)' : ''}`,
          width,
          height,
          isPrimary
        };
      });
    } catch (e) {
      console.error('get-screen-sources error:', e);
      return [];
    }
  });

  ipcMain.on('send-overdrive-frame', (_event, deviceId, frameBuffer) => {
    if (server && frameBuffer) {
      let buf;
      if (Buffer.isBuffer(frameBuffer)) {
        buf = frameBuffer;
      } else if (frameBuffer.buffer) {
        buf = Buffer.from(frameBuffer.buffer, frameBuffer.byteOffset || 0, frameBuffer.byteLength || frameBuffer.length);
      } else {
        buf = Buffer.from(frameBuffer);
      }
      server.sendOverdriveBinary(deviceId, buf);
    }
  });

  ipcMain.on('send-overdrive-json', (_event, deviceId, data) => {
    if (server && data) {
      server.sendJsonToDevice(deviceId, data);
    }
  });

  ipcMain.handle('open-external-url', async (_event, url) => {
    try {
      if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
        shell.openExternal(url);
        return true;
      }
    } catch (e) {
      console.warn('Failed to open external url:', e.message);
    }
    return false;
  });

  ipcMain.handle('check-for-updates', async () => {
    return await checkForGithubUpdates();
  });

  ipcMain.handle('install-update', () => {
    if (!latestDownloadedInstaller || !fs.existsSync(latestDownloadedInstaller)) {
      return { success: false, error: 'Installer file not found' };
    }
    try {
      console.log('[AutoUpdate] Preparing silent install & restart:', latestDownloadedInstaller);
      const targetExe = process.execPath.toLowerCase().endsWith('electron.exe')
        ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Programs', 'Moztro', 'Moztro.exe')
        : process.execPath;

      // Launch hidden powershell script: wait for silent install (/S) to complete, then start updated Moztro.exe
      const psCommand = `Start-Sleep -Milliseconds 800; Start-Process -FilePath "${latestDownloadedInstaller}" -ArgumentList "/S" -Wait; Start-Process -FilePath "${targetExe}"`;
      const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();

      // Gracefully exit immediately so installer can overwrite files without locks
      setTimeout(() => {
        if (server) server.stop();
        isQuitting = true;
        app.quit();
      }, 400);

      return { success: true };
    } catch (err) {
      console.error('[AutoUpdate] Failed to launch installer process:', err);
      return { success: false, error: err.message };
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!minimizeToTray || isQuitting) {
      if (server) server.stop();
      app.quit();
    }
  }
});
}
