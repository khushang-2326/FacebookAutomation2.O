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

try {
  // Step 1: Ensure Frontend SPA is compiled
  log('Step 1: Compiling Frontend SPA Assets...');
  run('npm run build:frontend');

  // Step 2: Configure Non-Trial Licensed Mode
  log('Step 2: Configuring Non-Trial Production Mode...');
  fs.writeFileSync(buildModePath, JSON.stringify({ isTrial: false, trialDays: 30, hardExpiryDate: null }, null, 2), 'utf8');

  // Step 3: Run Electron Builder for Portable and NSIS
  log('Step 3: Building Production Windows Executables (Portable & Setup Installer)...');
  run('npx electron-builder --win portable nsis');

  // Step 4: Normalize filenames
  const portableSrc = path.join(distDir, 'Facebook Live Streamer 1.3.0.exe');
  const portableDst = path.join(distDir, 'Facebook Live Streamer.exe');
  if (fs.existsSync(portableSrc)) {
    fs.copyFileSync(portableSrc, portableDst);
    try { fs.unlinkSync(portableSrc); } catch (_) {}
  }

  const nsisSrc = path.join(distDir, 'Facebook Live Streamer Setup 1.3.0.exe');
  const nsisDst = path.join(distDir, 'Facebook Live Streamer Setup.exe');
  if (fs.existsSync(nsisSrc)) {
    fs.copyFileSync(nsisSrc, nsisDst);
    try { fs.unlinkSync(nsisSrc); } catch (_) {}
  }

  // Clean intermediate blockmap files
  try {
    const files = fs.readdirSync(distDir);
    files.forEach(f => {
      if (f.endsWith('.blockmap') || f === 'builder-debug.yml') {
        fs.unlinkSync(path.join(distDir, f));
      }
    });
  } catch (_) {}

  // Sync to root project folder
  try {
    const rootPortableDst = path.join(rootDir, 'Facebook-Live-Streamer-Portable.exe');
    const rootNsisDst = path.join(rootDir, 'Facebook-Live-Streamer-Setup.exe');

    if (fs.existsSync(portableDst)) {
      fs.copyFileSync(portableDst, rootPortableDst);
      console.log(`Synced to root: ${rootPortableDst}`);
    }
    if (fs.existsSync(nsisDst)) {
      fs.copyFileSync(nsisDst, rootNsisDst);
      console.log(`Synced to root: ${rootNsisDst}`);
    }
  } catch (syncErr) {
    console.warn('[BUILD] Root sync warning:', syncErr.message);
  }

  log('BUILD COMPLETE: Normal Full Licensed Executables Ready!');
  console.log(`\n✅ Portable EXE: ${portableDst}`);
  console.log(`✅ Setup Installer: ${nsisDst}\n`);
} catch (err) {
  console.error('[BUILD ERROR]', err.message);
  process.exit(1);
}
