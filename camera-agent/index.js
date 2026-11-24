const http = require('http');
const OnvifDiscovery = require('./discovery/onvifDiscovery');
const RtspTester = require('./rtsp/rtspTester');

const PORT = 5050;
const AGENT_ID = `agent_local_${Math.floor(Math.random() * 10000)}`;

console.log('================================================================');
console.log(`  CAMERA AGENT ONLINE (Agent ID: ${AGENT_ID})`);
console.log(`  Listening on http://localhost:${PORT}`);
console.log('================================================================');

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.url === '/api/agent/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      agentId: AGENT_ID,
      status: 'ONLINE',
      hostname: require('os').hostname(),
      platform: process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }));
  }

  if (req.url === '/api/agent/discover' && req.method === 'POST') {
    const cameras = await OnvifDiscovery.scanLocalNetwork();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, count: cameras.length, cameras }));
  }

  if (req.url === '/api/agent/test-rtsp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { rtspUrl } = JSON.parse(body || '{}');
        const testResult = await RtspTester.testStream(rtspUrl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: testResult.passed, testResult }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT);
