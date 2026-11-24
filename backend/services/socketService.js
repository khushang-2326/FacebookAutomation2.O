const { Server } = require('socket.io');
const ffmpegService = require('./ffmpegService');
const { Logger } = require('../utils/logger');

const logger = new Logger('SocketService');

class SocketService {
  constructor() {
    this.io = null;
  }

  init(server, corsOrigin) {
    this.io = new Server(server, {
      cors: {
        origin: corsOrigin || '*',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.io.on('connection', (socket) => {
      logger.debug(`Socket client connected: ${socket.id}`);

      // Client joins automation specific room
      socket.on('join:automation', (automationId) => {
        socket.join(`automation:${automationId}`);
        logger.debug(`Socket ${socket.id} joined room: automation:${automationId}`);
      });

      socket.on('leave:automation', (automationId) => {
        socket.leave(`automation:${automationId}`);
        logger.debug(`Socket ${socket.id} left room: automation:${automationId}`);
      });

      socket.on('disconnect', () => {
        logger.debug(`Socket client disconnected: ${socket.id}`);
      });
    });

    // Wire up FFmpeg service telemetry events to Socket.IO
    ffmpegService.on('metrics', (data) => {
      this.emitToAutomation(data.automationId, 'ffmpeg:metrics', data);
      this.emitGlobal('ffmpeg:metrics', data);
    });

    ffmpegService.on('processClosed', (data) => {
      this.emitToAutomation(data.automationId, 'ffmpeg:closed', data);
      this.emitGlobal('ffmpeg:closed', data);
    });

    logger.info('Socket.IO Hub initialized.');
  }

  emitToAutomation(automationId, event, data) {
    if (this.io && automationId) {
      this.io.to(`automation:${automationId}`).emit(event, data);
    }
  }

  emitGlobal(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  broadcast(event, data) {
    this.emitGlobal(event, data);
  }
}

module.exports = new SocketService();
