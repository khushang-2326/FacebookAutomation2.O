const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const buildModePath = path.join(rootDir, 'backend', 'config', 'buildMode.json');
const distDir = path.join(rootDir, 'dist-electron');

function log(msg) {
  console.log(`\n========================================================`);
  console.log(`[BUILD] ${msg}`);
  console.log(`========================================================\n`);
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

function killRunningInstances() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM trialexe.exe /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
      execSync('taskkill /F /IM "Facebook Live Streamer.exe" /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
    }
  } catch (_) {}
}

const originalPkg = fs.readFileSync(pkgPath, 'utf8');

try {
  killRunningInstances();

  // Step 1: Build Frontend Assets
  log('Step 1: Compiling Frontend SPA Assets...');
  run('npm run build:frontend');

  // Step 2: Build Normal Full Executable (No Expiration)
  killRunningInstances();
  log('Step 2: Building Normal Full Executable (Permanent Full License)...');
  fs.writeFileSync(buildModePath, JSON.stringify({ isTrial: false, trialDays: 30, hardExpiryDate: null }, null, 2), 'utf8');
  fs.writeFileSync(pkgPath, originalPkg, 'utf8');
  
  run('npx electron-builder --win portable nsis');

  // Normalize Normal Executables if versioned
  const versionedPortable = path.join(distDir, 'Facebook Live Streamer 1.3.0.exe');
  const normalDst = path.join(distDir, 'Facebook Live Streamer.exe');
  if (fs.existsSync(versionedPortable)) {
    fs.copyFileSync(versionedPortable, normalDst);
    try { fs.unlinkSync(versionedPortable); } catch (_) {}
  }
  const versionedSetup = path.join(distDir, 'Facebook Live Streamer Setup 1.3.0.exe');
  const normalSetupDst = path.join(distDir, 'Facebook Live Streamer Setup.exe');
  if (fs.existsSync(versionedSetup)) {
    fs.copyFileSync(versionedSetup, normalSetupDst);
    try { fs.unlinkSync(versionedSetup); } catch (_) {}
  }

  // Step 3: Build 30-Day Trial Executables (trialexe & trialexe Setup) with Hard Cutoff
  killRunningInstances();
  const cutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  cutoff.setHours(23, 59, 59, 999);
  const hardExpiryDate = cutoff.toISOString();
  log(`Step 3: Building 30-Day Trial Executables (trialexe Setup & trialexe) with 30-Day Cutoff (${cutoff.toLocaleDateString()})...`);
  fs.writeFileSync(buildModePath, JSON.stringify({
    isTrial: true,
    trialDays: 30,
    hardExpiryDate
  }, null, 2), 'utf8');

  const pkgObj = JSON.parse(originalPkg);
  pkgObj.name = 'trialexe';
  pkgObj.build.productName = 'trialexe';
  pkgObj.build.appId = 'com.facebook.liveautomation.trial';
  pkgObj.build.portable = {
    artifactName: 'trialexe.${ext}'
  };
  pkgObj.build.nsis = {
    ...pkgObj.build.nsis,
    shortcutName: 'trialexe',
    artifactName: 'trialexe Setup.${ext}'
  };

  fs.writeFileSync(pkgPath, JSON.stringify(pkgObj, null, 2), 'utf8');

  run('npx electron-builder --win portable nsis');

  // Clean all intermediate/unneeded files in distDir
  const allowed = [
    'Facebook Live Streamer Setup.exe',
    'trialexe Setup.exe',
    'Facebook Live Streamer.exe',
    'trialexe.exe'
  ];

  try {
    const files = fs.readdirSync(distDir);
    files.forEach(f => {
      const full = path.join(distDir, f);
      if (!allowed.includes(f)) {
        try {
          if (fs.lstatSync(full).isDirectory()) {
            fs.rmSync(full, { recursive: true, force: true });
          } else {
            fs.unlinkSync(full);
          }
        } catch (_) {}
      }
    });
  } catch (_) {}

  // Sync to project root folder
  try {
    for (const file of allowed) {
      const src = path.join(distDir, file);
      const dst = path.join(rootDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        console.log(`Synced to root: ${dst}`);
      }
    }

    // Clean any old hyphenated files from root
    ['Facebook-Live-Streamer-Portable.exe', 'Facebook-Live-Streamer-Setup.exe', 'trialexe-Setup.exe'].forEach(extra => {
      const extraPath = path.join(rootDir, extra);
      if (fs.existsSync(extraPath)) {
        try { fs.unlinkSync(extraPath); } catch (_) {}
      }
    });
  } catch (syncErr) {
    console.warn('[BUILD] Root sync warning:', syncErr.message);
  }

  log('ALL EXECUTABLES BUILT SUCCESSFULLY!');
} catch (err) {
  console.error('[BUILD-ERROR]', err);
  process.exit(1);
} finally {
  // Always restore original files
  fs.writeFileSync(pkgPath, originalPkg, 'utf8');
  fs.writeFileSync(buildModePath, JSON.stringify({ isTrial: false, trialDays: 30 }, null, 2), 'utf8');
  console.log('[BUILD] Restored original package.json and buildMode.json (isTrial: false)');
}
