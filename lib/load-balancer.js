class LoadBalancer {
  constructor() {
    this.servers = [
      { url: 'server1:3000', weight: 1 },
      { url: 'server2:3000', weight: 1 }
    ];
  }

  async getNextServer() {
    // Check health of all servers
    const healthyServers = await this.checkServers();
    
    if (healthyServers.length === 0) {
      throw new Error('No healthy servers available');
    }

    // Round robin with weights
    return this.roundRobin(healthyServers);
  }

  async checkServers() {
    const checks = this.servers.map(async server => {
      try {
        const response = await fetch(`${server.url}/health`);
        return response.ok ? server : null;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(checks);
    return results.filter(Boolean);
  }
} 