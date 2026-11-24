const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const buildModePath = path.join(rootDir, 'backend', 'config', 'buildMode.json');
const distDir = path.join(rootDir, 'dist-electron');

function log(msg) {
  console.log(`\n========================================================`);
  console.log(`[BUILD-NORMAL] ${msg}`);
  console.log(`========================================================\n`);
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

function killRunningInstances() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM "Facebook Live Streamer.exe" /T 2>nul || exit 0', { shell: 'cmd.exe', stdio: 'ignore' });
    }
  } catch (_) {}
}

try {
  killRunningInstances();

  log('Compiling Frontend SPA Assets...');
  run('npm run build:frontend');

  log('Configuring Permanent Full License Mode (isTrial: false)...');
  fs.writeFileSync(buildModePath, JSON.stringify({ isTrial: false, trialDays: 30, hardExpiryDate: null }, null, 2), 'utf8');

  log('Packaging Normal Windows Executables (Portable & NSIS Setup)...');
  killRunningInstances();
  run('npx electron-builder --win portable nsis');

  // Normalize Normal Executables in dist-electron
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

  // Sync to root folder
  const filesToSync = ['Facebook Live Streamer.exe', 'Facebook Live Streamer Setup.exe'];
  for (const file of filesToSync) {
    const src = path.join(distDir, file);
    const dst = path.join(rootDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`Synced to root: ${dst} (${(fs.statSync(dst).size / (1024 * 1024)).toFixed(1)} MB)`);
    }
  }

  log('NORMAL EXECUTABLE BUILT & SYNCED SUCCESSFULLY!');
} catch (err) {
  console.error('[BUILD-ERROR]', err);
  process.exit(1);
}
