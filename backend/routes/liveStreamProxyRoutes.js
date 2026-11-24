const express = require('express');
const http = require('http');
const router = express.Router();
const { Logger } = require('../utils/logger');

const logger = new Logger('LiveStreamProxy');

const WHEP_HOST = process.env.MEDIAMTX_WHEP_HOST || '127.0.0.1';
const WHEP_PORT = parseInt(process.env.MEDIAMTX_WHEP_PORT, 10) || 8889;
const HLS_HOST = process.env.MEDIAMTX_HLS_HOST || '127.0.0.1';
const HLS_PORT = parseInt(process.env.MEDIAMTX_HLS_PORT, 10) || 8888;

// Middleware for parsing raw SDP bodies
const rawSdpParser = express.text({ type: ['application/sdp', 'text/plain', '*/*'], limit: '5mb' });

/**
 * Handle CORS pre-flight OPTIONS for WHEP and HLS
 */
router.options('/whep/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Location, Content-Type');
  res.sendStatus(204);
});

router.options('/hls/*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.sendStatus(204);
});

/**
 * WebRTC WHEP Proxy Route
 * POST /api/whep/:pathName -> forwards to http://127.0.0.1:8889/:pathName/whep
 * PATCH/DELETE /api/whep/:pathName/:sessionId -> forwards to http://127.0.0.1:8889/:pathName/whep/:sessionId
 */
router.all('/whep/:pathName*', rawSdpParser, (req, res) => {
  const pathName = req.params.pathName;
  const subPath = req.params[0] || '';
  const targetPath = `/${pathName}/whep${subPath}`;

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders.host;
  forwardHeaders.host = `${WHEP_HOST}:${WHEP_PORT}`;

  const options = {
    hostname: WHEP_HOST,
    port: WHEP_PORT,
    path: targetPath,
    method: req.method,
    headers: forwardHeaders
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);

    // Forward response headers
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (key.toLowerCase() === 'location') {
        // Rewrite location header if it points to internal MediaMTX port
        const rewritten = String(value).replace(`:${WHEP_PORT}`, '').replace(`/${pathName}/whep`, `/api/whep/${pathName}`);
        res.setHeader('Location', rewritten);
      } else {
        res.setHeader(key, value);
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-Match');
    res.setHeader('Access-Control-Expose-Headers', 'Location, Content-Type');

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    logger.warn(`WHEP proxy request error for path ${pathName}: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'MediaMTX WHEP service unreachable', details: err.message });
    }
  });

  if (req.body && (req.method === 'POST' || req.method === 'PATCH')) {
    proxyReq.write(typeof req.body === 'string' ? req.body : Buffer.from(req.body));
  }
  proxyReq.end();
});

/**
 * Low-Latency HLS Proxy Route
 * Handles playlists, fMP4 segments, init chunks, and session query strings
 * GET /api/hls/:pathName* -> forwards to http://127.0.0.1:8888/:pathName/*
 */
router.all('/hls/:pathName*', (req, res) => {
  const pathName = req.params.pathName;
  const subPath = req.params[0] || '';
  const cleanSub = subPath ? (subPath.startsWith('/') ? subPath : `/${subPath}`) : '/index.m3u8';
  const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetPath = `/${pathName}${cleanSub}${queryString}`;

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders.host;
  forwardHeaders.host = `${HLS_HOST}:${HLS_PORT}`;

  const options = {
    hostname: HLS_HOST,
    port: HLS_PORT,
    path: targetPath,
    method: req.method,
    headers: forwardHeaders
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);

    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (key.toLowerCase() === 'location') {
        let loc = String(value);
        if (loc.startsWith(`/${pathName}`)) {
          loc = `/api/hls${loc}`;
        } else if (!loc.startsWith('http') && !loc.startsWith('/api/hls')) {
          loc = `/api/hls/${pathName}/${loc.replace(/^\//, '')}`;
        }
        res.setHeader('Location', loc);
      } else {
        res.setHeader(key, value);
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    logger.warn(`HLS proxy request error for path ${targetPath}: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'MediaMTX HLS service unreachable', details: err.message });
    }
  });

  proxyReq.end();
});

module.exports = router;
