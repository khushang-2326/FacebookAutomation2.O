const Agent = require('../models/Agent');
const crypto = require('crypto');

class AgentService {
  /**
   * Registers a customer PC agent instance or updates an existing registration.
   */
  static async registerAgent({ deviceName, hostname, agentVersion, platform, agentId }) {
    const finalAgentId = agentId || `agent_${hostname ? hostname.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'pc'}_${crypto.randomBytes(4).toString('hex')}`;
    const token = crypto.randomBytes(16).toString('hex');

    let agent = await Agent.findOne({ agentId: finalAgentId });
    if (agent) {
      agent.deviceName = deviceName || agent.deviceName;
      agent.hostname = hostname || agent.hostname;
      agent.agentVersion = agentVersion || agent.agentVersion;
      agent.platform = platform || agent.platform;
      agent.status = 'ONLINE';
      agent.connectionToken = token;
      agent.lastSeenAt = new Date();
      agent.updatedAt = new Date();
      await agent.save();
    } else {
      agent = await Agent.create({
        agentId: finalAgentId,
        deviceName: deviceName || 'Local Store PC',
        hostname: hostname || 'localhost',
        agentVersion: agentVersion || '1.0.0',
        platform: platform || 'windows',
        status: 'ONLINE',
        connectionToken: token,
        lastSeenAt: new Date(),
      });
    }

    return {
      agentId: agent.agentId,
      connectionToken: agent.connectionToken,
      status: agent.status,
      lastSeenAt: agent.lastSeenAt,
    };
  }

  /**
   * Updates agent heartbeat metrics.
   */
  static async recordHeartbeat({ agentId, status, cpuUsage, memoryUsage, ffmpegRunning, cameraCount }) {
    const agent = await Agent.findOne({ agentId });
    if (!agent) {
      // Auto-register default local agent if missing
      return this.registerAgent({ agentId: agentId || 'local_agent_default', deviceName: 'Local Agent PC' });
    }

    agent.status = status || 'ONLINE';
    if (cpuUsage !== undefined) agent.cpuUsage = cpuUsage;
    if (memoryUsage !== undefined) agent.memoryUsage = memoryUsage;
    if (ffmpegRunning !== undefined) agent.ffmpegRunning = ffmpegRunning;
    if (cameraCount !== undefined) agent.activeCameraCount = cameraCount;
    agent.lastSeenAt = new Date();
    agent.updatedAt = new Date();
    await agent.save();

    return {
      agentId: agent.agentId,
      status: agent.status,
      lastSeenAt: agent.lastSeenAt,
    };
  }

  /**
   * Retrieves active agent details.
   */
  static async getAgent(agentId) {
    let agent = await Agent.findOne({ agentId });
    if (!agent && agentId === 'local_agent_default') {
      agent = await Agent.create({
        agentId: 'local_agent_default',
        deviceName: 'Default Windows PC Agent',
        status: 'ONLINE',
        lastSeenAt: new Date(),
      });
    }
    return agent;
  }
}

module.exports = AgentService;
