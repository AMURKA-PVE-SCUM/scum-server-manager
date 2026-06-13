import type { DiscordConfig } from './types';

const STATUS_RU: Record<string, { label: string; emoji: string; color: number }> = {
  started:   { label: 'Запущен',           emoji: '🟢', color: 0x3fb950 },
  stopped:   { label: 'Остановлен',        emoji: '🔴', color: 0xf85149 },
  restarted: { label: 'Перезапущен',       emoji: '🔄', color: 0xd29922 },
  unknown:   { label: 'Неизвестно',        emoji: '❓', color: 0x8b949e },
};

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
    return this.send(this.config.adminLogWebhook, message, 'Журнал администратора');
  }

  async sendChatMessage(player: string, message: string): Promise<boolean> {
    return this.send(this.config.chatWebhook, `**${player}**: ${message}`);
  }

  async sendVehicleEvent(event: string): Promise<boolean> {
    return this.send(this.config.vehicleWebhook, event, 'Транспорт');
  }

  async sendLoginEvent(player: string, steamId: string): Promise<boolean> {
    if (!this.config.loginWebhook || !this.config.enabled) return false;
    try {
      const payload = {
        embeds: [{
          title: 'Игрок зашёл на сервер',
          description: [
            `**Игрок:** ${player}`,
            steamId ? `**Steam ID:** \`${steamId}\`` : '',
            `**Время:** <t:${Math.floor(Date.now() / 1000)}:F>`,
          ].filter(Boolean).join('\n'),
          color: 0x58a6ff,
          footer: { text: 'SCUM Server Manager' },
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
    const key = status.toLowerCase();
    const s = STATUS_RU[key] || STATUS_RU.unknown;
    try {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        embeds: [{
          title: `${s.emoji} Статус сервера`,
          description: [
            `**Состояние:** ${s.emoji} ${s.label}`,
            `**Время:** <t:${now}:F>`,
            `**Относительно:** <t:${now}:R>`,
          ].join('\n'),
          color: s.color,
          footer: { text: 'SCUM Server Manager' },
          timestamp: new Date().toISOString(),
        }],
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
    return this.send(webhookUrl, 'Вебхук работает!', 'Проверка');
  }
}
