const Log = require('../models/Log');

const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

class Logger {
  constructor(component = 'System') {
    this.component = component;
  }

  static getLogger(component) {
    return new Logger(component);
  }

  _formatMessage(level, message, metadata) {
    const timestamp = new Date().toISOString();
    const metaStr = metadata && Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.component}]: ${message}${metaStr}`;
  }

  async _persist(level, message, metadata = {}, automationId = null, broadcastId = null) {
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection && mongoose.connection.readyState === 1 && Log && Log.create) {
        await Log.create({
          level,
          component: this.component,
          message,
          metadata,
          automationId,
          broadcastId,
          timestamp: new Date()
        }).catch(() => {});
      }
    } catch (_) {}
  }

  debug(message, metadata) {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.log(this._formatMessage(LogLevel.DEBUG, message, metadata));
    }
  }

  info(message, metadata, automationId = null, broadcastId = null) {
    console.log(this._formatMessage(LogLevel.INFO, message, metadata));
    this._persist(LogLevel.INFO, message, metadata, automationId, broadcastId);
  }

  warn(message, metadata, automationId = null, broadcastId = null) {
    console.warn(this._formatMessage(LogLevel.WARN, message, metadata));
    this._persist(LogLevel.WARN, message, metadata, automationId, broadcastId);
  }

  error(message, metadata, automationId = null, broadcastId = null) {
    console.error(this._formatMessage(LogLevel.ERROR, message, metadata));
    this._persist(LogLevel.ERROR, message, metadata, automationId, broadcastId);
  }
}

module.exports = {
  Logger,
  LogLevel,
  logger: new Logger('System')
};
