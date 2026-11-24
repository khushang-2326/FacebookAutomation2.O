'use strict';
const net = require('net');
const { Logger } = require('../utils/logger');

const logger = new Logger('ZmqClient');

/**
 * Builds standard ZMTP 3.0 greeting frame (64 bytes)
 */
function buildGreeting() {
  const buf = Buffer.alloc(64);
  buf[0] = 0xFF;
  buf.writeBigUInt64BE(1n, 1);
  buf[9] = 0x7F;
  buf[10] = 3; // version major
  buf[11] = 0; // version minor
  buf.write('NULL', 12, 4, 'ascii'); // mechanism: NULL
  // bytes 32..63 are 0x00 padding
  return buf;
}

/**
 * Builds standard ZMTP 3.0 READY command frame with REQ socket-type
 */
function buildReadyCommand() {
  const propName = Buffer.from('Socket-Type', 'ascii');
  const propVal = Buffer.from('REQ', 'ascii');
  const body = Buffer.concat([
    Buffer.from([5]), Buffer.from('READY', 'ascii'),
    Buffer.from([propName.length]), propName,
    Buffer.alloc(4),
    propVal
  ]);
  body.writeUInt32BE(propVal.length, 1 + 5 + 1 + propName.length);
  return Buffer.concat([Buffer.from([0x04, body.length]), body]);
}

/**
 * Builds standard ZMTP 3.0 REQ message frame
 * Frame 1: empty delimiter (flag 0x01)
 * Frame 2: payload (flag 0x00)
 */
function buildMessage(cmdText) {
  const data = Buffer.from(cmdText, 'utf8');
  const f1 = Buffer.from([0x01, 0x00]);
  let f2;
  if (data.length < 256) {
    f2 = Buffer.concat([Buffer.from([0x00, data.length]), data]);
  } else {
    const header = Buffer.alloc(9);
    header[0] = 0x02;
    header.writeBigUInt64BE(BigInt(data.length), 1);
    f2 = Buffer.concat([header, data]);
  }
  return Buffer.concat([f1, f2]);
}

/**
 * Persistent ZeroMQ client for communicating with FFmpeg's zmq filter
 * over a local TCP port to perform in-place filtergraph adjustments without restarting.
 */
class ZmqClient {
  constructor(port) {
    this.port = port;
    this.socket = null;
    this.isReady = false;
    this.isConnecting = false;
    this.currentResolver = null;
    this.connectPromise = null;
  }

  /**
   * Connects to FFmpeg's ZMQ broker socket on 127.0.0.1:port
   */
  async connect(timeoutMs = 4000) {
    if (this.isReady && this.socket && !this.socket.destroyed) {
      return true;
    }
    if (this.isConnecting && this.connectPromise) {
      return this.connectPromise;
    }

    this.isConnecting = true;
    const startTime = Date.now();

    const trySingleConnect = () => {
      return new Promise((resolve, reject) => {
        let step = 0;
        let buf = Buffer.alloc(0);
        let settled = false;

        const attemptTimeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { this.socket?.destroy(); } catch (_) {}
          reject(new Error(`ZMQ single attempt timeout on port ${this.port}`));
        }, Math.min(2000, timeoutMs));

        this.socket = net.createConnection({ host: '127.0.0.1', port: this.port }, () => {
          this.socket.write(buildGreeting());
        });

        this.socket.on('data', (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          if (step === 0 && buf.length >= 64) {
            buf = buf.slice(64);
            step = 1;
            this.socket.write(buildReadyCommand());
          }
          if (step === 1 && buf.length > 0) {
            step = 2;
            this.isReady = true;
            this.isConnecting = false;
            clearTimeout(attemptTimeout);
            buf = Buffer.alloc(0);
            if (!settled) {
              settled = true;
              resolve(true);
            }
          } else if (step === 2 && buf.length > 0) {
            const res = buf.toString('utf8');
            buf = Buffer.alloc(0);
            if (this.currentResolver) {
              const r = this.currentResolver;
              this.currentResolver = null;
              const cleanReply = res.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
              const match = cleanReply.match(/^(-?\d+)\s*(.*)$/);
              if (match) {
                const code = parseInt(match[1], 10);
                if (code === 0) {
                  r({ success: true, code: 0, reply: cleanReply });
                } else {
                  r({ success: false, code, error: match[2] || `FFmpeg filter returned error code ${code}`, reply: cleanReply });
                }
              } else {
                const isErr = /error|failed|invalid|not implemented/i.test(cleanReply);
                r({ success: !isErr, reply: cleanReply, error: isErr ? cleanReply : null });
              }
            }
          }
        });

        this.socket.on('error', (err) => {
          this.isReady = false;
          clearTimeout(attemptTimeout);
          try { this.socket?.destroy(); } catch (_) {}
          if (!settled) {
            settled = true;
            reject(err);
          }
        });

        this.socket.on('close', () => {
          this.isReady = false;
        });
      });
    };

    this.connectPromise = (async () => {
      let lastErr = null;
      while (Date.now() - startTime < timeoutMs) {
        try {
          await trySingleConnect();
          this.isConnecting = false;
          return true;
        } catch (err) {
          lastErr = err;
          // If port is not yet listening (FFmpeg still initializing filtergraph), retry after small delay
          if (err.code === 'ECONNREFUSED' || err.message?.includes('timeout')) {
            await new Promise((r) => setTimeout(r, 200));
          } else {
            break;
          }
        }
      }
      this.isConnecting = false;
      throw new Error(`ZMQ connection failed on port ${this.port}: ${lastErr?.message || 'Timeout'}`);
    })();

    return this.connectPromise;
  }

  /**
   * Sends a command to a filter in the running FFmpeg graph
   * @param {string} filterName - e.g. Parsed_streamselect_8
   * @param {string} command - e.g. map
   * @param {string} args - e.g. 1
   */
  async sendCommand(filterName, command, args, timeoutMs = 2500) {
    if (!this.isReady) {
      try {
        await this.connect(timeoutMs);
      } catch (connErr) {
        return { success: false, error: `Failed to connect to ZMQ broker: ${connErr.message}` };
      }
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.currentResolver = null;
        resolve({ success: false, error: 'ZMQ command timeout' });
      }, timeoutMs);

      this.currentResolver = (res) => {
        clearTimeout(timer);
        resolve(res);
      };

      const fullCommand = `${filterName} ${command} ${args}`;
      try {
        this.socket.write(buildMessage(fullCommand));
      } catch (writeErr) {
        clearTimeout(timer);
        this.currentResolver = null;
        resolve({ success: false, error: writeErr.message });
      }
    });
  }

  /**
   * Closes the socket cleanly
   */
  close() {
    this.isReady = false;
    this.isConnecting = false;
    if (this.socket) {
      try {
        this.socket.end();
      } catch (_) {}
      try {
        this.socket.destroy();
      } catch (_) {}
      this.socket = null;
    }
  }
}

/**
 * Finds a free TCP port on 127.0.0.1
 */
function getFreeZmqPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

module.exports = {
  ZmqClient,
  getFreeZmqPort
};
