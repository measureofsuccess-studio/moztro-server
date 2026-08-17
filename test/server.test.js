const MoztroServer = require('../src/main/server');
const dgram = require('dgram');
const WebSocket = require('ws');
const assert = require('assert');

const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('--- Starting Moztro PC Server Automated Tests ---');

  const testWsPort = 8785;
  const testUdpPort = 8786;
  const tempStorage = path.join(__dirname, 'temp-test-paired.json');
  const server = new MoztroServer({ wsPort: testWsPort, udpPort: testUdpPort, storagePath: tempStorage });

  server.on('pairingRequest', (req) => {
    console.log(`[Test] Auto-approving pairing for: ${req.deviceName} (${req.deviceId})`);
    server.approvePairing(req.deviceId);
  });

  try {
    // 1. Start Server
    console.log('[Test 1] Starting Server on ports WS:', testWsPort, 'UDP:', testUdpPort);
    await server.start();
    assert.strictEqual(server.isRunning, true, 'Server should be running');
    console.log('✓ Server started successfully');

    // 2. Test UDP Discovery
    console.log('[Test 2] Testing UDP Auto-Discovery Broadcast...');
    await new Promise((resolve, reject) => {
      const clientUdp = dgram.createSocket('udp4');
      const timer = setTimeout(() => {
        clientUdp.close();
        reject(new Error('UDP Discovery timed out after 3000ms'));
      }, 3000);

      clientUdp.on('message', (msg) => {
        clearTimeout(timer);
        const data = JSON.parse(msg.toString());
        console.log('✓ UDP Response received:', data);
        assert.strictEqual(data.type, 'MOZTRO_SERVER_ANNOUNCE');
        assert.strictEqual(data.wsPort, testWsPort);
        clientUdp.close();
        resolve();
      });

      const req = Buffer.from('MOZTRO_DISCOVER');
      clientUdp.send(req, testUdpPort, '127.0.0.1', (err) => {
        if (err) {
          clearTimeout(timer);
          clientUdp.close();
          reject(err);
        }
      });
    });

    // 3. Test WebSocket Connection & Pairing Handshake
    console.log('[Test 3] Testing WebSocket Connection & Pairing Handshake...');
    const ws = new WebSocket(`ws://127.0.0.1:${testWsPort}`);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket pairing timed out'));
      }, 3000);

      ws.on('open', () => {
        console.log('WebSocket connected. Sending PAIR_REQUEST...');
        ws.send(JSON.stringify({
          type: 'PAIR_REQUEST',
          deviceId: 'test-device-12345',
          deviceName: 'Test Phone (Pixel 8)',
          manufacturer: 'Google',
          model: 'Pixel 8'
        }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'PAIR_RESPONSE') {
          clearTimeout(timer);
          console.log('✓ Pairing response received:', msg);
          assert.strictEqual(msg.status, 'ACCEPTED');
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // 4. Test Ping & Pong Latency Measurement
    console.log('[Test 4] Testing Ping & Pong Latency Measurement...');
    await new Promise((resolve, reject) => {
      const startTime = Date.now();
      const seq = 1;

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Ping/Pong timed out'));
      }, 3000);

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'PONG') {
          clearTimeout(timer);
          const rtt = Date.now() - startTime;
          console.log(`✓ PONG received for seq #${msg.seq}. RTT Latency: ${rtt}ms`);
          assert.strictEqual(msg.seq, seq);
          assert.strictEqual(msg.clientTimestamp, startTime);
          resolve();
        }
      });

      ws.send(JSON.stringify({
        type: 'PING',
        deviceId: 'test-device-12345',
        timestamp: startTime,
        seq: seq
      }));
    });

    ws.close();
    server.stop();
    try {
      if (fs.existsSync(tempStorage)) fs.unlinkSync(tempStorage);
    } catch (e) {}
    console.log('--- ALL TESTS PASSED SUCCESSFULLY (4/4) ---');
    process.exit(0);
  } catch (err) {
    console.error('Test Failed:', err);
    server.stop();
    try {
      if (fs.existsSync(tempStorage)) fs.unlinkSync(tempStorage);
    } catch (e) {}
    process.exit(1);
  }
}

runTests();
