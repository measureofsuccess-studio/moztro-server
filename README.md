# Moztro Server (PC)

<div align="center">

![Moztro Logo](https://raw.githubusercontent.com/measureofsuccess-studio/moztro-server/main/src/renderer/icon.png)

**Universal PC-Android Seamless Bridge**  
*High-performance local wireless desktop companion and server engine.*

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/measureofsuccess-studio/moztro-server/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Electron-lightgrey.svg)](https://github.com/measureofsuccess-studio/moztro-server)
[![Organization](https://img.shields.io/badge/org-Measure%20of%20Success-black.svg)](https://github.com/measureofsuccess-studio)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[**Download Windows Installer (.exe)**](https://github.com/measureofsuccess-studio/moztro-server/releases/latest) • [**Android Client Repository 📱**](https://github.com/measureofsuccess-studio/moztro-client)

</div>

---

## 🚀 Overview

**Moztro Server** is the desktop companion application that empowers your Windows PC to connect seamlessly with your Android device over a local high-speed network without requiring internet access or cloud dependencies.

### 🌟 Key Capabilities

- 🖥️ **Overdrive Screen Streaming**: Real-time PC screen mirroring to Android with ultra-low latency, multi-monitor selection, and direct touch/trackpad input synchronization.
- ⚡ **Fast File Transfer**: Bidirectional, unlimited-size file and folder transfers powered by raw WebSocket and high-speed HTTP streams.
- 📁 **View On Device (VOD)**: Access, manage, and browse your Android storage directly from Windows File Explorer via high-performance embedded FTP.
- 🎮 **Remote Control & Power Suite**: Precision trackpad simulation, media controls, clipboard sync, remote keyboard input, and remote power actions (Shutdown, Restart, Lock).
- 🖱️ **Windows Explorer Integration**: Native "Send with Moztro" context menu on right-click for instant file sending.

---

## 📱 Ecosystem Companion

Moztro Server connects directly with the **Moztro Android Client**:
👉 [**Explore Moztro Client Repository (Android)**](https://github.com/measureofsuccess-studio/moztro-client)

---

## 📥 Installation

1. Download the latest **`Moztro Setup 1.0.0.exe`** from the [**Releases Page**](https://github.com/measureofsuccess-studio/moztro-server/releases/latest).
2. Run the setup wizard to install Moztro to your preferred directory.
3. Launch Moztro and connect with your Android device using the on-screen IP/port or automatic radar discovery.

---

## 🛠️ Development & Building

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- Windows 10/11 (x64)

### Clone & Run Locally
```bash
# Clone the repository
git clone https://github.com/measureofsuccess-studio/moztro-server.git
cd moztro-server

# Install dependencies
npm install

# Start development mode
npm run dev
```

### Build Production Installer
```bash
# Package Windows NSIS Installer (.exe)
npm run dist
```
The resulting installer will be generated in `dist/Moztro Setup 1.0.0.exe`.

---

## 👨‍💻 Developer & Creator

- **Developer**: Akbar Dwi Mulya
- **Organization**: [Measure of Success](https://github.com/measureofsuccess-studio)
- **Instagram**: [@measureofsuccess.official](https://instagram.com/measureofsuccess.official)
- **Email**: `measureofsuccess.official@gmail.com`

---

## 📄 License

Copyright © 2026 Akbar Dwi Mulya (Measure of Success). All rights reserved.
Licensed under the [MIT License](LICENSE).
