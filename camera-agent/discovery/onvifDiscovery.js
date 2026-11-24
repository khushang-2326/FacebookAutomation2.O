const dgram = require('dgram');
const net = require('net');
const os = require('os');

class OnvifDiscovery {
  static async scanLocalNetwork(timeoutMs = 4000) {
    const discoveredMap = new Map();

    // 1. Multicast UDP WS-Discovery Probe
    const udpPromise = new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const msgId = 'urn:uuid:' + Date.now() + '-1';
      const probeWildcard = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/10/wsa" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">' +
        '<e:Header>' +
        '<w:MessageID>' + msgId + '</w:MessageID>' +
        '<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>' +
        '<w:Action a:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005:04:discovery/Probe</w:Action>' +
        '</e:Header>' +
        '<e:Body><d:Probe/></e:Body>' +
        '</e:Envelope>';

      socket.on('message', (msg, rinfo) => {
        const address = rinfo.address;
        if (!discoveredMap.has(address)) {
          discoveredMap.set(address, {
            ipAddress: address,
            port: 554,
            onvifPort: rinfo.port || 3702,
            manufacturer: 'ONVIF IP Camera',
            rawXAddrs: address,
            discoveredAt: new Date().toISOString()
          });
        }
      });

      socket.on('error', () => {
        try { socket.close(); } catch (_) {}
        resolve();
      });

      socket.bind(() => {
        try {
          socket.setBroadcast(true);
          const buf = Buffer.from(probeWildcard);
          socket.send(buf, 0, buf.length, 3702, '239.255.255.250');
        } catch (_) {}
      });

      setTimeout(() => {
        try { socket.close(); } catch (_) {}
        resolve();
      }, Math.min(timeoutMs, 2500));
    });

    // 2. Fast Parallel TCP Port Scanner across active IPv4 subnets
    const subnetPromise = OnvifDiscovery._scanSubnetRtspPorts(discoveredMap);
    await Promise.all([udpPromise, subnetPromise]);

    return Array.from(discoveredMap.values());
  }

  static async _scanSubnetRtspPorts(discoveredMap) {
    const interfaces = os.networkInterfaces();
    const targetSubnets = new Set();

    for (const name of Object.keys(interfaces)) {
      for (const netIf of interfaces[name]) {
        if (netIf.family === 'IPv4' && !netIf.internal) {
          const parts = netIf.address.split('.');
          if (parts.length === 4) {
            targetSubnets.add(parts[0] + '.' + parts[1] + '.' + parts[2]);
          }
        }
      }
    }

    const portsToTest = [554, 80, 8000, 8899];
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    for (const subnet of targetSubnets) {
      for (let i = 1; i <= 254; i += 30) {
        const batch = [];
        for (let j = 0; j < 30 && i + j <= 254; j++) {
          const ip = subnet + '.' + (i + j);
          batch.push(new Promise((resolve) => {
            let isResolved = false;
            let pendingPorts = portsToTest.length;
            const openSockets = [];

            const cleanup = () => {
              if (!isResolved) {
                isResolved = true;
                openSockets.forEach(s => { try { s.destroy(); } catch (_) {} });
                resolve();
              }
            };

            for (const port of portsToTest) {
              const client = new net.Socket();
              openSockets.push(client);
              client.setTimeout(1200);

              client.on('connect', () => {
                if (!discoveredMap.has(ip)) {
                  discoveredMap.set(ip, {
                    ipAddress: ip,
                    port: 554,
                    onvifPort: port,
                    manufacturer: ip === '192.168.1.1' ? 'Router / Gateway' : 'Physical IP Camera (RTSP)',
                    rawXAddrs: ip,
                    discoveredAt: new Date().toISOString()
                  });
                }
                cleanup();
              });

              client.on('error', () => {
                pendingPorts--;
                if (pendingPorts <= 0) cleanup();
              });

              client.on('timeout', () => {
                pendingPorts--;
                if (pendingPorts <= 0) cleanup();
              });

              client.connect(port, ip);
            }

            setTimeout(cleanup, 1300);
          }));
        }
        await Promise.all(batch);
        await delay(5);
      }
    }
  }
}

module.exports = OnvifDiscovery;
