const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config/config');
const { Logger } = require('../utils/logger');

const logger = new Logger('YouTubeService');

function isYouTubeUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host === 'youtu.be' || host.endsWith('.youtu.be') || host === 'youtube.com' || host.endsWith('.youtube.com');
  } catch (_) {
    return false;
  }
}

function executableExists(command) {
  return new Promise((resolve) => {
    if (!command) return resolve(false);
    if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) {
      if (!fs.existsSync(command)) return resolve(false);
    }
    let settled = false;
    const child = spawn(command, ['--version'], { windowsHide: true, stdio: 'ignore' });
    child.once('error', () => {
      if (!settled) { settled = true; resolve(false); }
    });
    child.once('close', (code) => {
      if (!settled) { settled = true; resolve(code === 0); }
    });
  });
}

async function resolveYtdlpPath() {
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const candidates = [
    process.env.YTDLP_PATH,
    path.join(__dirname, '..', 'bin', binaryName),
    path.join(__dirname, '..', '..', 'backend', 'bin', binaryName),
    path.join(process.cwd(), 'backend', 'bin', binaryName),
    path.join(process.cwd(), 'bin', binaryName),
    process.resourcesPath ? path.join(process.resourcesPath, 'bin', binaryName) : null,
    process.execPath ? path.join(path.dirname(process.execPath), 'bin', binaryName) : null,
    binaryName
  ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);

  for (const candidate of candidates) {
    if (await executableExists(candidate)) return candidate;
  }
  return null;
}

class YouTubeService {
  isYouTubeUrl(value) {
    return isYouTubeUrl(value);
  }

  async isAvailable() {
    return Boolean(await resolveYtdlpPath());
  }

  async downloadVideo(url, automationId) {
    if (!isYouTubeUrl(url)) {
      throw new Error('Enter a valid YouTube video URL. Only youtube.com and youtu.be links are accepted.');
    }
    const ytdlpPath = await resolveYtdlpPath();
    if (!ytdlpPath) {
      throw new Error('YouTube support needs yt-dlp. Install it or set YTDLP_PATH to the yt-dlp executable, then retry.');
    }

    const cacheDir = path.join(config.media.uploadDir, 'youtube');
    fs.mkdirSync(cacheDir, { recursive: true });
    const safeId = String(automationId).replace(/[^a-zA-Z0-9_-]/g, '');
    const prefix = `youtube-${safeId}-${Date.now()}`;
    const outputTemplate = path.join(cacheDir, `${prefix}.%(ext)s`);
    const args = [
      '--no-playlist', '--no-warnings', '--restrict-filenames',
      '--merge-output-format', 'mp4', '--remux-video', 'mp4',
      '--output', outputTemplate, url.trim()
    ];

    logger.info(`Downloading licensed YouTube source for automation ${automationId}`);
    await new Promise((resolve, reject) => {
      const child = spawn(ytdlpPath, args, { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.once('error', (err) => reject(new Error(`Could not start yt-dlp: ${err.message}`)));
      child.once('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(`YouTube download failed${stderr ? `: ${stderr.trim().slice(-500)}` : ''}`));
      });
    });

    const downloaded = fs.readdirSync(cacheDir)
      .filter((file) => file.startsWith(prefix) && file.toLowerCase().endsWith('.mp4'))
      .map((file) => path.join(cacheDir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!downloaded || !fs.existsSync(downloaded)) {
      throw new Error('yt-dlp completed but did not produce an MP4 file that can be streamed.');
    }
    return downloaded;
  }
}

module.exports = new YouTubeService();
