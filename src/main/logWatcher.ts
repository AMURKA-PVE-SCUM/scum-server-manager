import fs from 'fs-extra';
import path from 'path';
import { watch, FSWatcher } from 'chokidar';
import type { LogEvent } from './types';
import { DiscordWebhook } from './discordWebhook';

export class LogWatcher {
  private events: LogEvent[] = [];
  private watchers: FSWatcher[] = [];
  private discord: DiscordWebhook;
  private serverPath: string;
  private offsets: Map<string, number> = new Map();
  private scumLogOffset = 0;
  private lastPlayerCount = 0;

  constructor(serverPath: string, discord: DiscordWebhook) {
    this.serverPath = serverPath;
    this.discord = discord;
    if (serverPath) this.startWatching();
  }

  startWatching(): void {
    const logsPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
    if (fs.existsSync(logsPath)) {
      const watcher = watch(path.join(logsPath, '*.log'), {
        persistent: true, ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 300 },
      });
      watcher.on('add', (fp) => this.handleFileAdd(fp));
      watcher.on('change', (fp) => this.handleFileChange(fp));
      this.watchers.push(watcher);
    }

    // Watch SCUM.log for BattlEye events (connect/disconnect)
    const scumLog = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
    if (fs.existsSync(scumLog)) {
      this.scumLogOffset = fs.statSync(scumLog).size;
      const sw = watch(scumLog, { persistent: true, ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 200 } });
      sw.on('change', () => this.handleScumLogChange());
      sw.on('add', () => this.handleScumLogChange());
      this.watchers.push(sw);
    }
  }

  private async handleFileAdd(filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size === 0) return;
      this.offsets.set(filePath, 0);
      await this.readFromOffset(filePath, 0, stat.size);
    } catch {}
  }

  private async handleFileChange(filePath: string): Promise<void> {
    try {
      const lastOffset = this.offsets.get(filePath) || 0;
      const stat = await fs.stat(filePath);
      if (stat.size <= lastOffset) return;
      await this.readFromOffset(filePath, lastOffset, stat.size);
    } catch {}
  }

  private async readFromOffset(filePath: string, start: number, end: number): Promise<void> {
    // Read raw bytes to detect encoding
    // Read first 4 bytes to detect UTF-16LE (SCUM server logs)
    const buf = Buffer.alloc(Math.min(end - start, 4));
    try {
      const fd = await fs.promises.open(filePath, 'r');
      await fd.read(buf, 0, buf.length, start);
      await fd.close();
    } catch {} // if read fails, treat as UTF-8

    const isUtf16 = buf.length >= 2 && buf[1] === 0x00;
    const encoding = isUtf16 ? 'utf16le' : 'utf-8';

    const stream = fs.createReadStream(filePath, {
      start,
      end: end - 1,
      encoding,
    });

    let data = '';
    for await (const chunk of stream) {
      data += chunk;
    }

    this.offsets.set(filePath, end);
    const lines = data.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      await this.processLine(filePath, line);
    }
  }

  /** Handle SCUM.log changes — detect player connect/disconnect for Discord */
  private async handleScumLogChange(): Promise<void> {
    try {
      const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
      const stat = fs.statSync(logPath);
      if (stat.size <= this.scumLogOffset) return;

      const readSize = Math.min(stat.size - this.scumLogOffset, 65536);
      const buf = Buffer.alloc(readSize);
      const fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
      fs.closeSync(fd);
      const encoding = buf[1] === 0 ? 'utf16le' : 'utf-8';
      const text = buf.toString(encoding);
      this.scumLogOffset = stat.size;

      for (const line of text.split('\n').filter(Boolean)) {
        // Player connected
        const cm = line.match(/Player #(\d+) (.+?) \((\d+\.\d+\.\d+\.\d+:\d+)\) connected/);
        if (cm) {
          const name = cm[2].trim();
          this.discord.sendLoginEvent(name, '').catch(() => {});
          this.addEvent('login', `**${name}** подключился к серверу (онлайн: ${this.lastPlayerCount})`);
          continue;
        }
        // Player disconnected
        const dm = line.match(/Player #(\d+) (.+?) disconnected/);
        if (dm) {
          const name = dm[2].trim();
          this.discord.sendLoginEvent(name, '').catch(() => {});
          this.addEvent('login', `**${name}** отключился от сервера (онлайн: ${this.lastPlayerCount})`);
          continue;
        }
        // Player count from Global Stats
        const gm = line.match(/Global Stats:.*?P:\s*(\d+)/);
        if (gm) this.lastPlayerCount = parseInt(gm[1], 10);
      }
    } catch {}
  }

  private addEvent(type: string, message: string): void {
    this.events.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type: type as any,
      message,
    });
    if (this.events.length > 2000) this.events = this.events.slice(-1000);
  }

  private async processLine(filePath: string, line: string): Promise<void> {
    const fileName = path.basename(filePath).toLowerCase();
    const event: LogEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type: 'system',
      message: line,
    };

    if (fileName.startsWith('admin')) {
      event.type = 'admin';
      this.discord.sendAdminLog(line);
    } else if (fileName.startsWith('chat')) {
      event.type = 'chat';
      const match = line.match(/\[(\d+)\](.+?):\s(.+)/);
      if (match) {
        this.discord.sendChatMessage(match[2].trim(), match[3]);
      }
    } else if (fileName.startsWith('login')) {
      event.type = 'login';
      const match = line.match(/LoginComm: Login: (.+?)\((\d+)\)/);
      if (match) {
        this.discord.sendLoginEvent(match[1].trim(), match[2]);
      }
    } else if (fileName.includes('vehicle')) {
      event.type = 'vehicle';
      this.discord.sendVehicleEvent(line);
    }

    this.events.push(event);
    if (this.events.length > 2000) {
      this.events = this.events.slice(-1000);
    }
  }

  getEvents(): LogEvent[] {
    return [...this.events];
  }

  getEventsByType(type: string): LogEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  stop(): void {
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
  }
}
