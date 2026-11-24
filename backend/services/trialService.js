const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { Logger } = require('../utils/logger');

const logger = new Logger('TrialService');
const SECRET_SALT = 'TRIALEXE_HARD_EXPIRY_SALT_2026_11_29';
const TRIAL_DAYS = 30; // 30-day evaluation
const HARD_EXPIRY_DATE_DEFAULT = '2026-11-29T23:59:59.999+05:30'; // 30-Day Hard Absolute Cutoff (End of day Nov 29, 2026)
const HARD_EXPIRY_MS_DEFAULT = new Date(HARD_EXPIRY_DATE_DEFAULT).getTime();

class TrialService {
  constructor() {
    this._isTrial = false;
    this._trialDays = TRIAL_DAYS;
    this._hardExpiryDate = HARD_EXPIRY_DATE_DEFAULT;
    this._hardExpiryMs = HARD_EXPIRY_MS_DEFAULT;
    this._isExpired = false;
    this._activatedAt = null;
    this._expiresAt = HARD_EXPIRY_MS_DEFAULT;
    this._lastHeartbeat = null;
    this._isTampered = false;
    this._initialized = false;
    this._storagePaths = [];

    this._loadBuildConfig();
  }

  _loadBuildConfig() {
    this._hardExpiryDate = HARD_EXPIRY_DATE_DEFAULT;
    this._hardExpiryMs = HARD_EXPIRY_MS_DEFAULT;

    try {
      const configPath = path.join(__dirname, '../config/buildMode.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        this._isTrial = Boolean(parsed.isTrial);
        if (parsed.trialDays) {
          this._trialDays = Number(parsed.trialDays);
        }
        if (parsed.hardExpiryDate) {
          this._hardExpiryDate = parsed.hardExpiryDate;
          this._hardExpiryMs = new Date(parsed.hardExpiryDate).getTime();
        }
      }
    } catch (err) {
      logger.warn(`Could not load buildMode.json: ${err.message}`);
    }

    if (process.env.APP_TRIAL_MODE === '1' || process.env.APP_TRIAL_MODE === 'true') {
      this._isTrial = true;
    }
  }

  _getStoragePaths() {
    if (this._storagePaths.length > 0) return this._storagePaths;

    const paths = [];

    // Path 1: Electron user data folder
    const electronUserData = process.env.ELECTRON_USER_DATA;
    if (electronUserData) {
      paths.push(path.join(electronUserData, '.trialexe_30days.dat'));
    }

    // Path 2: Windows AppData Roaming
    const appData = process.env.APPDATA;
    if (appData) {
      const dir = path.join(appData, 'trialexe');
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
      paths.push(path.join(dir, '.trialexe_30days.dat'));
    }

    // Path 3: User Home directory (hidden file)
    try {
      const home = os.homedir();
      if (home) {
        paths.push(path.join(home, '.trialexe_30days.dat'));
      }
    } catch (_) {}

    // Path 4: Local app directory
    paths.push(path.join(process.cwd(), '.trialexe_runtime_30days.dat'));

    this._storagePaths = paths;
    return this._storagePaths;
  }

  _computeChecksum(activatedAt, expiresAt, tampered, expiredLocked) {
    return crypto
      .createHmac('sha256', SECRET_SALT)
      .update(`${activatedAt}:${expiresAt}:${tampered}:${expiredLocked}:${SECRET_SALT}`)
      .digest('hex');
  }

  _encryptData(obj) {
    const jsonStr = JSON.stringify(obj);
    const key = crypto.scryptSync(SECRET_SALT, 'trialsalt_2026_11_07', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  _decryptData(str) {
    try {
      const parts = str.split(':');
      if (parts.length !== 2) return null;
      const iv = Buffer.from(parts[0], 'hex');
      const key = crypto.scryptSync(SECRET_SALT, 'trialsalt_2026_11_07', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (_) {
      return null;
    }
  }

  _readLicense() {
    const paths = this._getStoragePaths();
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8').trim();
          const data = this._decryptData(content);
          if (data && data.activatedAt) {
            return { data, foundPath: p };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  _saveLicense(data) {
    const encrypted = this._encryptData(data);
    const paths = this._getStoragePaths();
    for (const p of paths) {
      try {
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, encrypted, 'utf8');
      } catch (_) {}
    }
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    if (!this._isTrial) {
      logger.info('Running in FULL LICENSED mode (non-trial, no time limits).');
      return;
    }

    logger.info(`Running in 30-DAY TRIAL mode (Hard Cutoff: 7-11-2026). Initializing trial license verification...`);

    const now = Date.now();

    // 1. ABSOLUTE HARD CUTOFF: If current time is on or after 7-11-2026, lock immediately
    if (this._hardExpiryMs && now >= this._hardExpiryMs) {
      this._isExpired = true;
      this._expiresAt = this._hardExpiryMs;
      logger.warn(`*** HARD TRIAL DEADLINE REACHED (7-11-2026)! Current: ${now} >= ${this._hardExpiryMs}. Application locked! ***`);
      return;
    }

    // Trial expires at the hard cutoff 7-11-2026
    this._expiresAt = this._hardExpiryMs || (now + (this._trialDays * 24 * 60 * 60 * 1000));

    const existing = this._readLicense();

    if (!existing) {
      // First time launch before 7-11-2026:
      this._activatedAt = now;
      this._lastHeartbeat = now;
      this._isTampered = false;
      this._isExpired = false;

      const checksum = this._computeChecksum(this._activatedAt, this._expiresAt, false, false);
      const data = {
        activatedAt: this._activatedAt,
        expiresAt: this._expiresAt,
        lastHeartbeat: this._lastHeartbeat,
        isTampered: false,
        expiredLocked: false,
        checksum
      };
      this._saveLicense(data);
      logger.info(`Initialized fresh trial! Valid until 7-11-2026 (${new Date(this._expiresAt).toISOString()})`);
    } else {
      const data = existing.data;

      // Check if previously locked after passing 7-11-2026
      if (data.expiredLocked || (data.lastHeartbeat && this._hardExpiryMs && data.lastHeartbeat >= this._hardExpiryMs)) {
        logger.warn('Trial was previously locked after reaching 7-11-2026 cutoff. Application locked!');
        this._isExpired = true;
        this._isTampered = true;
        return;
      }

      this._activatedAt = data.activatedAt || now;
      this._lastHeartbeat = Math.max(now, data.lastHeartbeat || now);
      this._isTampered = Boolean(data.isTampered);

      data.lastHeartbeat = this._lastHeartbeat;
      data.expiresAt = this._expiresAt;
      data.checksum = this._computeChecksum(this._activatedAt, this._expiresAt, this._isTampered, false);
      this._saveLicense(data);
    }

    this._checkExpiry();

    // Periodically update heartbeat every 30 seconds
    const interval = setInterval(() => {
      this._heartbeat();
    }, 30 * 1000);
    if (interval && interval.unref) interval.unref();

    // Check real world network time in the background
    this._checkNetworkTime();
  }

  _heartbeat() {
    if (!this._isTrial) return;
    const now = Date.now();

    if (this._hardExpiryMs && now >= this._hardExpiryMs) {
      this._isExpired = true;
      this._saveLicense({
        activatedAt: this._activatedAt,
        expiresAt: this._expiresAt,
        lastHeartbeat: now,
        isTampered: false,
        expiredLocked: true,
        checksum: this._computeChecksum(this._activatedAt, this._expiresAt, false, true)
      });
      return;
    }

    this._lastHeartbeat = Math.max(now, this._lastHeartbeat || now);
    this._checkExpiry();

    const checksum = this._computeChecksum(this._activatedAt, this._expiresAt, this._isTampered, false);
    this._saveLicense({
      activatedAt: this._activatedAt,
      expiresAt: this._expiresAt,
      lastHeartbeat: this._lastHeartbeat,
      isTampered: this._isTampered,
      expiredLocked: false,
      checksum
    });
  }

  _checkExpiry() {
    if (!this._isTrial) {
      this._isExpired = false;
      return false;
    }

    const now = Date.now();

    // 1. Check absolute hard cutoff (7-11-2026)
    if (this._hardExpiryMs && now >= this._hardExpiryMs) {
      if (!this._isExpired) {
        logger.warn(`*** HARD TRIAL DEADLINE REACHED (7-11-2026)! Current: ${now} >= ${this._hardExpiryMs}. Software locked! ***`);
      }
      this._isExpired = true;
      return true;
    }

    // 2. Tampered flag (e.g. clock rolled back after expiry)
    if (this._isTampered) {
      this._isExpired = true;
      return true;
    }

    // 3. Expiry date check
    if (this._expiresAt && now >= this._expiresAt) {
      this._isExpired = true;
      return true;
    }

    this._isExpired = false;
    return false;
  }

  _checkNetworkTime() {
    try {
      const req = https.request('https://www.google.com', { method: 'HEAD', timeout: 3500 }, (res) => {
        const dateHeader = res.headers['date'];
        if (dateHeader) {
          const netTime = new Date(dateHeader).getTime();
          if (!isNaN(netTime) && netTime > 0) {
            if (this._hardExpiryMs && netTime >= this._hardExpiryMs) {
              logger.warn(`Network time indicates hard cutoff has passed: ${new Date(netTime).toISOString()} >= 7-11-2026`);
              this._isExpired = true;
              this._isTampered = true;
            }
          }
        }
      });
      req.on('error', () => {});
      req.on('timeout', () => { req.destroy(); });
      req.end();
    } catch (_) {}
  }

  isTrial() {
    return this._isTrial;
  }

  isExpired() {
    if (!this._isTrial) return false;
    return this._checkExpiry();
  }

  getStatus() {
    if (!this._isTrial) {
      return {
        isTrial: false,
        isExpired: false,
        message: 'Full Licensed Version (Active)'
      };
    }

    const isExp = this._checkExpiry();
    const now = Date.now();
    const remainingMs = Math.max(0, (this._expiresAt || 0) - now);
    const remainingSec = Math.floor(remainingMs / 1000);
    const remainingMinutes = Math.floor(remainingSec / 60) % 60;
    const remainingHours = Math.floor(remainingSec / 3600) % 24;
    const remainingDays = Math.floor(remainingSec / 86400);

    const expiryLabel = this._expiresAt ? new Date(this._expiresAt).toLocaleDateString('en-GB') : '09-11-2026';

    return {
      isTrial: true,
      isExpired: isExp,
      isTampered: this._isTampered,
      trialDays: this._trialDays,
      hardExpiryDate: this._hardExpiryDate ? this._hardExpiryDate.slice(0, 10) : '2026-11-09',
      hardExpiryLabel: expiryLabel,
      hardExpiryReached: now >= this._hardExpiryMs,
      activatedAt: this._activatedAt ? new Date(this._activatedAt).toISOString() : null,
      expiresAt: this._expiresAt ? new Date(this._expiresAt).toISOString() : null,
      remainingMs,
      remainingDays,
      remainingHours,
      remainingMinutes,
      message: isExp
        ? `Your 30-day trial period has expired. The application cannot be used after trial expiration.`
        : `Trial Active: ${remainingDays}d ${remainingHours}h ${remainingMinutes}m remaining (Valid until ${expiryLabel}).`
    };
  }
}

const trialService = new TrialService();
module.exports = trialService;
