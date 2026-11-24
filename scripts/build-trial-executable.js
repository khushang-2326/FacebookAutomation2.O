const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const buildModePath = path.join(rootDir, 'backend', 'config', 'buildMode.json');
const distDir = path.join(rootDir, 'dist-electron');

function log(msg) {
  console.log(`\n========================================================`);
  console.log(`[BUILD-TRIAL] ${msg}`);
  console.log(`========================================================\n`);
}

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

const originalPkg = fs.readFileSync(pkgPath, 'utf8');

try {
  // Step 1: Ensure Frontend SPA is compiled
  log('Step 1: Compiling Frontend SPA Assets...');
  run('npm run build:frontend');

  // Step 2: Configure 30-Day Trial Mode
  const cutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  cutoff.setHours(23, 59, 59, 999);
  const hardExpiryDate = cutoff.toISOString();
  log(`Step 2: Configuring 30-Day Trial Mode (Hard Cutoff: ${cutoff.toLocaleDateString()})...`);
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

  fs.writeFileSync(pkgPath, JSON.stringify(pkgObj, null, 2), 'utf8');

  // Step 3: Run Electron Builder for Portable
  log('Step 3: Building 30-Day Trial Standalone Windows Executable...');
  run('npx electron-builder --win portable');

  // Step 4: Clean intermediate files in distDir
  try {
    const files = fs.readdirSync(distDir);
    files.forEach(f => {
      const full = path.join(distDir, f);
      if (f !== 'trialexe.exe' && f !== 'Facebook Live Streamer.exe') {
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

  // Step 5: Sync to project root folder
  log('Step 5: Syncing trial executable to root project folder...');
  const rootTrialDst = path.join(rootDir, 'trialexe.exe');
  const trialSrc = path.join(distDir, 'trialexe.exe');

  if (fs.existsSync(trialSrc)) {
    fs.copyFileSync(trialSrc, rootTrialDst);
    console.log(`Synced to root: ${rootTrialDst}`);
  }

  log(`TRIAL BUILD COMPLETE! 30-Day Trial Executable Ready (Hard Expiry: ${cutoff.toLocaleDateString()})`);
  console.log(`\n✅ Standalone Trial EXE: ${rootTrialDst}\n`);
} catch (err) {
  console.error('[BUILD-TRIAL ERROR]', err);
  process.exit(1);
} finally {
  // Always restore original package.json and buildMode.json (isTrial: false)
  fs.writeFileSync(pkgPath, originalPkg, 'utf8');
  fs.writeFileSync(buildModePath, JSON.stringify({ isTrial: false, trialDays: 30, hardExpiryDate: null }, null, 2), 'utf8');
  console.log('[BUILD-TRIAL] Restored original package.json and buildMode.json (isTrial: false)');
}
