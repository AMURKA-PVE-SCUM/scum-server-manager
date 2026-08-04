import { Client, Events, Message, IntentsBitField } from 'lolka.js';
import { GatewayIntentBits, ActivityType } from 'discord-api-types/v10';
import { RconClient } from './rconClient';
import { WebPanel } from './webPanel';
import type { LolkaBotConfig } from './types';

interface BotCommand {
  name: string;
  aliases: string[];
  description: string;
  handler: (args: string[], msg: Message) => Promise<string>;
}

export class LolkaBot {
  private client: Client | null = null;
  private config: LolkaBotConfig;
  private commands: BotCommand[] = [];
  private statusTimer: NodeJS.Timeout | null = null;
  private rconClient: RconClient;
  private webPanel: WebPanel;

  constructor(config: LolkaBotConfig, rconClient: RconClient, webPanel: WebPanel) {
    this.config = config;
    this.rconClient = rconClient;
    this.webPanel = webPanel;
    this.initCommands();
  }

  updateConfig(config: LolkaBotConfig): void {
    this.config = config;
  }

  private initCommands(): void {
    this.commands = [
      {
        name: 'help',
        aliases: ['помощь', 'хелп', 'h'],
        description: 'Показать список команд',
        handler: async () => this.cmdHelp(),
      },
      {
        name: 'online',
        aliases: ['онлайн', 'онлаин', 'o'],
        description: 'Показать количество игроков онлайн',
        handler: async () => this.cmdOnline(),
      },
      {
        name: 'players',
        aliases: ['игроки', 'плееры', 'p', 'list'],
        description: 'Показать список игроков онлайн',
        handler: async () => this.cmdPlayers(),
      },
      {
        name: 'whois',
        aliases: ['кто', 'wh', 'w'],
        description: 'Показать информацию об игроке (по имени или SteamID)',
        handler: async (args) => this.cmdWhois(args),
      },
      {
        name: 'broadcast',
        aliases: ['объявление', 'обнова', 'bc', 'br'],
        description: 'Отправить глобальное объявление (admin)',
        handler: async (args) => this.cmdBroadcast(args),
      },
      {
        name: 'say',
        aliases: ['скажи', 'сказать', 's'],
        description: 'Отправить сообщение в игровой чат (admin)',
        handler: async (args) => this.cmdSay(args),
      },
    ];
  }

  async start(): Promise<void> {
    if (this.client) return;
    if (!this.config.token) throw new Error('Lolka bot token not configured');

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.client.on(Events.MessageCreate, async (msg: Message) => {
      if (msg.author.bot) return;
      if (msg.author.id === this.client?.user?.id) return;
      if (this.config.channelId && msg.channelId !== this.config.channelId) return;
      const prefix = '!';
      if (!msg.content || !msg.content.startsWith(prefix)) return;
      const parts = msg.content.slice(prefix.length).trim().split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);
      const cmd = this.commands.find(c => c.name === cmdName || c.aliases.includes(cmdName));
      if (!cmd) return;
      try {
        const reply = await cmd.handler(args, msg);
        const channel = await this.client?.channels.fetch(msg.channelId);
        if (channel && 'send' in channel) {
          await (channel as any).send(reply);
        }
      } catch (e: any) {
        try {
          const channel = await this.client?.channels.fetch(msg.channelId);
          if (channel && 'send' in channel) {
            await (channel as any).send(`❌ Ошибка: ${e.message}`);
          }
        } catch {}
      }
    });

    this.client.once(Events.ClientReady, () => {
      console.log('[LolkaBot] Connected as', this.client?.user?.tag);
      this.startStatusUpdates();
    });

    await this.client.login(this.config.token);
  }

  stop(): void {
    this.stopStatusUpdates();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }

  isRunning(): boolean {
    return this.client !== null && this.client.isReady();
  }

  private startStatusUpdates(): void {
    this.stopStatusUpdates();
    this.doStatusUpdate();
    this.statusTimer = setInterval(() => this.doStatusUpdate(), 30000);
  }

  private stopStatusUpdates(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }

  private async doStatusUpdate(): Promise<void> {
    if (!this.client || !this.client.isReady()) return;
    try {
      const { count } = await this.fetchOnlinePlayers();
      const text = (this.config.activityText || 'AMURKA PVE') + ` | ${count}/100`;
      this.client.user?.setActivity(text, { type: ActivityType.Playing });
    } catch {}
  }

  private async cmdHelp(): Promise<string> {
    const lines = this.commands.map(c => {
      const aliases = c.aliases.length ? ` (${c.aliases.map(a => '!' + a).join(', ')})` : '';
      return `**!${c.name}**${aliases} — ${c.description}`;
    });
    return `**🤖 AMURKA PVE Бот**\nДоступные команды:\n${lines.join('\n')}`;
  }

  private async fetchOnlinePlayers(): Promise<{ count: number; names: string[] }> {
    if (!this.rconClient || !this.rconClient.isConnected()) return { count: 0, names: [] };
    const result = await this.rconClient.sendCommand('ListPlayers');
    if (!result.success || !result.response) return { count: 0, names: [] };
    const names: string[] = [];
    const lines = result.response.split('\n').filter(l => l.trim());
    for (const line of lines) {
      // New format (v0.4.6+): PLAYER | Name | steam=...
      const pipeMatch = line.trim().match(/^PLAYER\s*\|\s*(.+?)\s*\|\s*steam=(\d{17})\s*\|/i);
      if (pipeMatch) {
        names.push(pipeMatch[1].trim());
        continue;
      }
      // Old format: N. PlayerName
      const oldMatch = line.trim().match(/^\d+\.\s+(.+)$/);
      if (oldMatch) {
        names.push(oldMatch[1].trim());
      }
    }
    return { count: names.length, names };
  }

  private async cmdOnline(): Promise<string> {
    const { count, names } = await this.fetchOnlinePlayers();
    let info = `📊 **Онлайн: ${count}/100**`;
    if (names.length > 0) {
      info += `\n👥 **Игроки:**\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
    }
    return info;
  }

  private async cmdPlayers(): Promise<string> {
    return this.cmdOnline();
  }

  private async cmdWhois(args: string[]): Promise<string> {
    if (args.length === 0) return '❌ Укажите имя или SteamID игрока. Пример: !whois PlayerName';
    const query = args.join(' ');
    if (!this.rconClient || !this.rconClient.isConnected()) {
      return '❌ RCON не подключён';
    }
    // Try Whois with original casing, fallback to lowercase
    for (const cmd of [`Whois ${query}`, `whois ${query}`]) {
      const result = await this.rconClient.sendCommand(cmd);
      if (result.success && result.response) {
        const resp = result.response.trim();
        if (resp.includes('not found') || resp.includes('No player')) {
          return `❌ Игрок "${query}" не найден`;
        }
        const lines = resp.split('\n').filter(l => l.trim());
        const info = lines.map(l => {
          const clean = l.replace(/^\[[\d:.]+\]\s*/, '');
          return clean;
        }).join('\n');
        return `📋 **Информация об игроке ${query}:**\n\`\`\`${info}\`\`\``;
      }
    }
    // Fallback: search in ListPlayers
    const lp = await this.rconClient.sendCommand('ListPlayers');
    if (lp.success && lp.response) {
      for (const line of lp.response.split('\n')) {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          const parts = line.split('|').map(s => s.trim());
          return `📋 **${parts[1] || query}**\n\`\`\`${line.trim()}\`\`\``;
        }
      }
    }
    return '❌ Команда Whois не поддерживается сервером. Попробуйте !online для списка игроков.';
  }

  private async cmdBroadcast(args: string[]): Promise<string> {
    if (args.length === 0) return '❌ Укажите текст объявления. Пример: !broadcast Сервер перезагрузится через 5 минут';
    const text = args.join(' ');
    if (!this.rconClient || !this.rconClient.isConnected()) {
      return '❌ RCON не подключён';
    }
    const result = await this.rconClient.sendCommand(`#Announce ${text}`);
    if (result.success) {
      return `✅ Объявление отправлено: "${text}"`;
    }
    return `❌ Ошибка отправки объявления`;
  }

  private async cmdSay(args: string[]): Promise<string> {
    if (args.length === 0) return '❌ Укажите сообщение. Пример: !say Привет всем!';
    const text = args.join(' ');
    if (!this.rconClient || !this.rconClient.isConnected()) {
      return '❌ RCON не подключён';
    }
    const result = await this.rconClient.sendCommand(`SendChat 2 "${text}"`);
    if (result.success) {
      return `✅ Сообщение отправлено в чат`;
    }
    return `❌ Ошибка отправки сообщения`;
  }

  getStatus(): { running: boolean; config: LolkaBotConfig } {
    return { running: this.isRunning(), config: this.config };
  }
}
