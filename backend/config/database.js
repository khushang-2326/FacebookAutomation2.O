const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./config');

let mongoServerInstance = null;

function getBundledMongodPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'mongod.exe'),
    path.join(__dirname, '../bin', 'mongod.exe'),
    path.join(process.cwd(), 'backend/bin', 'mongod.exe'),
    path.join(process.cwd(), 'resources/bin', 'mongod.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

const connectDB = async () => {
  // 1. If explicit MONGODB_URI is provided in environment, attempt primary connection
  if (config.mongodbUri) {
    try {
      const conn = await mongoose.connect(config.mongodbUri, {
        serverSelectionTimeoutMS: 4000,
      });
      console.log(`✅ MongoDB Connected to external database: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.warn(`⚠️ External MongoDB connection failed (${error.message}). Switching to local database...`);
    }
  }

  // 2. Try local MongoDB service (e.g. 127.0.0.1:27017)
  try {
    const conn = await mongoose.connect('mongodb://127.0.0.1:27017/facebook_live_auto', {
      serverSelectionTimeoutMS: 2000
    });
    console.log(`✅ Local MongoDB Service Connected: ${conn.connection.host}`);
    return conn;
  } catch (_) {
    // Local standalone MongoDB service not active. Fall through to embedded persistent database.
  }

  // 3. Initialize Embedded Persistent MongoDB (Zero-configuration desktop client engine)
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const bundledMongod = getBundledMongodPath();

    const userDataDir = process.env.ELECTRON_USER_DATA || 
      (process.env.APPDATA ? path.join(process.env.APPDATA, 'facebook-live-automation') : path.join(__dirname, '../data'));

    const dbDir = path.join(userDataDir, 'db');
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch (_) {}

    // Clean up empty/stale lock files if previous process crashed
    const lockFile = path.join(dbDir, 'mongod.lock');
    if (fs.existsSync(lockFile)) {
      try {
        const lockContent = fs.readFileSync(lockFile, 'utf8').trim();
        if (!lockContent) {
          fs.unlinkSync(lockFile);
        }
      } catch (_) {}
    }

    const serverOptions = {
      instance: {
        dbPath: dbDir,
        storageEngine: 'wiredTiger',
        args: ['--wiredTigerCacheSizeGB', '0.25']
      }
    };

    if (bundledMongod) {
      console.log(`Using pre-bundled MongoDB binary at: ${bundledMongod}`);
      serverOptions.binary = {
        systemBinary: bundledMongod,
        skipMD5: true
      };
    }

    try {
      mongoServerInstance = await MongoMemoryServer.create(serverOptions);
    } catch (lockErr) {
      console.warn(`⚠️ Could not lock dbPath (${lockErr.message}). Starting ephemeral in-memory database instance...`);
      delete serverOptions.instance.dbPath;
      delete serverOptions.instance.storageEngine;
      mongoServerInstance = await MongoMemoryServer.create(serverOptions);
    }

    const uri = mongoServerInstance.getUri();
    console.log(`✅ Embedded Persistent MongoDB running at: ${uri} (Storage: ${dbDir})`);

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ Embedded MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (embeddedErr) {
    console.error('❌ Failed to initialize embedded MongoDB engine:', embeddedErr.message);
    throw new Error(`CRITICAL: All database connection methods failed. (${embeddedErr.message})`);
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (mongoServerInstance) {
      await mongoServerInstance.stop();
    }
    console.log('✅ MongoDB Disconnected cleanly.');
  } catch (error) {
    console.error('Error disconnecting MongoDB:', error);
  }
};

module.exports = { connectDB, disconnectDB };
