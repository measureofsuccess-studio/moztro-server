document.addEventListener('DOMContentLoaded', async () => {
  const serverInfoText = document.getElementById('serverInfoText');
  const brandLogo = document.getElementById('brandLogo');
  const btnHome = document.getElementById('btnHome');
  const btnAbout = document.getElementById('btnAbout');
  const btnSettings = document.getElementById('btnSettings');
  const homeView = document.getElementById('homeView');
  const deviceView = document.getElementById('deviceView');
  const sendFileView = document.getElementById('sendFileView');
  const settingsView = document.getElementById('settingsView');
  const aboutView = document.getElementById('aboutView');
  const aboutInstagramLink = document.getElementById('aboutInstagramLink');
  const aboutEmailLink = document.getElementById('aboutEmailLink');
  const tileVod = document.getElementById('tileVod');
  const tileSendFile = document.getElementById('tileSendFile');
  const btnBackFromSendFile = document.getElementById('btnBackFromSendFile');
  const trayToggle = document.getElementById('trayToggle');
  const autoStartToggle = document.getElementById('autoStartToggle');
  const selectedDirPath = document.getElementById('selectedDirPath');
  const btnChangeDir = document.getElementById('btnChangeDir');
  const devicesList = document.getElementById('devicesList');
  const emptyDeviceText = document.getElementById('emptyDeviceText');

  // Send File Elements
  const dragDropZone = document.getElementById('dragDropZone');
  const dropZoneDefault = document.getElementById('dropZoneDefault');
  const btnSelectFilePc = document.getElementById('btnSelectFilePc');
  const clipboardImagePreview = document.getElementById('clipboardImagePreview');
  const clipboardImgElement = document.getElementById('clipboardImgElement');
  const clipboardImgName = document.getElementById('clipboardImgName');
  const clipboardImgMeta = document.getElementById('clipboardImgMeta');
  const btnConfirmSendImage = document.getElementById('btnConfirmSendImage');
  const btnCancelImagePreview = document.getElementById('btnCancelImagePreview');
  const btnSendClipboardPc = document.getElementById('btnSendClipboardPc');
  const btnPasteClipboardPc = document.getElementById('btnPasteClipboardPc');
  const btnSendFilePcMain = document.getElementById('btnSendFilePcMain');

  // Log panel elements
  const activeTransferBox = document.getElementById('activeTransferBox');
  const activeTransferArrow = document.getElementById('activeTransferArrow');
  const activeTransferName = document.getElementById('activeTransferName');
  const activeTransferSpeed = document.getElementById('activeTransferSpeed');
  const activeTransferPct = document.getElementById('activeTransferPct');
  const activeTransferBarFill = document.getElementById('activeTransferBarFill');
  const transferLogScroll = document.getElementById('transferLogScroll');
  const transferLogEmpty = document.getElementById('transferLogEmpty');

  // Log selection elements
  const logHeaderNormal = document.getElementById('logHeaderNormal');
  const logHeaderSelect = document.getElementById('logHeaderSelect');
  const btnSelectModeToggle = document.getElementById('btnSelectModeToggle');
  const btnDeleteAllData = document.getElementById('btnDeleteAllData');
  const cbSelectAll = document.getElementById('cbSelectAll');
  const selectAllText = document.getElementById('selectAllText');
  const btnOpenSelected = document.getElementById('btnOpenSelected');
  const btnCopySelected = document.getElementById('btnCopySelected');
  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  const btnCancelSelect = document.getElementById('btnCancelSelect');
  const deleteFileOnClearToggle = document.getElementById('deleteFileOnClearToggle');

  // Confirm delete all data modal elements
  const modalConfirmDeleteAll = document.getElementById('modalConfirmDeleteAll');
  const btnCancelDeleteAll = document.getElementById('btnCancelDeleteAll');
  const btnConfirmDeleteAll = document.getElementById('btnConfirmDeleteAll');

  // Auto-Update elements
  const updateBarContainer = document.getElementById('updateBarContainer');
  const updateProgressText = document.getElementById('updateProgressText');
  const btnInstallUpdate = document.getElementById('btnInstallUpdate');

  let currentPendingDeviceId = null;
  let currentSelectedDevice = null;
  let currentClipboardImage = null;

  // Selection state
  const selectedLogIds = new Set();
  let isSelectMode = false;
  let deleteFileOnClearHistory = false;

  // transferLog: array of { id, name, direction:'up'|'down', status, speed, progress, path }
  let transferLog = [];
  try {
    const savedLogs = localStorage.getItem('moztro_transfer_logs');
    if (savedLogs) {
      transferLog = JSON.parse(savedLogs) || [];
    }
  } catch (_) {
    transferLog = [];
  }

  function saveTransferLogsToStorage() {
    try {
      localStorage.setItem('moztro_transfer_logs', JSON.stringify(transferLog.slice(0, 100)));
    } catch (_) {}
  }

  // activeTransferId: current in-flight transfer being shown in the progress box
  let activeTransferId = null;

  // Ping elements
  const pingValue = document.getElementById('pingValue');
  const pingCanvas = document.getElementById('pingCanvas');
  const pingHistory = [];

  // Pairing Modal elements
  const pairingModal = document.getElementById('pairingModal');
  const reqDeviceName = document.getElementById('reqDeviceName');
  const reqDeviceIp = document.getElementById('reqDeviceIp');
  const btnApprovePair = document.getElementById('btnApprovePair');
  const btnRejectPair = document.getElementById('btnRejectPair');

  // Select Device Modal elements
  const modalSelectDevice = document.getElementById('modalSelectDevice');
  const modalFileName = document.getElementById('modalFileName');
  const modalFileMeta = document.getElementById('modalFileMeta');
  const modalDeviceList = document.getElementById('modalDeviceList');
  const modalDeviceEmpty = document.getElementById('modalDeviceEmpty');
  const btnCancelDeviceSelect = document.getElementById('btnCancelDeviceSelect');
  const btnCloseDeviceSelect = document.getElementById('btnCloseDeviceSelect');

  let pendingContextMenuFiles = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async function showDeviceSelectModal(files) {
    if (!files || files.length === 0) return;
    pendingContextMenuFiles = files;

    if (modalFileName && modalFileMeta) {
      if (files.length === 1) {
        modalFileName.textContent = files[0].name;
        modalFileMeta.textContent = `1 file • ${formatBytes(files[0].size || 0)}`;
      } else {
        const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
        modalFileName.textContent = `${files[0].name} (+${files.length - 1} more)`;
        modalFileMeta.textContent = `${files.length} files • ${formatBytes(totalSize)}`;
      }
    }

    await populateModalDevices();

    if (modalSelectDevice) {
      modalSelectDevice.classList.remove('hidden');
    }
  }

  function closeDeviceSelectModal() {
    pendingContextMenuFiles = null;
    if (modalSelectDevice) {
      modalSelectDevice.classList.add('hidden');
    }
  }

  async function populateModalDevices() {
    if (!modalDeviceList) return;
    modalDeviceList.innerHTML = '';

    let devices = [];
    if (window.moztroAPI?.getServerInfo) {
      try {
        const info = await window.moztroAPI.getServerInfo();
        devices = info?.detectedDevices || [];
      } catch (_) {}
    }

    const connectedDevices = devices.filter(d => d.isConnected);
    const displayDevices = connectedDevices.length > 0 ? connectedDevices : devices;

    if (displayDevices.length === 0) {
      if (modalDeviceEmpty) modalDeviceEmpty.classList.remove('hidden');
    } else {
      if (modalDeviceEmpty) modalDeviceEmpty.classList.add('hidden');
      displayDevices.forEach(dev => {
        const card = document.createElement('div');
        const isConn = !!dev.isConnected;
        card.className = 'modal-device-card';
        const badgeStyle = isConn ? '' : 'style="color: var(--mono-text-muted); background: rgba(255,255,255,0.05); border-color: var(--mono-border);"';
        const dotStyle = isConn ? '' : 'style="background: #888; box-shadow: none;"';
        const statusLabel = isConn ? 'Connected' : 'Offline';

        card.innerHTML = `
          <div class="modal-device-info">
            <span class="modal-device-name">${escapeHtml(dev.deviceName || dev.name || dev.hostname || 'Android Device')}</span>
            <span class="modal-device-ip font-mono">${escapeHtml(dev.ip || dev.deviceId || '')}</span>
          </div>
          <div class="modal-device-badge" ${badgeStyle}>
            <span class="status-dot" ${dotStyle}></span>
            <span>${statusLabel}</span>
          </div>
        `;
        card.addEventListener('click', async () => {
          const filesToSend = pendingContextMenuFiles;
          closeDeviceSelectModal();
          currentSelectedDevice = dev;
          if (filesToSend && filesToSend.length > 0) {
            await handleSendFiles(filesToSend);
          }
        });
        modalDeviceList.appendChild(card);
      });
    }
  }

  if (btnCancelDeviceSelect) {
    btnCancelDeviceSelect.addEventListener('click', closeDeviceSelectModal);
  }
  if (btnCloseDeviceSelect) {
    btnCloseDeviceSelect.addEventListener('click', closeDeviceSelectModal);
  }

  // Draw Ping Sparkline Graph
  function drawPingSparkline() {
    if (!pingCanvas) return;
    const ctx = pingCanvas.getContext('2d');
    const width = pingCanvas.width;
    const height = pingCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Subtle baseline
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 2);
    ctx.lineTo(width, height - 2);
    ctx.stroke();

    if (pingHistory.length < 2) {
      return;
    }

    const maxVal = Math.max(...pingHistory, 30);
    const minVal = 0;
    const range = maxVal - minVal || 1;

    const step = width / (pingHistory.length - 1);
    const paddingBottom = 4;
    const paddingTop = 8;
    const usableHeight = height - paddingBottom - paddingTop;

    // Draw sparkline line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    pingHistory.forEach((val, idx) => {
      const x = idx * step;
      const normalized = (val - minVal) / range;
      const y = (height - paddingBottom) - (normalized * usableHeight);

      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw glowing dot at latest reading
    const lastX = (pingHistory.length - 1) * step;
    const lastVal = pingHistory[pingHistory.length - 1];
    const lastY = (height - paddingBottom) - (((lastVal - minVal) / range) * usableHeight);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Initial flat graph
  drawPingSparkline();

  // View Navigation
  function showHomeView() {
    currentSelectedDevice = null;
    if (homeView) homeView.classList.remove('hidden');
    if (deviceView) deviceView.classList.add('hidden');
    if (sendFileView) sendFileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    if (aboutView) aboutView.classList.add('hidden');
    if (btnHome) btnHome.classList.add('active');
    if (btnSettings) btnSettings.classList.remove('active');
    if (btnAbout) btnAbout.classList.remove('active');
  }

  function showDeviceView(dev) {
    currentSelectedDevice = dev;
    if (homeView) homeView.classList.add('hidden');
    if (sendFileView) sendFileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    if (aboutView) aboutView.classList.add('hidden');
    if (deviceView) deviceView.classList.remove('hidden');
    if (btnHome) btnHome.classList.remove('active');
    if (btnSettings) btnSettings.classList.remove('active');
    if (btnAbout) btnAbout.classList.remove('active');
    drawPingSparkline();
  }

  function showSendFileView() {
    if (homeView) homeView.classList.add('hidden');
    if (deviceView) deviceView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    if (aboutView) aboutView.classList.add('hidden');
    if (sendFileView) sendFileView.classList.remove('hidden');
    if (btnHome) btnHome.classList.remove('active');
    if (btnSettings) btnSettings.classList.remove('active');
    if (btnAbout) btnAbout.classList.remove('active');
    updateDropZoneState();
    renderTransferLog();
  }

  function showSettingsView() {
    currentSelectedDevice = null;
    if (homeView) homeView.classList.add('hidden');
    if (deviceView) deviceView.classList.add('hidden');
    if (sendFileView) sendFileView.classList.add('hidden');
    if (aboutView) aboutView.classList.add('hidden');
    if (settingsView) settingsView.classList.remove('hidden');
    if (btnHome) btnHome.classList.remove('active');
    if (btnSettings) btnSettings.classList.add('active');
    if (btnAbout) btnAbout.classList.remove('active');
  }

  function showAboutView() {
    currentSelectedDevice = null;
    if (homeView) homeView.classList.add('hidden');
    if (deviceView) deviceView.classList.add('hidden');
    if (sendFileView) sendFileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    if (aboutView) aboutView.classList.remove('hidden');
    if (btnHome) btnHome.classList.remove('active');
    if (btnSettings) btnSettings.classList.remove('active');
    if (btnAbout) btnAbout.classList.add('active');
  }

  if (btnHome) {
    btnHome.addEventListener('click', showHomeView);
  }

  if (tileVod) {
    tileVod.addEventListener('click', async () => {
      const ip = currentSelectedDevice?.ip;
      if (!ip) {
        console.warn('No device selected or connected');
        return;
      }
      if (window.moztroAPI?.openVod) {
        await window.moztroAPI.openVod(ip, 2121);
      }
    });
  }

  if (tileSendFile) {
    tileSendFile.addEventListener('click', () => {
      showSendFileView();
    });
  }

  if (btnBackFromSendFile) {
    btnBackFromSendFile.addEventListener('click', () => {
      if (currentSelectedDevice) {
        showDeviceView(currentSelectedDevice);
      } else {
        showHomeView();
      }
    });
  }

  // ─── Drop Zone State (only clipboard image preview / default) ───────────────
  function updateDropZoneState() {
    if (currentClipboardImage) {
      if (dropZoneDefault) dropZoneDefault.classList.add('hidden');
      if (clipboardImagePreview) clipboardImagePreview.classList.remove('hidden');
    } else {
      if (clipboardImagePreview) clipboardImagePreview.classList.add('hidden');
      if (dropZoneDefault) dropZoneDefault.classList.remove('hidden');
    }
  }

  // ─── Transfer Log Selection Mode ───────────────────────────────────────────
  function updateSelectionHeader() {
    if (isSelectMode) {
      if (logHeaderNormal) logHeaderNormal.classList.add('hidden');
      if (logHeaderSelect) logHeaderSelect.classList.remove('hidden');

      const count = selectedLogIds.size;
      const total = transferLog.length;

      if (cbSelectAll) {
        cbSelectAll.checked = total > 0 && count === total;
        cbSelectAll.indeterminate = count > 0 && count < total;
      }
      if (selectAllText) {
        selectAllText.textContent = count > 0 ? `(${count})` : 'All';
      }
      if (btnOpenSelected) {
        btnOpenSelected.disabled = count === 0;
      }
      if (btnCopySelected) {
        btnCopySelected.disabled = count === 0;
      }
      if (btnDeleteSelected) {
        btnDeleteSelected.disabled = count === 0;
        btnDeleteSelected.textContent = count > 0 ? `Delete (${count})` : 'Delete';
      }
    } else {
      if (logHeaderSelect) logHeaderSelect.classList.add('hidden');
      if (logHeaderNormal) logHeaderNormal.classList.remove('hidden');
    }
  }

  function toggleSelectMode(enable) {
    isSelectMode = !!enable;
    if (!isSelectMode) {
      selectedLogIds.clear();
    }
    updateSelectionHeader();
    renderTransferLog();
  }

  function toggleItemSelection(id) {
    if (!isSelectMode) return;
    if (selectedLogIds.has(id)) {
      selectedLogIds.delete(id);
    } else {
      selectedLogIds.add(id);
    }
    updateSelectionHeader();
    renderTransferLog();
  }

  // ─── Transfer Log Panel Rendering ────────────────────────────────────────────
  function addTransferLogEntry(entry) {
    // { id, name, direction:'up'|'down', status:'SENDING'|'COMPLETE'|'FAILED'|'RECEIVED'|'CANCELLED', speed, path, fullText }
    transferLog.unshift(entry); // newest first
    if (transferLog.length > 100) transferLog.pop();
    saveTransferLogsToStorage();
    renderTransferLog();
  }

  function updateTransferLogEntry(id, updates) {
    const idx = transferLog.findIndex(e => e.id === id);
    if (idx !== -1) {
      Object.assign(transferLog[idx], updates);
      saveTransferLogsToStorage();
    }
    renderTransferLog();
  }

  function renderTransferLog() {
    if (!transferLogScroll) return;

    if (btnDeleteAllData) {
      btnDeleteAllData.disabled = transferLog.length === 0;
      btnDeleteAllData.style.opacity = transferLog.length === 0 ? '0.35' : '1';
      btnDeleteAllData.style.cursor = transferLog.length === 0 ? 'not-allowed' : 'pointer';
    }
    if (btnSelectModeToggle) {
      btnSelectModeToggle.disabled = transferLog.length === 0;
      btnSelectModeToggle.style.opacity = transferLog.length === 0 ? '0.35' : '1';
      btnSelectModeToggle.style.cursor = transferLog.length === 0 ? 'not-allowed' : 'pointer';
    }

    // Remove all log rows (keep the empty placeholder)
    Array.from(transferLogScroll.querySelectorAll('.log-row')).forEach(el => el.remove());

    if (transferLog.length === 0) {
      if (transferLogEmpty) transferLogEmpty.style.display = '';
      if (isSelectMode) {
        isSelectMode = false;
        selectedLogIds.clear();
        updateSelectionHeader();
      }
      return;
    }
    if (transferLogEmpty) transferLogEmpty.style.display = 'none';

    updateSelectionHeader();

    transferLog.forEach(entry => {
      const isSelected = selectedLogIds.has(entry.id);
      const row = document.createElement('div');
      row.className = 'log-row' + (isSelected ? ' selected' : '');

      const arrowClass = entry.direction === 'up' ? 'up' : 'down';
      const arrowChar = entry.direction === 'up' ? '↑' : '↓';

      let statusClass = 'status-sending';
      let statusLabel = 'Sending...';
      if (entry.status === 'COMPLETE')   { statusClass = 'status-complete'; statusLabel = 'Done'; }
      if (entry.status === 'FAILED')     { statusClass = 'status-failed';   statusLabel = 'Failed'; }
      if (entry.status === 'RECEIVED')   { statusClass = 'status-received'; statusLabel = 'Received'; }
      if (entry.status === 'CANCELLED')  { statusClass = 'status-cancelled'; statusLabel = 'Cancelled'; }

      const checkboxHtml = isSelectMode
        ? `<input type="checkbox" class="custom-checkbox log-row-checkbox" ${isSelected ? 'checked' : ''}>`
        : '';

      row.innerHTML = `
        ${checkboxHtml}
        <span class="log-row-arrow ${arrowClass}">${arrowChar}</span>
        <div class="log-row-info">
          <span class="log-row-name">${escapeHtml(entry.name)}</span>
          <span class="log-row-meta">${escapeHtml(entry.speed || '')}</span>
        </div>
        <span class="log-row-status ${statusClass}">${statusLabel}</span>
      `;

      if (isSelectMode) {
        const cb = row.querySelector('.log-row-checkbox');
        if (cb) {
          cb.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItemSelection(entry.id);
          });
        }
      }

      row.addEventListener('click', async (e) => {
        if (isSelectMode) {
          if (e.target && e.target.classList.contains('log-row-checkbox')) return;
          toggleItemSelection(entry.id);
        } else {
          // Normal mode: open file with default OS application or copy clipboard text
          if (entry.status === 'COMPLETE' || entry.status === 'RECEIVED') {
            if (entry.id?.startsWith('clip_') || entry.fullText) {
              if (window.moztroAPI?.setClipboardText) {
                const textToCopy = entry.fullText || entry.name;
                await window.moztroAPI.setClipboardText(textToCopy);
              }
            } else if (entry.path) {
              if (window.moztroAPI?.openFilePath) {
                await window.moztroAPI.openFilePath(entry.path);
              }
            }
          }
        }
      });

      // Append after empty placeholder
      transferLogScroll.appendChild(row);
    });
  }

  // Show active progress in the top box of the log panel
  function showActiveProgress(id, name, direction, pct, speed) {
    activeTransferId = id;
    if (!activeTransferBox) return;
    activeTransferBox.classList.remove('hidden');
    if (activeTransferArrow) {
      activeTransferArrow.textContent = direction === 'up' ? '↑' : '↓';
      activeTransferArrow.style.color = direction === 'up' ? '#7dd3ae' : '#7ab4e8';
    }
    if (activeTransferName) activeTransferName.textContent = name;
    if (activeTransferSpeed) activeTransferSpeed.textContent = speed || '';
    if (activeTransferPct) activeTransferPct.textContent = `${Math.round(pct * 100)}%`;
    if (activeTransferBarFill) activeTransferBarFill.style.width = `${Math.round(pct * 100)}%`;
  }

  function hideActiveProgress() {
    activeTransferId = null;
    if (activeTransferBox) activeTransferBox.classList.add('hidden');
  }


  // Drag & Drop Listeners
  if (dragDropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dragDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach(eventName => {
      dragDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDropZone.classList.remove('dragover');
      });
    });

    dragDropZone.addEventListener('drop', async (e) => {
      const dtFiles = e.dataTransfer?.files;
      if (dtFiles && dtFiles.length > 0) {
        const fileList = [];
        for (const f of Array.from(dtFiles)) {
          let filePath = '';
          if (window.moztroAPI?.getPathForFile) {
            filePath = window.moztroAPI.getPathForFile(f);
          }
          if (!filePath && f.path) {
            filePath = f.path;
          }

          if (filePath) {
            fileList.push({
              name: f.name,
              path: filePath,
              size: f.size
            });
          } else {
            // Buffer fallback if OS path is not obtainable
            try {
              const arrayBuf = await f.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuf);
              let binary = '';
              const chunkSize = 8192;
              for (let i = 0; i < uint8.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
              }
              const base64 = btoa(binary);
              fileList.push({
                name: f.name,
                base64: base64,
                size: f.size
              });
            } catch (err) {
              console.warn('Could not read dropped file buffer:', err);
            }
          }
        }

        if (fileList.length > 0) {
          await handleSendFiles(fileList);
        }
      }
    });
  }

  // File Picker Dialog
  if (btnSelectFilePc) {
    btnSelectFilePc.addEventListener('click', async () => {
      if (window.moztroAPI?.selectFiles) {
        const files = await window.moztroAPI.selectFiles();
        if (files && files.length > 0) {
          await handleSendFiles(files);
        }
      }
    });
  }

  async function handleSendFiles(files) {
    if (!files || files.length === 0) return;
    currentClipboardImage = null;
    updateDropZoneState();

    files.forEach((f, idx) => {
      const id = 'tx_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 4);
      f.customTransferId = id;
      addTransferLogEntry({
        id,
        name: f.name,
        direction: 'up',
        status: 'SENDING',
        speed: 'Starting...',
        path: f.path || ''
      });
      showActiveProgress(id, f.name, 'up', 0, 'Starting...');
    });

    const res = await window.moztroAPI?.sendFileTransfer({
      deviceId: currentSelectedDevice?.deviceId,
      files: files
    });

    if (res && !res.success) {
      console.warn('File transfer failed:', res.error);
      files.forEach(f => {
        if (f.customTransferId) {
          updateTransferLogEntry(f.customTransferId, { status: 'FAILED', speed: 'Failed' });
        }
      });
      hideActiveProgress();
    }
  }

  // Clipboard Image Check & Display
  async function checkAndShowClipboardImage() {
    if (!window.moztroAPI?.readClipboardImage) return false;
    const res = await window.moztroAPI.readClipboardImage();
    if (res && res.hasImage) {
      const now = new Date();
      const timeStr = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') + '_' +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
      const name = `Screenshot_${timeStr}.png`;

      currentClipboardImage = { ...res, name };
      if (clipboardImgElement) clipboardImgElement.src = res.dataUrl;
      if (clipboardImgName) clipboardImgName.textContent = name;
      if (clipboardImgMeta) {
        clipboardImgMeta.textContent = `${formatBytes(res.byteLength)} • ${res.width}x${res.height}`;
      }
      updateDropZoneState();
      return true;
    }
    return false;
  }

  // Confirm Send Clipboard Image
  if (btnConfirmSendImage) {
    btnConfirmSendImage.addEventListener('click', async () => {
      if (!currentClipboardImage) return;
      const imgToSend = currentClipboardImage;
      currentClipboardImage = null;
      updateDropZoneState();

      const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      imgToSend.customTransferId = id;
      addTransferLogEntry({ id, name: imgToSend.name, direction: 'up', status: 'SENDING', speed: 'Starting...' });
      showActiveProgress(id, imgToSend.name, 'up', 0, 'Starting...');

      const res = await window.moztroAPI?.sendFileTransfer({
        deviceId: currentSelectedDevice?.deviceId,
        clipboardImage: imgToSend
      });

      if (res && !res.success) {
        console.warn('Image transfer failed:', res.error);
        updateTransferLogEntry(id, { status: 'FAILED', speed: 'Failed' });
        hideActiveProgress();
      }
    });
  }

  // Cancel Clipboard Image Preview
  if (btnCancelImagePreview) {
    btnCancelImagePreview.addEventListener('click', () => {
      currentClipboardImage = null;
      updateDropZoneState();
    });
  }


  // ─── Log Selection Mode Listeners ───────────────────────────────────────────

  // Enter selection mode
  if (btnSelectModeToggle) {
    btnSelectModeToggle.addEventListener('click', () => {
      if (transferLog.length === 0) return;
      toggleSelectMode(!isSelectMode);
    });
  }

  // Open Delete All Data modal
  if (btnDeleteAllData) {
    btnDeleteAllData.addEventListener('click', () => {
      if (transferLog.length === 0) return;
      if (modalConfirmDeleteAll) modalConfirmDeleteAll.classList.remove('hidden');
    });
  }

  // Cancel Delete All Data
  if (btnCancelDeleteAll) {
    btnCancelDeleteAll.addEventListener('click', () => {
      if (modalConfirmDeleteAll) modalConfirmDeleteAll.classList.add('hidden');
    });
  }

  // Confirm Delete All Data: permanently wipe logs and delete physical files from disk
  if (btnConfirmDeleteAll) {
    btnConfirmDeleteAll.addEventListener('click', async () => {
      if (modalConfirmDeleteAll) modalConfirmDeleteAll.classList.add('hidden');
      
      const itemsToDelete = transferLog.map(e => ({
        name: e.name,
        path: e.path || ''
      }));

      // Unconditionally delete physical files for Delete All Data
      if (window.moztroAPI?.deleteTransferFiles && itemsToDelete.length > 0) {
        try {
          await window.moztroAPI.deleteTransferFiles(itemsToDelete);
        } catch (err) {
          console.warn('Could not delete files on clear all:', err);
        }
      }

      transferLog = [];
      selectedLogIds.clear();
      isSelectMode = false;
      saveTransferLogsToStorage();
      hideActiveProgress();
      updateSelectionHeader();
      renderTransferLog();
    });
  }

  // Close Delete All Modal on backdrop click
  if (modalConfirmDeleteAll) {
    modalConfirmDeleteAll.addEventListener('click', (e) => {
      if (e.target === modalConfirmDeleteAll) {
        modalConfirmDeleteAll.classList.add('hidden');
      }
    });
  }

  // Select All checkbox
  if (cbSelectAll) {
    cbSelectAll.addEventListener('change', () => {
      if (cbSelectAll.checked) {
        transferLog.forEach(e => selectedLogIds.add(e.id));
      } else {
        selectedLogIds.clear();
      }
      updateSelectionHeader();
      renderTransferLog();
    });
  }

  // Open selected files with default OS application
  if (btnOpenSelected) {
    btnOpenSelected.addEventListener('click', async () => {
      const selectedEntries = transferLog.filter(e => selectedLogIds.has(e.id));
      for (const entry of selectedEntries) {
        if (entry.path && window.moztroAPI?.openFilePath) {
          await window.moztroAPI.openFilePath(entry.path);
        }
      }
    });
  }

  // Copy selected file paths or clipboard text to clipboard
  if (btnCopySelected) {
    btnCopySelected.addEventListener('click', async () => {
      const selectedEntries = transferLog.filter(e => selectedLogIds.has(e.id));
      const itemsToCopy = [];
      for (const entry of selectedEntries) {
        if (entry.fullText) {
          itemsToCopy.push(entry.fullText);
        } else if (entry.path) {
          itemsToCopy.push(entry.path);
        } else if (entry.name) {
          itemsToCopy.push(entry.name);
        }
      }
      if (itemsToCopy.length > 0 && window.moztroAPI?.setClipboardText) {
        await window.moztroAPI.setClipboardText(itemsToCopy.join('\r\n'));
        const originalText = btnCopySelected.textContent;
        btnCopySelected.textContent = 'Copied!';
        setTimeout(() => {
          btnCopySelected.textContent = originalText;
        }, 1200);
      }
    });
  }

  // Delete selected items from history (and physical files if configured)
  if (btnDeleteSelected) {
    btnDeleteSelected.addEventListener('click', async () => {
      const idsToRemove = new Set(selectedLogIds);
      if (idsToRemove.size === 0) return;

      const itemsToDelete = transferLog.filter(e => idsToRemove.has(e.id)).map(e => ({
        name: e.name,
        path: e.path || ''
      }));

      // Delete physical files if deleteFileOnClearHistory setting is enabled
      if (deleteFileOnClearHistory && window.moztroAPI?.deleteTransferFiles) {
        try {
          await window.moztroAPI.deleteTransferFiles(itemsToDelete);
        } catch (err) {
          console.warn('Could not delete files:', err);
        }
      }

      transferLog = transferLog.filter(e => !idsToRemove.has(e.id));
      selectedLogIds.clear();
      isSelectMode = false;
      saveTransferLogsToStorage();
      hideActiveProgress();
      updateSelectionHeader();
      renderTransferLog();
    });
  }

  // Cancel selection mode
  if (btnCancelSelect) {
    btnCancelSelect.addEventListener('click', () => {
      toggleSelectMode(false);
    });
  }

  // ─── Auto-Update Listeners & Handlers ───────────────────────────────────────
  if (window.moztroAPI?.onUpdateDownloadProgress) {
    window.moztroAPI.onUpdateDownloadProgress((data) => {
      if (updateProgressText) {
        updateProgressText.textContent = `Downloading update... ${data.percent}%`;
        updateProgressText.classList.remove('hidden');
      }
      if (btnInstallUpdate) {
        btnInstallUpdate.classList.add('hidden');
      }
    });
  }

  if (window.moztroAPI?.onUpdateDownloadComplete) {
    window.moztroAPI.onUpdateDownloadComplete((data) => {
      if (updateProgressText) {
        updateProgressText.classList.add('hidden');
      }
      if (btnInstallUpdate) {
        btnInstallUpdate.textContent = `Install Update (${data.versionLabel})`;
        btnInstallUpdate.classList.remove('hidden');
      }
    });
  }

  if (btnInstallUpdate) {
    btnInstallUpdate.addEventListener('click', async () => {
      btnInstallUpdate.disabled = true;
      btnInstallUpdate.textContent = 'Restarting...';
      try {
        if (window.moztroAPI?.installUpdate) {
          const res = await window.moztroAPI.installUpdate();
          if (res && !res.success) {
            console.warn('Install update failed:', res.error);
            btnInstallUpdate.disabled = false;
            btnInstallUpdate.textContent = 'Install Update';
          }
        }
      } catch (err) {
        console.error('Error invoking installUpdate:', err);
        btnInstallUpdate.disabled = false;
        btnInstallUpdate.textContent = 'Install Update';
      }
    });
  }

  // Trigger Silent Auto-Update Check on startup
  if (window.moztroAPI?.checkForUpdates) {
    setTimeout(() => {
      window.moztroAPI.checkForUpdates().catch(e => {
        console.warn('Initial update check error:', e);
      });
    }, 2500);
  }


  // Send File button (in left column)
  if (btnSendFilePcMain) {
    btnSendFilePcMain.addEventListener('click', async () => {
      if (window.moztroAPI?.selectFiles) {
        const files = await window.moztroAPI.selectFiles();
        if (files && files.length > 0) {
          await handleSendFiles(files);
        }
      }
    });
  }

  // Global Ctrl + V Handler for Image / Clipboard
  window.addEventListener('paste', async (e) => {
    // If user is pasting into an input, let default behavior happen
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }
    showSendFileView();
    await checkAndShowClipboardImage();
  });

  // Send Clipboard (PC -> HP)
  if (btnSendClipboardPc) {
    btnSendClipboardPc.addEventListener('click', async () => {
      // 1. Check if clipboard has image
      const hasImage = await checkAndShowClipboardImage();
      if (hasImage) return;

      // 2. If no image, check and send clipboard text
      if (window.moztroAPI?.getClipboardText) {
        const text = await window.moztroAPI.getClipboardText();
        const sub = btnSendClipboardPc.querySelector('.action-btn-sub');
        if (text && text.trim().length > 0) {
          await window.moztroAPI.sendClipboardToPhone(text, currentSelectedDevice?.deviceId);
          if (sub) {
            const originalText = sub.textContent;
            sub.textContent = 'Sent text to HP ✓';
            setTimeout(() => { sub.textContent = originalText; }, 1800);
          }
        } else {
          if (sub) {
            const originalText = sub.textContent;
            sub.textContent = 'Clipboard is empty!';
            setTimeout(() => { sub.textContent = originalText; }, 1800);
          }
        }
      }
    });
  }

  // Paste Clipboard (HP -> PC)
  if (btnPasteClipboardPc) {
    btnPasteClipboardPc.addEventListener('click', async () => {
      const sub = btnPasteClipboardPc.querySelector('.action-btn-sub');
      if (sub) {
        sub.textContent = 'Pulling from HP...';
      }
      if (window.moztroAPI?.requestPhoneClipboard) {
        await window.moztroAPI.requestPhoneClipboard(currentSelectedDevice?.deviceId);
      }
    });
  }

  if (btnSettings) {
    btnSettings.addEventListener('click', showSettingsView);
  }

  if (btnAbout) {
    btnAbout.addEventListener('click', showAboutView);
  }

  if (aboutInstagramLink) {
    aboutInstagramLink.addEventListener('click', async () => {
      const url = 'https://instagram.com/measureofsuccess.official';
      if (window.moztroAPI?.openExternalUrl) {
        await window.moztroAPI.openExternalUrl(url);
      } else {
        window.open(url, '_blank');
      }
    });
  }

  if (aboutEmailLink) {
    aboutEmailLink.addEventListener('click', async () => {
      const email = 'measureofsuccess.official@gmail.com';
      try {
        if (window.moztroAPI?.setClipboardText) {
          await window.moztroAPI.setClipboardText(email);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(email);
        }
      } catch (_) {}

      // Open mail client
      const mailtoUrl = `mailto:${email}`;
      if (window.moztroAPI?.openExternalUrl) {
        await window.moztroAPI.openExternalUrl(mailtoUrl);
      } else {
        window.open(mailtoUrl, '_blank');
      }
    });
  }

  if (brandLogo) {
    brandLogo.addEventListener('click', showHomeView);
  }

  // Devices Rendering in Home View
  function renderDevices(devices) {
    const activeList = devices || [];

    // If currently viewing a device, check if it's still connected
    if (currentSelectedDevice) {
      const stillConnected = activeList.some(d => d.deviceId === currentSelectedDevice.deviceId && d.isConnected);
      if (!stillConnected) {
        showHomeView();
      }
    }

    if (activeList.length === 0) {
      if (emptyDeviceText) emptyDeviceText.classList.remove('hidden');
      if (devicesList) {
        devicesList.classList.add('hidden');
        devicesList.innerHTML = '';
      }
      return;
    }

    if (emptyDeviceText) emptyDeviceText.classList.add('hidden');
    if (devicesList) {
      devicesList.classList.remove('hidden');
      devicesList.innerHTML = '';

      activeList.forEach((dev) => {
        const row = document.createElement('div');
        const isConn = !!dev.isConnected;
        const statusText = isConn ? 'Connected' : 'Not Connected';
        const statusClass = isConn ? 'connected' : 'disconnected';

        row.className = `device-row ${isConn ? 'clickable' : ''}`;
        row.innerHTML = `
          <div class="device-left">
            <img src="smartphone.png" alt="Device" class="device-icon">
            <span class="device-name">${escapeHtml(dev.deviceName || 'Android Device')}</span>
          </div>
          <span class="device-status ${statusClass}">${statusText}</span>
        `;

        // Only allow clicking to next page if device is connected
        if (isConn) {
          row.addEventListener('click', () => {
            showDeviceView(dev);
          });
        }

        devicesList.appendChild(row);
      });
    }
  }

  // Load and Bind Settings
  async function initSettings() {
    try {
      if (window.moztroAPI?.getMinimizeToTray && trayToggle) {
        const isTrayEnabled = await window.moztroAPI.getMinimizeToTray();
        trayToggle.checked = !!isTrayEnabled;
      }
      if (window.moztroAPI?.getAutoStart && autoStartToggle) {
        const isAutoStartEnabled = await window.moztroAPI.getAutoStart();
        autoStartToggle.checked = !!isAutoStartEnabled;
      }
      if (window.moztroAPI?.getFileSaveDirectory && selectedDirPath) {
        const dir = await window.moztroAPI.getFileSaveDirectory();
        selectedDirPath.textContent = dir || 'Documents';
      }
      if (window.moztroAPI?.getDeleteFileOnClearHistory && deleteFileOnClearToggle) {
        deleteFileOnClearHistory = await window.moztroAPI.getDeleteFileOnClearHistory();
        deleteFileOnClearToggle.checked = !!deleteFileOnClearHistory;
      }
    } catch (e) {
      console.warn('Could not load settings:', e);
    }

    if (trayToggle) {
      trayToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        if (window.moztroAPI?.setMinimizeToTray) {
          await window.moztroAPI.setMinimizeToTray(enabled);
        }
      });
    }

    if (autoStartToggle) {
      autoStartToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        if (window.moztroAPI?.setAutoStart) {
          await window.moztroAPI.setAutoStart(enabled);
        }
      });
    }

    if (deleteFileOnClearToggle) {
      deleteFileOnClearToggle.addEventListener('change', async (e) => {
        deleteFileOnClearHistory = e.target.checked;
        if (window.moztroAPI?.setDeleteFileOnClearHistory) {
          await window.moztroAPI.setDeleteFileOnClearHistory(deleteFileOnClearHistory);
        }
      });
    }

    if (btnChangeDir) {
      btnChangeDir.addEventListener('click', async () => {
        if (window.moztroAPI?.selectFileSaveDirectory) {
          const newDir = await window.moztroAPI.selectFileSaveDirectory();
          if (newDir && selectedDirPath) {
            selectedDirPath.textContent = newDir;
          }
        }
      });
    }
  }

  await initSettings();

  // Pairing Modal Handling
  function showPairingRequest(req) {
    if (!req || !req.deviceId) return;
    currentPendingDeviceId = req.deviceId;

    const dName = req.deviceName || 'Android Device';
    const dIp = req.ip || '';

    if (reqDeviceName) reqDeviceName.textContent = dName;
    if (reqDeviceIp) reqDeviceIp.textContent = dIp ? `(${dIp})` : '';
    if (pairingModal) pairingModal.classList.remove('hidden');
  }

  function hidePairingRequest() {
    if (pairingModal) pairingModal.classList.add('hidden');
    currentPendingDeviceId = null;
  }

  async function approveCurrentPairing() {
    if (currentPendingDeviceId) {
      const devId = currentPendingDeviceId;
      hidePairingRequest();
      if (window.moztroAPI?.approvePairing) {
        await window.moztroAPI.approvePairing(devId);
      }
      await refreshServerInfo();
    }
  }

  async function rejectCurrentPairing() {
    if (currentPendingDeviceId) {
      const devId = currentPendingDeviceId;
      hidePairingRequest();
      if (window.moztroAPI?.rejectPairing) {
        await window.moztroAPI.rejectPairing(devId);
      }
      await refreshServerInfo();
    }
  }

  if (btnApprovePair) btnApprovePair.addEventListener('click', approveCurrentPairing);
  if (btnRejectPair) btnRejectPair.addEventListener('click', rejectCurrentPairing);

  async function refreshServerInfo() {
    try {
      if (!window.moztroAPI?.getServerInfo) return;
      const info = await window.moztroAPI.getServerInfo();
      if (serverInfoText) {
        serverInfoText.textContent = `${info.ip || '127.0.0.1'}:${info.wsPort || 8765}`;
      }

      renderDevices(info.detectedDevices);

      if (info.pendingPairings && info.pendingPairings.length > 0) {
        showPairingRequest(info.pendingPairings[0]);
      } else if (!currentPendingDeviceId) {
        hidePairingRequest();
      }

      if (modalSelectDevice && !modalSelectDevice.classList.contains('hidden')) {
        await populateModalDevices();
      }
    } catch (err) {
      console.error('Failed to get server info:', err);
    }
  }

  // Initial load
  await refreshServerInfo();
  renderTransferLog();

  // Listen to IPC events for instant UI reactivity
  if (window.moztroAPI) {
    window.moztroAPI.onPairingRequest((req) => {
      showPairingRequest(req);
    });

    window.moztroAPI.onDeviceDetected(() => {
      refreshServerInfo();
    });

    window.moztroAPI.onDeviceUndetected(() => {
      refreshServerInfo();
    });

    window.moztroAPI.onDeviceConnected(() => {
      hidePairingRequest();
      refreshServerInfo();
    });

    window.moztroAPI.onDeviceDisconnected(() => {
      refreshServerInfo();
    });

    window.moztroAPI.onPingReceived((data) => {
      if (data && typeof data.rtt === 'number') {
        const rtt = Math.round(data.rtt);
        if (pingValue) pingValue.textContent = `${rtt} ms`;
        pingHistory.push(rtt);
        if (pingHistory.length > 20) pingHistory.shift();
        drawPingSparkline();
      }
    });

    window.moztroAPI.onFileTransferProgress((data) => {
      if (!data || !data.transferId) return;
      const id = data.transferId;
      const progress = typeof data.progress === 'number' ? data.progress : 0;
      const speed = data.speedFormatted || '';
      const status = data.status || 'UPLOADING';
      const direction = data.direction || 'up';
      const fileName = data.fileName || '';

      let logEntry = transferLog.find(e => e.id === id);
      if (!logEntry) {
        logEntry = {
          id: id,
          name: fileName || (direction === 'down' ? 'Incoming file' : 'File'),
          direction: direction,
          status: status === 'COMPLETE' ? 'COMPLETE' : 'SENDING',
          speed: speed
        };
        addTransferLogEntry(logEntry);
      } else if (fileName && logEntry.name === 'Incoming file') {
        logEntry.name = fileName;
      }

      if (status === 'COMPLETE') {
        updateTransferLogEntry(id, {
          name: fileName || logEntry.name,
          status: 'COMPLETE',
          speed: speed || 'Complete',
          ...(data.path ? { path: data.path } : (logEntry.path ? { path: logEntry.path } : {}))
        });
        if (activeTransferId === id) hideActiveProgress();
      } else if (status === 'FAILED') {
        updateTransferLogEntry(id, {
          status: 'FAILED',
          speed: speed || 'Failed'
        });
        if (activeTransferId === id) hideActiveProgress();
      } else if (status === 'CANCELLED') {
        updateTransferLogEntry(id, {
          status: 'CANCELLED',
          speed: speed || 'Cancelled'
        });
        if (activeTransferId === id) hideActiveProgress();
      } else {
        // Still in-flight (uploading or downloading)
        updateTransferLogEntry(id, { speed: speed });
        showActiveProgress(id, logEntry.name, logEntry.direction, progress, speed);
      }
    });

    window.moztroAPI.onClipboardReceived((data) => {
      // Add to transfer log as incoming clipboard (direction: down)
      const text = data?.text || '';
      const preview = text.length > 40 ? text.slice(0, 40) + '...' : text;
      addTransferLogEntry({
        id: 'clip_' + Date.now(),
        name: preview || '(clipboard)',
        direction: 'down',
        status: 'RECEIVED',
        speed: 'Clipboard',
        fullText: text
      });

      if (btnPasteClipboardPc) {
        const sub = btnPasteClipboardPc.querySelector('.action-btn-sub');
        if (sub) {
          sub.textContent = 'Copied from HP ✓';
          setTimeout(() => { sub.textContent = 'HP → PC ↓'; }, 2000);
        }
      }
    });

    window.moztroAPI.onOpenAndSendFiles(async (files) => {
      if (files && files.length > 0) {
        showSendFileView();
        await showDeviceSelectModal(files);
      }
    });

    // ─── Overdrive Screen Capture & Streaming Engine ───────────────────────────
    class OverdriveStreamer {
      constructor() {
        this.activeStream = null;
        this.videoEl = document.createElement('video');
        this.videoEl.muted = true;
        this.videoEl.autoplay = true;
        this.videoEl.playsInline = true;
        this.videoEl.style.position = 'fixed';
        this.videoEl.style.top = '-9999px';
        this.videoEl.style.left = '-9999px';
        this.videoEl.style.width = '1px';
        this.videoEl.style.height = '1px';
        this.videoEl.style.opacity = '0';
        this.videoEl.style.pointerEvents = 'none';
        document.body.appendChild(this.videoEl);

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        this.activeDeviceId = null;
        this.currentSourceId = null;
        this.currentQuality = 'BALANCED';
        this.audioEnabled = true;
        this.isStreaming = false;
        this.isCapturingFrame = false;
        this.timer = null;
        this.audioContext = null;
        this.audioProcessor = null;
        this.audioSource = null;
      }

      async start(deviceId, sourceId, quality = 'BALANCED', audioEnabled = true) {
        this.stop();
        this.activeDeviceId = deviceId;
        this.currentSourceId = sourceId;
        this.currentQuality = quality;
        this.audioEnabled = audioEnabled;

        let maxWidth = 1280;
        let maxHeight = 720;
        let frameRate = 30;
        let jpegQuality = 0.75;
        let frameInterval = 33; // ~30 fps

        if (quality === 'HIGH') {
          maxWidth = 1920;
          maxHeight = 1080;
          frameRate = 45;
          jpegQuality = 0.85;
          frameInterval = 22; // ~45 fps
        } else if (quality === 'FAST') {
          maxWidth = 960;
          maxHeight = 540;
          frameRate = 35;
          jpegQuality = 0.60;
          frameInterval = 28; // ~35 fps
        }

        try {
          let targetSourceId = sourceId;
          const sources = await window.moztroAPI?.getScreenSources();
          if (!targetSourceId && sources && sources.length > 0) {
            targetSourceId = sources[0].id;
          }

          const videoConstraints = {
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: targetSourceId,
                maxWidth: maxWidth,
                maxHeight: maxHeight,
                maxFrameRate: frameRate
              }
            }
          };

          try {
            this.activeStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
          } catch (err1) {
            console.warn('Overdrive getUserMedia specific constraints failed, trying basic:', err1);
            try {
              this.activeStream = await navigator.mediaDevices.getUserMedia({
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: targetSourceId
                  }
                }
              });
            } catch (err2) {
              console.warn('Overdrive fallback to getDisplayMedia:', err2);
              this.activeStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
              });
            }
          }

          if (audioEnabled) {
            let audioTrack = null;
            // 1. Try loopback system audio capture via getDisplayMedia (triggers Electron loopback handler)
            try {
              const displayAudioStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
              });
              const aTracks = displayAudioStream.getAudioTracks();
              if (aTracks && aTracks.length > 0) {
                audioTrack = aTracks[0];
                // Stop dummy video track
                displayAudioStream.getVideoTracks().forEach(t => {
                  try { t.stop(); } catch (_) {}
                });
              }
            } catch (errLoopback) {
              console.warn('Loopback audio via getDisplayMedia failed:', errLoopback);
            }

            // 2. Fallback: capture active audio device / stereo mix / default audio via getUserMedia
            if (!audioTrack) {
              try {
                const micStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                  },
                  video: false
                });
                const aTracks = micStream.getAudioTracks();
                if (aTracks && aTracks.length > 0) {
                  audioTrack = aTracks[0];
                }
              } catch (errMic) {
                console.warn('Fallback audio capture failed:', errMic);
              }
            }

            if (audioTrack && this.activeStream) {
              this.activeStream.addTrack(audioTrack);
            }
          }

          this.videoEl.muted = true;
          this.videoEl.playsInline = true;
          this.videoEl.srcObject = this.activeStream;
          await this.videoEl.play();

          this.isStreaming = true;
          this.startAudioStreaming();
          this.startVideoStreaming(maxWidth, maxHeight, jpegQuality, frameInterval);

          const videoTrack = this.activeStream.getVideoTracks()[0];
          const settings = videoTrack?.getSettings() || {};
          window.moztroAPI?.sendOverdriveJson(deviceId, {
            type: 'OVERDRIVE_STREAM_STARTED',
            width: settings.width || maxWidth,
            height: settings.height || maxHeight,
            sourceId: targetSourceId
          });
        } catch (err) {
          console.error('Failed to start Overdrive screen capture:', err);
          window.moztroAPI?.sendOverdriveJson(deviceId, {
            type: 'OVERDRIVE_STREAM_ERROR',
            error: err.message
          });
          this.stop();
        }
      }

      startAudioStreaming() {
        if (!this.audioEnabled || !this.activeStream) return;
        const audioTrack = this.activeStream.getAudioTracks()[0];
        if (!audioTrack) {
          console.warn('[Overdrive] No audio track available for streaming');
          return;
        }

        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          this.audioContext = new AudioContextClass({ sampleRate: 16000 });

          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(e => console.warn('AudioContext resume failed:', e));
          }

          this.audioSource = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
          this.audioProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

          this.audioProcessor.onaudioprocess = (e) => {
            if (!this.isStreaming || !this.activeDeviceId) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            const buffer = new Uint8Array(1 + pcm16.buffer.byteLength);
            buffer[0] = 0x02; // Header byte for PCM Audio
            buffer.set(new Uint8Array(pcm16.buffer), 1);
            window.moztroAPI?.sendOverdriveFrame(this.activeDeviceId, buffer);
          };

          this.audioSource.connect(this.audioProcessor);
          this.audioProcessor.connect(this.audioContext.destination);
        } catch (e) {
          console.warn('Audio streaming setup error:', e);
        }
      }

      startVideoStreaming(targetWidth, targetHeight, jpegQuality, frameInterval) {
        const captureFrame = () => {
          if (!this.isStreaming || !this.activeDeviceId) return;

          if (this.videoEl.videoWidth > 0 && this.videoEl.videoHeight > 0) {
            if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
              this.canvas.width = targetWidth;
              this.canvas.height = targetHeight;
            }

            if (!this.isCapturingFrame) {
              this.isCapturingFrame = true;
              this.ctx.drawImage(this.videoEl, 0, 0, targetWidth, targetHeight);

              this.canvas.toBlob((blob) => {
                if (!blob || !this.isStreaming || !this.activeDeviceId) {
                  this.isCapturingFrame = false;
                  return;
                }

                blob.arrayBuffer().then((buf) => {
                  this.isCapturingFrame = false;
                  const frameArray = new Uint8Array(1 + buf.byteLength);
                  frameArray[0] = 0x01; // Header byte for JPEG Video Frame
                  frameArray.set(new Uint8Array(buf), 1);
                  window.moztroAPI?.sendOverdriveFrame(this.activeDeviceId, frameArray);
                }).catch(() => {
                  this.isCapturingFrame = false;
                });
              }, 'image/jpeg', jpegQuality);
            }
          }

          if (this.isStreaming) {
            this.timer = setTimeout(captureFrame, frameInterval);
          }
        };

        captureFrame();
      }

      stop() {
        this.isStreaming = false;
        this.isCapturingFrame = false;
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        if (this.audioProcessor) {
          try { this.audioProcessor.disconnect(); } catch (_) {}
          this.audioProcessor = null;
        }
        if (this.audioSource) {
          try { this.audioSource.disconnect(); } catch (_) {}
          this.audioSource = null;
        }
        if (this.audioContext) {
          try { this.audioContext.close(); } catch (_) {}
          this.audioContext = null;
        }
        if (this.activeStream) {
          this.activeStream.getTracks().forEach(t => t.stop());
          this.activeStream = null;
        }
        this.videoEl.srcObject = null;
        this.activeDeviceId = null;
      }
    }

    // Dedicated Independent Audio Engine — streams PC audio continuously regardless of video engine
    class OverdriveAudioEngine {
      constructor() {
        this.activeDeviceId = null;
        this.audioContext = null;
        this.audioSource = null;
        this.audioProcessor = null;
        this.audioStream = null;
        this.isRunning = false;
      }

      async start(deviceId) {
        this.stop();
        this.activeDeviceId = deviceId;
        this.isRunning = true;

        try {
          let audioTrack = null;

          // 1. Try loopback system audio capture via getDisplayMedia (triggers Electron session loopback handler)
          try {
            const displayAudioStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true
            });
            const aTracks = displayAudioStream.getAudioTracks();
            if (aTracks && aTracks.length > 0) {
              audioTrack = aTracks[0];
              // Stop dummy video track so it uses zero GPU/CPU
              displayAudioStream.getVideoTracks().forEach(t => {
                try { t.stop(); } catch (_) {}
              });
              this.audioStream = displayAudioStream;
            }
          } catch (errLoopback) {
            console.warn('[OverdriveAudio] Loopback audio getDisplayMedia failed, falling back:', errLoopback);
          }

          // 2. Fallback: capture active audio device / stereo mix / default audio via getUserMedia
          if (!audioTrack) {
            try {
              const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false
                },
                video: false
              });
              const aTracks = micStream.getAudioTracks();
              if (aTracks && aTracks.length > 0) {
                audioTrack = aTracks[0];
                this.audioStream = micStream;
              }
            } catch (errMic) {
              console.warn('[OverdriveAudio] Fallback mic getUserMedia failed:', errMic);
            }
          }

          if (!audioTrack) {
            console.warn('[OverdriveAudio] No audio track available for streaming');
            return;
          }

          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          this.audioContext = new AudioContextClass({ sampleRate: 16000 });

          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume().catch(e => console.warn('AudioContext resume failed:', e));
          }

          this.audioSource = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
          this.audioProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);

          this.audioProcessor.onaudioprocess = (e) => {
            if (!this.isRunning || !this.activeDeviceId) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            const buffer = new Uint8Array(1 + pcm16.buffer.byteLength);
            buffer[0] = 0x02; // Header byte for PCM Audio
            buffer.set(new Uint8Array(pcm16.buffer), 1);
            window.moztroAPI?.sendOverdriveFrame(this.activeDeviceId, buffer);
          };

          this.audioSource.connect(this.audioProcessor);
          this.audioProcessor.connect(this.audioContext.destination);
          console.log('[OverdriveAudio] Audio streaming active for device:', deviceId);
        } catch (e) {
          console.warn('[OverdriveAudio] Audio engine start error:', e);
        }
      }

      stop() {
        this.isRunning = false;
        this.activeDeviceId = null;
        if (this.audioProcessor) {
          try { this.audioProcessor.disconnect(); } catch (_) {}
          this.audioProcessor = null;
        }
        if (this.audioSource) {
          try { this.audioSource.disconnect(); } catch (_) {}
          this.audioSource = null;
        }
        if (this.audioContext) {
          try { this.audioContext.close(); } catch (_) {}
          this.audioContext = null;
        }
        if (this.audioStream) {
          try {
            this.audioStream.getTracks().forEach(t => t.stop());
          } catch (_) {}
          this.audioStream = null;
        }
      }
    }

    const overdriveStreamer = new OverdriveStreamer();
    const overdriveAudioEngine = new OverdriveAudioEngine();

    if (window.moztroAPI?.onRequestScreenSources) {
      window.moztroAPI.onRequestScreenSources(async ({ deviceId }) => {
        const sources = await window.moztroAPI.getScreenSources();
        window.moztroAPI.sendOverdriveJson(deviceId, {
          type: 'SCREEN_SOURCES_RESPONSE',
          sources: sources || []
        });
      });
    }

    // --- Dual-Engine Overdrive Sync ---
    // Main Process (desktopCapturer) = primary video engine
    // Renderer (getUserMedia WebRTC) = video fallback if Main Process has no frames for 3s
    let rendererFallbackTimer = null;
    let rendererIsActive = false;
    let pendingStreamParams = null; // Store params for fallback use

    function clearFallbackTimer() {
      if (rendererFallbackTimer) {
        clearTimeout(rendererFallbackTimer);
        rendererFallbackTimer = null;
      }
    }

    function scheduleFallback(deviceId, sourceId, quality, audioEnabled) {
      clearFallbackTimer();
      rendererFallbackTimer = setTimeout(async () => {
        if (!rendererIsActive) {
          console.log('[Overdrive] Main Process has no frames, activating renderer video fallback...');
          rendererIsActive = true;
          await overdriveStreamer.start(deviceId, sourceId, quality, audioEnabled);
        }
      }, 3000); // 3s grace period for Main Process
    }

    if (window.moztroAPI?.onStartOverdriveStream) {
      window.moztroAPI.onStartOverdriveStream(async ({ deviceId, sourceId, quality, audioEnabled }) => {
        // Start independent audio streaming immediately if audio is enabled
        if (audioEnabled !== false) {
          overdriveAudioEngine.start(deviceId);
        } else {
          overdriveAudioEngine.stop();
        }

        // Store params for video fallback
        pendingStreamParams = { deviceId, sourceId, quality, audioEnabled };
        rendererIsActive = false;
        // Schedule fallback — Main Process should send video frames within 3s
        scheduleFallback(deviceId, sourceId, quality, audioEnabled);
      });
    }

    if (window.moztroAPI?.onStopOverdriveStream) {
      window.moztroAPI.onStopOverdriveStream(({ deviceId }) => {
        overdriveAudioEngine.stop();
        clearFallbackTimer();
        rendererIsActive = false;
        pendingStreamParams = null;
        if (overdriveStreamer.activeDeviceId === deviceId) {
          overdriveStreamer.stop();
        }
      });
    }

    if (window.moztroAPI?.onChangeOverdriveMonitor) {
      window.moztroAPI.onChangeOverdriveMonitor(async ({ deviceId, sourceId }) => {
        if (pendingStreamParams) {
          pendingStreamParams.sourceId = sourceId;
        }
        if (overdriveStreamer.activeDeviceId === deviceId) {
          await overdriveStreamer.start(deviceId, sourceId, overdriveStreamer.currentQuality, overdriveStreamer.audioEnabled);
        }
      });
    }

    // Listen to Main Process engine health — stop renderer if Main is active, activate if Main fails
    if (window.moztroAPI?.onOverdriveEngineStatus) {
      window.moztroAPI.onOverdriveEngineStatus(({ mainActive }) => {
        if (mainActive) {
          // Main Process is sending frames — stop renderer fallback if running
          clearFallbackTimer();
          if (rendererIsActive && overdriveStreamer.isStreaming) {
            console.log('[Overdrive] Main Process recovered, stopping renderer fallback.');
            overdriveStreamer.stop();
            rendererIsActive = false;
          }
        } else {
          // Main Process is not active — trigger fallback if we have params and renderer not running
          if (pendingStreamParams && !rendererIsActive && !overdriveStreamer.isStreaming) {
            const { deviceId, sourceId, quality, audioEnabled } = pendingStreamParams;
            scheduleFallback(deviceId, sourceId, quality, audioEnabled);
          }
        }
      });
    }
  }

  // Periodic refresh every 1.5s
  setInterval(refreshServerInfo, 1500);
});
