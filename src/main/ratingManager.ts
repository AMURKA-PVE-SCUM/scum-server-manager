import fs from 'fs';
import path from 'path';

export interface PlayerRating {
  steamId: string;
  playerName: string;
  playTimeSeconds: number;
  money: number;
  gold: number;
  fame: number;
  lastUpdated: string;
}

interface Session {
  steamId: string;
  playerName: string;
  startedAt: number;
}

export class RatingManager {
  private data: Map<string, PlayerRating> = new Map();
  private activeSessions: Map<string, Session> = new Map();
  private filePath: string = '';
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  init(serverPath: string): void {
    if (!serverPath) return;
    const dir = path.join(serverPath, 'SCUM', 'Saved', 'SaveFiles');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'rating_data.json');
    this.load();
    this.saveTimer = setInterval(() => this.save(), 30000);
  }

  stop(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.save();
  }

  private load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const arr: PlayerRating[] = JSON.parse(raw);
      this.data.clear();
      for (const r of arr) this.data.set(r.steamId, r);
    } catch {}
  }

  private save(): void {
    if (!this.dirty || !this.filePath) return;
    try {
      const arr = Array.from(this.data.values());
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
      this.dirty = false;
    } catch {}
  }

  ensurePlayer(steamId: string, playerName: string): void {
    if (!steamId) return;
    const existing = this.data.get(steamId);
    if (!existing) {
      this.data.set(steamId, {
        steamId, playerName, playTimeSeconds: 0, money: 0, gold: 0, fame: 0,
        lastUpdated: new Date().toISOString(),
      });
    } else if (existing.playerName !== playerName) {
      existing.playerName = playerName;
    }
    // Only start a session if not already active
    if (!this.activeSessions.has(steamId)) {
      this.activeSessions.set(steamId, { steamId, playerName, startedAt: Date.now() });
    }
  }

  playerConnected(steamId: string, playerName: string): void {
    this.ensurePlayer(steamId, playerName);
    // Always update session (fresh connect)
    this.activeSessions.set(steamId, { steamId, playerName, startedAt: Date.now() });
  }

  playerDisconnected(steamId: string): void {
    const session = this.activeSessions.get(steamId);
    if (!session) return;
    const duration = Math.round((Date.now() - session.startedAt) / 1000);
    this.activeSessions.delete(steamId);
    const entry = this.data.get(steamId);
    if (entry) {
      entry.playTimeSeconds += duration;
      entry.lastUpdated = new Date().toISOString();
      this.dirty = true;
    }
  }

  getActiveSessions(): Map<string, Session> {
    return this.activeSessions;
  }

  getSessionStart(steamId: string): number | null {
    const s = this.activeSessions.get(steamId);
    return s ? s.startedAt : null;
  }

  getPlayerTotalSeconds(steamId: string): number {
    return this.data.get(steamId)?.playTimeSeconds || 0;
  }

  updateEconomy(steamId: string, money: number, gold: number, fame: number): void {
    const entry = this.data.get(steamId);
    if (!entry) return;
    entry.money = money;
    entry.gold = gold;
    entry.fame = fame;
    entry.lastUpdated = new Date().toISOString();
    this.dirty = true;
  }

  getLeaderboard(): PlayerRating[] {
    return Array.from(this.data.values()).sort((a, b) => b.playTimeSeconds - a.playTimeSeconds);
  }

  getPlayerRank(steamId: string): { rank: number; entry: PlayerRating | null } {
    const leaderboard = this.getLeaderboard();
    const idx = leaderboard.findIndex(p => p.steamId === steamId);
    if (idx === -1) return { rank: -1, entry: null };
    return { rank: idx + 1, entry: leaderboard[idx] };
  }

  formatPlayTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}ч ${mins}м`;
    return `${mins}м`;
  }

  getTotalOnlineSeconds(): number {
    let total = 0;
    for (const e of this.data.values()) total += e.playTimeSeconds;
    return total;
  }
}
