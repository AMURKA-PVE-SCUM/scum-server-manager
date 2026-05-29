import type { DiscordConfig } from './types';

export class DiscordWebhook {
  private config: DiscordConfig;

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  private async send(webhookUrl: string, content: string, title?: string): Promise<boolean> {
    if (!webhookUrl || !this.config.enabled) return false;
    try {
      const payload: any = { content, allowed_mentions: { parse: [] } };
      if (title) {
        payload.embeds = [{ title, description: content, color: 0x00ff00, timestamp: new Date().toISOString() }];
        delete payload.content;
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch { return false; }
  }

  async sendAdminLog(message: string): Promise<boolean> {
    return this.send(this.config.adminLogWebhook, message, 'Admin Log');
  }

  async sendChatMessage(player: string, message: string): Promise<boolean> {
    return this.send(this.config.chatWebhook, `**${player}**: ${message}`);
  }

  async sendVehicleEvent(event: string): Promise<boolean> {
    return this.send(this.config.vehicleWebhook, event, 'Vehicle Event');
  }

  async sendLoginEvent(player: string, steamId: string): Promise<boolean> {
    if (!this.config.loginWebhook || !this.config.enabled) return false;
    try {
      const payload = {
        embeds: [{
          title: 'Player',
          description: `**${player}** ${steamId ? `(\`${steamId}\`)` : ''}`,
          color: 0x58a6ff,
          timestamp: new Date().toISOString(),
        }],
      };
      const response = await fetch(this.config.loginWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch { return false; }
  }

  async sendStatusUpdate(status: string): Promise<boolean> {
    if (!this.config.serverStatusWebhook || !this.config.enabled) return false;
    const color = status.includes('🟢') ? 0x3fb950 : status.includes('🔄') ? 0xd29922 : 0xf85149;
    try {
      const payload = {
        embeds: [{ title: 'Server Status', description: status, color, timestamp: new Date().toISOString() }],
      };
      const response = await fetch(this.config.serverStatusWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch { return false; }
  }

  async test(webhookUrl: string): Promise<boolean> {
    return this.send(webhookUrl, 'Discord webhook is working!', 'Test Message');
  }
}
