const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('moztroAPI', {
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return file.path || '';
    } catch (_) {
      return file.path || '';
    }
  },
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  approvePairing: (deviceId) => ipcRenderer.invoke('approve-pairing', deviceId),
  rejectPairing: (deviceId) => ipcRenderer.invoke('reject-pairing', deviceId),
  getMinimizeToTray: () => ipcRenderer.invoke('get-minimize-to-tray'),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('set-minimize-to-tray', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  getFileSaveDirectory: () => ipcRenderer.invoke('get-file-save-directory'),
  selectFileSaveDirectory: () => ipcRenderer.invoke('select-file-save-directory'),
  getDeleteFileOnClearHistory: () => ipcRenderer.invoke('get-delete-file-on-clear-history'),
  setDeleteFileOnClearHistory: (enabled) => ipcRenderer.invoke('set-delete-file-on-clear-history', enabled),
  deleteTransferFiles: (items) => ipcRenderer.invoke('delete-transfer-files', items),
  openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
  openVod: (deviceIp, ftpPort) => ipcRenderer.invoke('open-vod', deviceIp, ftpPort),
  readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image'),
  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),
  setClipboardText: (text) => ipcRenderer.invoke('set-clipboard-text', text),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  sendFileTransfer: (options) => ipcRenderer.invoke('send-file-transfer', options),
  cancelFileTransfer: (transferId) => ipcRenderer.invoke('cancel-file-transfer', transferId),
  requestPhoneClipboard: (deviceId) => ipcRenderer.invoke('request-phone-clipboard', deviceId),
  sendClipboardToPhone: (text, deviceId) => ipcRenderer.invoke('send-clipboard-to-phone', text, deviceId),
  onServerLog: (callback) => ipcRenderer.on('server-log', (_event, value) => callback(value)),
  onPairingRequest: (callback) => ipcRenderer.on('pairing-request', (_event, value) => callback(value)),
  onDeviceDetected: (callback) => ipcRenderer.on('device-detected', (_event, value) => callback(value)),
  onDeviceUndetected: (callback) => ipcRenderer.on('device-undetected', (_event, value) => callback(value)),
  onDeviceConnected: (callback) => ipcRenderer.on('device-connected', (_event, value) => callback(value)),
  onDeviceDisconnected: (callback) => ipcRenderer.on('device-disconnected', (_event, value) => callback(value)),
  onPingReceived: (callback) => ipcRenderer.on('ping-received', (_event, value) => callback(value)),
  onFileTransferProgress: (callback) => ipcRenderer.on('file-transfer-progress', (_event, value) => callback(value)),
  onClipboardReceived: (callback) => ipcRenderer.on('clipboard-received', (_event, value) => callback(value)),
  onOpenAndSendFiles: (callback) => ipcRenderer.on('open-and-send-files', (_event, value) => callback(value)),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  sendOverdriveFrame: (deviceId, frameBuffer) => ipcRenderer.send('send-overdrive-frame', deviceId, frameBuffer),
  sendOverdriveJson: (deviceId, data) => ipcRenderer.send('send-overdrive-json', deviceId, data),
  onRequestScreenSources: (callback) => ipcRenderer.on('request-screen-sources', (_event, value) => callback(value)),
  onStartOverdriveStream: (callback) => ipcRenderer.on('start-overdrive-stream', (_event, value) => callback(value)),
  onStopOverdriveStream: (callback) => ipcRenderer.on('stop-overdrive-stream', (_event, value) => callback(value)),
  onChangeOverdriveMonitor: (callback) => ipcRenderer.on('change-overdrive-monitor', (_event, value) => callback(value)),
  onOverdriveEngineStatus: (callback) => ipcRenderer.on('overdrive-engine-status', (_event, value) => callback(value)),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)
});
