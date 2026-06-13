import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { watch, FSWatcher } from 'chokidar';
import { RconClient } from './rconClient';
import { WargmManager } from './wargmManager';
import type { PackConfig, PluginsConfig, TeleportLocation, VipConfig, WargmCard, WargmSettings, WebPanelConfig, OnlinePlayer } from './types';

interface SSEClient {
  id: number;
  res: http.ServerResponse;
}

export class WebPanel {
  private server: http.Server | null = null;
  private config: WebPanelConfig;
  private sseClients: SSEClient[] = [];
  private sseId = 0;
  private consoleWatcher: FSWatcher | null = null;
  private consoleOffset = 0;
  private tokens = new Set<string>();
  private serverManager: any = null;
  private steamCmd: any = null;
  private serverPath = '';
  private serverConfigProvider: { get: () => any; save: (cfg: any) => boolean } | null = null;
  private rconClient: RconClient | null = null;
  private onlinePlayers = new Map<string, OnlinePlayer>();
  private playersPollInterval: NodeJS.Timeout | null = null;
  private cachedPlayers: OnlinePlayer[] = [];
  private rconCredentials: { host: string; port: number; password: string } | null = null;
  private readonly PLAYERS_POLL_INTERVAL = 3000;
  private packsConfig: PackConfig = {
    starter: { enabled: true, items: [], cooldownHours: 0 },
    daily: { enabled: true, items: [], cooldownHours: 24 },
  };
  private packsSaveCallback: ((cfg: PackConfig) => void) | null = null;
  private cooldownProvider: {
    getCooldowns: () => Record<string, number>;
    resetCooldown: (steamId: string, packType?: 'starter' | 'daily') => void;
  } | null = null;
  private wargmManager: WargmManager | null = null;
  private pluginsConfig: PluginsConfig = {
    teleport: { enabled: true, locations: [] },
    vip: {
      enabled: true, players: [],
      starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
      dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
    },
    saveHome: { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0 },
  };
  private pluginsSaveCallback: ((cfg: PluginsConfig) => void) | null = null;
  private itemsCache: string[] | null = null;

  constructor(config: WebPanelConfig) {
    this.config = config;
    this.loadItemsCache();
  }

  private loadItemsCache(): void {
    let asar: any;
    try { asar = require('asar'); } catch {}
    const paths = [
      path.join(process.cwd(), 'iditem.txt'),
      path.join(__dirname, '..', '..', 'iditem.txt'),
      path.join(process.cwd(), 'resources', 'iditem.txt'),
    ];
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          this.itemsCache = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          console.log(`[WebPanel] Loaded ${this.itemsCache.length} items from ${p}`);
          return;
        }
      } catch {}
    }
    // Fallback: read from asar
    try {
      const asarPath = path.join(process.cwd(), 'resources', 'app.asar');
      if (fs.existsSync(asarPath)) {
        const content = fs.readFileSync(asar.getFileInfo(asarPath, '/iditem.txt') ? asar.extractFile(asarPath, '/iditem.txt') : '');
        if (content) {
          this.itemsCache = content.toString().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          console.log(`[WebPanel] Loaded ${this.itemsCache.length} items from asar`);
          return;
        }
      }
    } catch {}
    console.warn('[WebPanel] iditem.txt not found');
    this.itemsCache = [];
  }

  setServices(sm: any, sc: any, sp: string): void {
    this.serverManager = sm;
    this.steamCmd = sc;
    this.serverPath = sp;
  }

  setServerConfigProvider(provider: { get: () => any; save: (cfg: any) => boolean }): void {
    this.serverConfigProvider = provider;
  }

  setRconClient(client: RconClient): void {
    this.rconClient = client;
  }

  setPacksConfig(cfg: PackConfig): void {
    this.packsConfig = cfg;
  }

  setPacksSaveCallback(cb: (cfg: PackConfig) => void): void {
    this.packsSaveCallback = cb;
  }

  setPackCooldownProvider(provider: { getCooldowns: () => Record<string, number>; resetCooldown: (steamId: string, packType?: 'starter' | 'daily') => void }): void {
    this.cooldownProvider = provider;
  }

  setPluginsConfig(cfg: PluginsConfig): void {
    this.pluginsConfig = cfg;
  }

  setPluginsSaveCallback(cb: (cfg: PluginsConfig) => void): void {
    this.pluginsSaveCallback = cb;
  }

  setWargmManager(mgr: WargmManager): void {
    this.wargmManager = mgr;
  }

  updateConfig(cfg: WebPanelConfig): void {
    const wasRunning = this.server !== null;
    if (wasRunning) this.stop();
    this.config = cfg;
    if (wasRunning && cfg.enabled) this.start().catch((e) => console.error('[WebPanel]', e.message));
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve();
    this.tokens.clear();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '/';
        const method = req.method || 'GET';

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        if (url === '/' && method === 'GET') {
          this.serveIndex(res);
        } else if (url === '/favicon.ico' && method === 'GET') {
          // Return empty 204 for favicon to avoid 401 errors
          res.writeHead(204);
          res.end();
        } else if (url === '/api/login' && method === 'POST') {
          this.handleLogin(req, res);
        } else if (url.startsWith('/api/console') && method === 'GET') {
          this.handleConsoleSSE(req, res);
        } else if (url === '/api/items' && method === 'GET') {
          this.handleItems(res);
        } else if (!this.authenticated(req)) {
          this.sendJson(res, { error: 'Unauthorized' }, 401);
        } else if (url === '/api/status' && method === 'GET') {
          this.handleStatus(res);
        } else if (url === '/api/start' && method === 'POST') {
          this.handleStart(res);
        } else if (url === '/api/stop' && method === 'POST') {
          this.handleStop(res);
        } else if (url === '/api/restart' && method === 'POST') {
          this.handleRestart(res);
        } else if (url === '/api/update' && method === 'POST') {
          this.handleUpdate(res);
        } else if (url === '/api/update-manual' && method === 'POST') {
          this.handleUpdateManual(res);
        } else if (url === '/api/config' && method === 'GET') {
          this.handleGetConfig(res);
        } else if (url === '/api/config' && method === 'POST') {
          this.handleSetConfig(req, res);
        } else if (url === '/api/check-path' && method === 'GET') {
          this.handleCheckPath(req, res);
        } else if (url === '/api/rcon/connect' && method === 'POST') {
          this.handleRconConnect(req, res);
        } else if (url === '/api/rcon/disconnect' && method === 'POST') {
          this.handleRconDisconnect(res);
        } else if (url === '/api/rcon/command' && method === 'POST') {
          this.handleRconCommand(req, res);
        } else if (url === '/api/rcon/status' && method === 'GET') {
          this.handleRconStatus(res);
        } else if (url === '/api/players' && method === 'GET') {
          this.handleOnlinePlayers(res);
        } else if (url.startsWith('/api/players/') && method === 'GET') {
          // /api/players/:steamId - get player details
          const steamId = url.split('/')[3];
          this.handlePlayerDetails(steamId, res);
        } else if (url === '/api/players/action' && method === 'POST') {
          this.handlePlayerAction(req, res);
        } else if (url === '/api/players/give-currency' && method === 'POST') {
          this.handleGiveCurrency(req, res);
        } else if (url === '/api/packs' && method === 'GET') {
          this.sendJson(res, this.packsConfig);
        } else if (url === '/api/packs' && method === 'POST') {
          this.handleSetPacks(req, res);
        } else if (url === '/api/packs/give' && method === 'POST') {
          this.handleGivePack(req, res);
        } else if (url === '/api/packs/cooldowns' && method === 'GET') {
          this.handleGetCooldowns(res);
        } else if (url === '/api/packs/cooldowns/reset' && method === 'POST') {
          this.handleResetCooldown(req, res);
        } else if (url === '/api/plugins/teleport' && method === 'GET') {
          this.sendJson(res, this.pluginsConfig.teleport);
        } else if (url === '/api/plugins/teleport' && method === 'POST') {
          this.handleSetTeleport(req, res);
        } else if (url === '/api/plugins/vip' && method === 'GET') {
          this.sendJson(res, this.pluginsConfig.vip);
        } else if (url === '/api/plugins/vip' && method === 'POST') {
          this.handleSetVip(req, res);
        } else if (url === '/api/plugins/savehome' && method === 'GET') {
          this.sendJson(res, this.pluginsConfig.saveHome);
        } else if (url === '/api/plugins/savehome' && method === 'POST') {
          this.handleSetSaveHome(req, res);
        } else if (url === '/api/wargm/settings' && method === 'GET') {
          this.handleWargmGetSettings(res);
        } else if (url === '/api/wargm/settings' && method === 'POST') {
          this.handleWargmSaveSettings(req, res);
        } else if (url === '/api/wargm/cards' && method === 'GET') {
          this.handleWargmGetCards(res);
        } else if (url === '/api/wargm/cards' && method === 'POST') {
          this.handleWargmSaveCard(req, res);
        } else if (url.match(/^\/api\/wargm\/cards\/(\d+)$/) && method === 'DELETE') {
          const id = parseInt(url.match(/^\/api\/wargm\/cards\/(\d+)$/)![1]);
          this.handleWargmDeleteCard(id, res);
        } else if (url.match(/^\/api\/wargm\/cards\/(\d+)\/duplicate$/) && method === 'POST') {
          const id = parseInt(url.match(/^\/api\/wargm\/cards\/(\d+)\/duplicate$/)![1]);
          this.handleWargmDuplicateCard(id, res);
        } else if (url === '/api/wargm/test' && method === 'POST') {
          this.handleWargmTest(req, res);
        } else if (url.match(/^\/api\/wargm\/check\/(\d+)$/) && method === 'POST') {
          const steamId = url.match(/^\/api\/wargm\/check\/(\d+)$/)![1];
          this.handleWargmCheck(steamId, res);
        } else if (url === '/api/wargm/export' && method === 'GET') {
          this.handleWargmExport(res);
        } else if (url === '/api/wargm/import' && method === 'POST') {
          this.handleWargmImport(req, res);
        } else if (url.match(/^\/api\/wargm\/deliveries\/(\d+)$/) && method === 'GET') {
          const steamId = url.match(/^\/api\/wargm\/deliveries\/(\d+)$/)![1];
          this.handleWargmDeliveries(steamId, res);
        } else if (url === '/api/wargm/debug/operations' && method === 'POST') {
          this.handleWargmDebugOperations(req, res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.server.on('error', (err: any) => {
        this.server = null;
        reject(new Error(`Web Panel: ${err.message}`));
      });

      this.server.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[WebPanel] Listening on http://0.0.0.0:${this.config.port}`);
        this.startConsoleWatcher();
        resolve();
      });
    });
  }

  stop(): void {
    this.stopPlayersPoll();
    this.stopConsoleWatcher();
    this.sseClients.forEach((c) => c.res.end());
    this.sseClients = [];
    this.tokens.clear();
    this.rconCredentials = null;
    this.cachedPlayers = [];
    if (this.server) {
      try { this.server.close(); } catch {}
      this.server = null;
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private authenticated(req: http.IncomingMessage): boolean {
    // Skip auth if no credentials configured
    if (!this.config.username && !this.config.password) return true;
    // Skip auth if RCON is already connected (used from main app)
    if (this.rconClient && this.rconClient.isConnected()) return true;
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return false;
    return this.tokens.has(auth.slice(7));
  }

  private async handleLogin(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { username, password } = JSON.parse(body);
      console.log(`[WebPanel] Login attempt: username="${username}", expected="${this.config.username}"`);
      
      if (username === this.config.username && password === this.config.password) {
        const token = crypto.randomBytes(32).toString('hex');
        this.tokens.add(token);
        console.log(`[WebPanel] Login successful for user: ${username}`);
        this.sendJson(res, { token });
      } else {
        console.log(`[WebPanel] Login failed - password mismatch or wrong username`);
        this.sendJson(res, { error: 'Invalid credentials' }, 401);
      }
    } catch (e: any) {
      console.error(`[WebPanel] Login error:`, e.message);
      this.sendJson(res, { error: 'Bad request' }, 400);
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => data += chunk.toString());
      req.on('end', () => resolve(data));
      req.on('error', (err) => reject(err));
    });
  }

  private sendJson(res: http.ServerResponse, data: any, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private handleStatus(res: http.ServerResponse): void {
    try {
      const s = this.serverManager?.getStatus() || {
        running: false, pid: null, uptime: 0,
        players: 0, maxPlayers: 50, memoryUsage: 0,
      };
      this.sendJson(res, s);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleStart(res: http.ServerResponse): Promise<void> {
    try {
      await this.serverManager?.start();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleStop(res: http.ServerResponse): Promise<void> {
    try {
      await this.serverManager?.stop();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleRestart(res: http.ServerResponse): Promise<void> {
    try {
      await this.serverManager?.restart();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleUpdateManual(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.steamCmd) { this.sendJson(res, { error: 'SteamCMD not initialized' }, 500); return; }
      if (this.serverPath) this.steamCmd.setServerPath(this.serverPath);
      const steamCmdPath = this.serverConfigProvider?.get().server.steamCmdPath || 'D:\\steamcmd';
      this.steamCmd.setSteamCmdPath(steamCmdPath);
      if (!fs.existsSync(path.join(steamCmdPath, 'steamcmd.exe'))) {
        this.sendJson(res, { error: `SteamCMD не найден: ${path.join(steamCmdPath, 'steamcmd.exe')}` }, 500);
        return;
      }
      await this.steamCmd.manualUpdate();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleUpdate(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.steamCmd) {
        this.sendJson(res, { error: 'SteamCMD not initialized' }, 500);
        return;
      }
      if (this.serverPath) this.steamCmd.setServerPath(this.serverPath);

      const steamCmdPath = this.serverConfigProvider?.get().server.steamCmdPath || 'D:\\steamcmd';
      this.steamCmd.setSteamCmdPath(steamCmdPath);
      if (!fs.existsSync(path.join(steamCmdPath, 'steamcmd.exe'))) {
        this.sendJson(res, { error: `SteamCMD не найден: ${path.join(steamCmdPath, 'steamcmd.exe')}` }, 500);
        return;
      }

      const result = await this.steamCmd.updateServer();
      this.sendJson(res, { ok: true, result });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleGetConfig(res: http.ServerResponse): void {
    try {
      const cfg = this.serverConfigProvider?.get();
      this.sendJson(res, cfg || { error: 'No config provider' });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetConfig(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const cfg = JSON.parse(body);
      const ok = this.serverConfigProvider?.save(cfg);
      if (ok) {
        if (cfg.server?.steamCmdPath && this.steamCmd) {
          this.steamCmd.setSteamCmdPath(cfg.server.steamCmdPath);
        }
        if (cfg.server?.serverPath) {
          this.serverPath = cfg.server.serverPath;
          if (this.steamCmd) this.steamCmd.setServerPath(cfg.server.serverPath);
        }
        this.sendJson(res, { ok: true });
      } else {
        this.sendJson(res, { error: 'Failed to save config' }, 500);
      }
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleCheckPath(req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const urlObj = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
      const p = urlObj.searchParams.get('path') || '';
      this.sendJson(res, { exists: fs.existsSync(path.join(p, 'steamcmd.exe')) });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  // RCON handlers
  private async handleRconConnect(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { host, port, password } = JSON.parse(body);
      if (!this.rconClient) {
        this.sendJson(res, { error: 'RCON client not initialized' }, 500);
        return;
      }
      const result = await this.rconClient.connect(host, port, password);
      if (result.success) {
        this.rconCredentials = { host, port, password };
        this.startPlayersPoll();
      }
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleRconDisconnect(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.rconClient) {
        this.sendJson(res, { error: 'RCON client not initialized' }, 500);
        return;
      }
      await this.rconClient.disconnect();
      this.stopPlayersPoll();
      this.rconCredentials = null;
      this.cachedPlayers = [];
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleRconCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { command } = JSON.parse(body);
      if (!this.rconClient) {
        this.sendJson(res, { error: 'RCON client not initialized' }, 500);
        return;
      }
      const result = await this.rconClient.sendCommand(command);
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleRconStatus(res: http.ServerResponse): void {
    try {
      if (!this.rconClient) {
        this.sendJson(res, { connected: false, config: null });
        return;
      }
      this.sendJson(res, {
        connected: this.rconClient.isConnected(),
        config: this.rconClient.getConfig(),
      });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  // Players handlers
  private async handleOnlinePlayers(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.rconClient || !this.rconClient.isConnected()) {
        this.sendJson(res, { players: [] });
        return;
      }
      const result = await this.rconClient.sendCommand('ListPlayers');
      if (!result.success || !result.response) {
        this.sendJson(res, { players: [] });
        return;
      }
      const parsed = this.parseListPlayersOutput(result.response);
      const players = parsed.map(p => ({
        steamId: p.steamId,
        name: p.name,
        connectedAt: p.connectedAt.toISOString(),
        duration: Math.floor((Date.now() - p.connectedAt.getTime()) / 1000),
        location: p.location || null,
        fame: p.fame ?? null,
        balance: p.balance ?? null,
        gold: p.gold ?? null,
      }));
      // Also update cache
      this.cachedPlayers = parsed;
      this.sendJson(res, { players });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private parseListPlayersOutput(output: string): OnlinePlayer[] {
    console.log('[WebPanel] Parsing output:', output);
    const players: OnlinePlayer[] = [];
    const lines = output.split('\n');
    
    console.log(`[WebPanel] Total lines: ${lines.length}`);
    
    let currentPlayer: Partial<OnlinePlayer> | null = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      console.log(`[WebPanel] Processing line: "${trimmedLine}"`);
      
      // Match player name line: "1. Domo" or "1. PlayerName"
      const nameMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (nameMatch) {
        console.log(`[WebPanel] Found player name: ${nameMatch[1]}`);
        // Save previous player if exists
        if (currentPlayer && currentPlayer.steamId && currentPlayer.name) {
          console.log(`[WebPanel] Saving player: ${currentPlayer.name} (${currentPlayer.steamId})`);
          players.push({
            steamId: currentPlayer.steamId,
            name: currentPlayer.name,
            connectedAt: new Date(),
            location: currentPlayer.location,
            fame: currentPlayer.fame,
            balance: currentPlayer.balance,
            gold: currentPlayer.gold,
          });
        }
        // Start new player
        currentPlayer = { name: nameMatch[1].trim() };
        continue;
      }
      
      // Match Steam ID line: "Steam: Domo (76561198156375337)"
      const steamMatch = trimmedLine.match(/Steam:\s*.+?\((\d{17})\)/);
      if (steamMatch && currentPlayer) {
        console.log(`[WebPanel] Found Steam ID: ${steamMatch[1]}`);
        currentPlayer.steamId = steamMatch[1];
        continue;
      }

      // Match Location line: "Location: X=416015.906 Y=398587.781 Z=14909.489"
      const locMatch = trimmedLine.match(/Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
      if (locMatch && currentPlayer) {
        console.log(`[WebPanel] Found Location: X=${locMatch[1]} Y=${locMatch[2]} Z=${locMatch[3]}`);
        currentPlayer.location = {
          x: parseFloat(locMatch[1]),
          y: parseFloat(locMatch[2]),
          z: parseFloat(locMatch[3]),
        };
        continue;
      }

      // Match Fame line: "Fame: 1002"
      const fameMatch = trimmedLine.match(/^Fame:\s*([\d.+-]+)/);
      if (fameMatch && currentPlayer) {
        currentPlayer.fame = parseFloat(fameMatch[1]);
        continue;
      }

      // Match Account balance line: "Account balance: 10001"
      const balanceMatch = trimmedLine.match(/^Account balance:\s*([\d.+-]+)/);
      if (balanceMatch && currentPlayer) {
        currentPlayer.balance = parseFloat(balanceMatch[1]);
        continue;
      }

      // Match Gold balance line: "Gold balance: 1001"
      const goldMatch = trimmedLine.match(/^Gold balance:\s*([\d.+-]+)/);
      if (goldMatch && currentPlayer) {
        currentPlayer.gold = parseFloat(goldMatch[1]);
        continue;
      }
    }
    
    // Don't forget the last player
    if (currentPlayer && currentPlayer.steamId && currentPlayer.name) {
      console.log(`[WebPanel] Saving last player: ${currentPlayer.name} (${currentPlayer.steamId})`);
      players.push({
        steamId: currentPlayer.steamId,
        name: currentPlayer.name,
        connectedAt: new Date(),
        location: currentPlayer.location,
        fame: currentPlayer.fame,
        balance: currentPlayer.balance,
        gold: currentPlayer.gold,
      });
    }
    
    console.log(`[WebPanel] Total parsed players: ${players.length}`);
    return players;
  }

  private async handlePlayerDetails(steamId: string, res: http.ServerResponse): Promise<void> {
    try {
      // Get player info from database
      const scumDb = require('./scumDatabase');
      const dbReader = new scumDb.ScumDatabaseReader(this.serverPath);
      
      // Get basic player info
      const playerInfo = dbReader.getPlayerBySteamId(steamId);
      
      if (!playerInfo) {
        this.sendJson(res, { success: false, error: 'Player not found' });
        return;
      }
      
      // Get wallet info (normal and gold balance)
      const walletInfo = dbReader.getWallet(steamId);
      console.log('[WebPanel] Wallet info from DB:', JSON.stringify(walletInfo, null, 2));
      
      // Get attributes
      const attributes = dbReader.getAttributes(steamId);
      
      // Get skills
      const skills = dbReader.getSkills(steamId);
      
      // Get quick slots
      const quickSlots = dbReader.getQuickSlots(steamId);
      
      // Build comprehensive player data
      const playerData = {
        ...playerInfo,
        walletBalance: walletInfo?.walletBalance || playerInfo.walletBalance || 0,
        normalBalance: walletInfo?.normalBalance || 0,
        goldBalance: walletInfo?.goldBalance || 0,
        attributes: attributes || null,
        skills: skills || [],
        quickSlots: quickSlots || []
      };
      
      console.log('[WebPanel] Player details:', JSON.stringify(playerData, null, 2));
      
      this.sendJson(res, { 
        success: true,
        player: playerData
      });
    } catch (e: any) {
      console.error('[WebPanel] Error getting player details:', e);
      this.sendJson(res, { success: false, error: e.message }, 500);
    }
  }

  private async handlePlayerAction(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { steamId, action, params } = JSON.parse(body);
      
      if (!this.rconClient || !this.rconClient.isConnected()) {
        this.sendJson(res, { error: 'RCON not connected' }, 500);
        return;
      }

      let command = '';
      switch (action) {
        case 'setAttributes':
          command = `SetAttributes ${params.strength} ${params.dexterity} ${params.stamina} ${params.intellect} ${steamId}`;
          break;
        case 'godMode':
          command = `SetGodMode ${params.enabled ? 'true' : 'false'} ${steamId}`;
          break;
        case 'setImmortality':
          command = `SetImmortality ${params.enabled ? 'true' : 'false'} ${steamId}`;
          break;
        case 'showNamePlates':
          command = `#ShowNamePlates true ${steamId}`;
          break;
        case 'suicide':
          command = `Suicide ${steamId}`;
          break;
        case 'silence':
          command = `Silence ${steamId}`;
          break;
        case 'unsilence':
          command = `Unsilence ${steamId}`;
          break;
        case 'knockout':
          command = `Knockout ${params.seconds} ${steamId}`;
          break;
        case 'announce':
          command = `#Announce ${params.message}`;
          break;
        case 'notify':
          command = `#SendNotification ${params.type} 0 "${params.message}" ${steamId}`;
          break;
        case 'chat':
          command = `Say ${params.message}`;
          break;
        case 'scheduleCargoDrop': {
          const notSet = (v: any) => v === undefined || v === null || v === '' || v === false;
          let x = params.x, y = params.y, z = params.z;
          if (notSet(x) && notSet(y) && notSet(z)) {
            // Check cached players first
            const cached = this.cachedPlayers.find(p => p.steamId === steamId);
            if (cached?.location && !notSet(cached.location.z)) {
              x = cached.location.x;
              y = cached.location.y;
              z = cached.location.z;
            } else {
              // Fresh ListPlayers lookup (same approach as WARGM)
              const listRes = await this.rconClient.sendCommand('ListPlayers');
              if (listRes.success && listRes.response) {
                const lines = listRes.response.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  const trimmed = lines[i].trim();
                  const steamMatch = trimmed.match(/Steam:\s*.+?\((\d{17})\)/);
                  if (steamMatch && steamMatch[1] === steamId) {
                    for (let j = i + 1; j < lines.length; j++) {
                      const t = lines[j].trim();
                      if (t.match(/^\d+\.\s+\S/)) break;
                      const locMatch = t.match(/Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
                      if (locMatch) {
                        x = parseFloat(locMatch[1]);
                        y = parseFloat(locMatch[2]);
                        z = parseFloat(locMatch[3]);
                      }
                    }
                    break;
                  }
                }
              }
            }
          }
          if (notSet(x) || notSet(y) || notSet(z)) {
            this.sendJson(res, { error: 'Не удалось определить координаты игрока' }, 400);
            return;
          }
          command = `ScheduleWorldEvent BP_CargoDropEvent ${x} ${y} ${z}`;
          break;
        }
        case 'setAllSkills':
          await this.executeSetAllSkills(steamId, res);
          return;
        default:
          this.sendJson(res, { error: 'Unknown action' }, 400);
          return;
      }

      console.log(`[WebPanel] Executing command: ${command}`);
      const result = await this.rconClient.sendCommand(command);
      console.log(`[WebPanel] Command result:`, result);
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async executeSetAllSkills(steamId: string, res: http.ServerResponse): Promise<void> {
    if (!this.rconClient) {
      this.sendJson(res, { error: 'RCON not connected' }, 500);
      return;
    }
    const skillNames = [
      'Archery', 'Aviation', 'Awareness', 'Brawling',
      'Camouflage', 'Cooking', 'Demolition', 'Driving',
      'Endurance', 'Engineering', 'Farming', 'Handgun',
      'Medical', 'Motorcycling', 'Resistance', 'Rifles',
      'Running', 'Sniping', 'Stealth', 'Survival',
      'Tactics', 'Thievery', '"Melee Weapons"',
    ];

    for (const name of skillNames) {
      const command = `SetSkillLevel ${name} 4 ${steamId}`;
      await this.rconClient.sendCommand(command);
    }
    this.sendJson(res, { success: true, response: 'All skills set to max' });
  }

  private async handleGiveCurrency(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.rconClient || !this.rconClient.isConnected()) {
      this.sendJson(res, { error: 'RCON not connected' }, 500);
      return;
    }
    try {
      const body = await this.readBody(req);
      const { steamId, type, amount: rawAmount } = JSON.parse(body);
      if (!steamId || !type || !rawAmount || rawAmount <= 0) {
        this.sendJson(res, { error: 'Invalid parameters' }, 400);
        return;
      }
      const amount = Math.round(rawAmount);

      // Fetch current balance from fresh ListPlayers
      const listRes = await this.rconClient.sendCommand('ListPlayers');
      if (!listRes.success || !listRes.response) {
        this.sendJson(res, { error: 'Failed to query player data' }, 500);
        return;
      }

      let currentValue = 0;
      let found = false;
      const lines = listRes.response.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const steamMatch = trimmed.match(/Steam:\s*.+?\((\d{17})\)/);
        if (steamMatch && steamMatch[1] === steamId) {
          for (let j = i + 1; j < lines.length; j++) {
            const t = lines[j].trim();
            if (t.match(/^\d+\.\s+\S/)) break;
            if (type === 'money') {
              const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
              if (bm) { currentValue = parseFloat(bm[1]); found = true; }
            } else if (type === 'gold') {
              const gm = t.match(/^Gold balance:\s*([\d.+-]+)/);
              if (gm) { currentValue = parseFloat(gm[1]); found = true; }
            } else if (type === 'fame') {
              const fm = t.match(/^Fame:\s*([\d.+-]+)/);
              if (fm) { currentValue = parseFloat(fm[1]); found = true; }
            }
          }
          break;
        }
      }

      if (!found) {
        this.sendJson(res, { error: 'Player not found or offline' }, 400);
        return;
      }

      const newValue = Math.round((currentValue || 0) + amount);
      let command = '';
      if (type === 'fame') {
        command = `#SetFamePoints ${newValue} ${steamId}`;
      } else {
        const currencyType = type === 'gold' ? 'Gold' : 'Normal';
        command = `#SetCurrencyBalance ${currencyType} ${newValue} ${steamId}`;
      }

      const result = await this.rconClient.sendCommand(command);
      if (result.success) {
        this.sendJson(res, { success: true, response: `${currentValue} → ${newValue}` });
      } else {
        this.sendJson(res, { error: result.response || 'Command failed' }, 500);
      }
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetPacks(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const cfg = JSON.parse(body) as PackConfig;
      console.log('[WebPanel] handleSetPacks:', JSON.stringify(cfg).slice(0, 200));
      if (this.packsSaveCallback) {
        console.log('[WebPanel] Calling packsSaveCallback');
        this.packsSaveCallback(cfg);
      } else {
        console.warn('[WebPanel] packsSaveCallback is null!');
      }
      this.packsConfig = cfg;
      this.sendJson(res, { success: true });
    } catch (e: any) {
      console.error('[WebPanel] handleSetPacks error:', e.message);
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleGivePack(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.rconClient) {
      this.sendJson(res, { error: 'RCON not connected' }, 500);
      return;
    }
    try {
      const body = await this.readBody(req);
      const { steamId, packType } = JSON.parse(body);
      const pack = packType === 'daily' ? this.packsConfig.daily : this.packsConfig.starter;
      if (!pack || !pack.enabled || !pack.items.length) {
        this.sendJson(res, { error: 'Pack disabled or empty' }, 400);
        return;
      }
      const results: string[] = [];
      for (const item of pack.items) {
        const cmd = `SpawnItem ${item.itemId} ${item.amount} Location ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        results.push(`${item.itemId}x${item.amount}: ${r.success ? 'OK' : 'FAIL'}`);
      }
      this.sendJson(res, { success: true, results });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetTeleport(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const teleport = JSON.parse(body);
      this.pluginsConfig.teleport = teleport;
      if (this.pluginsSaveCallback) {
        this.pluginsSaveCallback(this.pluginsConfig);
      }
      this.sendJson(res, { success: true });
    } catch (e: any) {
      console.error('[WebPanel] handleSetTeleport error:', e.message);
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetVip(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const vip = JSON.parse(body) as VipConfig;
      this.pluginsConfig.vip = vip;
      if (this.pluginsSaveCallback) {
        this.pluginsSaveCallback(this.pluginsConfig);
      }
      this.sendJson(res, { success: true });
    } catch (e: any) {
      console.error('[WebPanel] handleSetVip error:', e.message);
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetSaveHome(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const saveHome = JSON.parse(body);
      this.pluginsConfig.saveHome = saveHome;
      if (this.pluginsSaveCallback) {
        this.pluginsSaveCallback(this.pluginsConfig);
      }
      this.sendJson(res, { success: true });
    } catch (e: any) {
      console.error('[WebPanel] handleSetSaveHome error:', e.message);
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleGetCooldowns(res: http.ServerResponse): void {
    try {
      if (!this.cooldownProvider) { this.sendJson(res, { cooldowns: {} }); return; }
      this.sendJson(res, { cooldowns: this.cooldownProvider.getCooldowns() });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleResetCooldown(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (!this.cooldownProvider) { this.sendJson(res, { error: 'No cooldown provider' }, 500); return; }
      const body = await this.readBody(req);
      const { steamId, packType } = JSON.parse(body);
      this.cooldownProvider.resetCooldown(steamId, packType || undefined);
      this.sendJson(res, { success: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleConsoleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.config.username && this.config.password) {
      const qIdx = (req.url || '').indexOf('?');
      const params = new URLSearchParams(
        qIdx >= 0 ? (req.url || '').slice(qIdx + 1) : '',
      );
      const queryToken = params.get('token');
      if (!queryToken || !this.tokens.has(queryToken)) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    this.sendSSE(res, 'connected', 'Console stream connected');

    if (this.serverPath) {
      const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
      if (fs.existsSync(logPath)) {
        const stat = fs.statSync(logPath);
        if (stat.size > 0) {
          const readSize = Math.min(stat.size, 65536);
          const buf = Buffer.alloc(readSize);
          const fd = fs.openSync(logPath, 'r');
          fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
          fs.closeSync(fd);
          const encoding = buf[1] === 0 ? 'utf16le' : 'utf-8';
          const text = buf.toString(encoding);
          text.split('\n').filter(Boolean).forEach((line) => this.sendSSE(res, 'line', line));
        }
      }
    }

    const client: SSEClient = { id: ++this.sseId, res };
    this.sseClients.push(client);

    req.on('close', () => {
      this.sseClients = this.sseClients.filter((c) => c.id !== client.id);
    });
  }

  private sendSSE(res: http.ServerResponse, event: string, data: string): void {
    try {
      res.write(`event: ${event}\ndata: ${data.replace(/\n/g, '\\n')}\n\n`);
    } catch {}
  }

  private startConsoleWatcher(): void {
    if (!this.serverPath) return;
    const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
    if (!fs.existsSync(logPath)) return;

    this.consoleOffset = fs.statSync(logPath).size;
    this.consoleWatcher = watch(logPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    this.consoleWatcher.on('change', () => {
      try {
        const stat = fs.statSync(logPath);
        if (stat.size <= this.consoleOffset) return;
        const buf = Buffer.alloc(stat.size - this.consoleOffset);
        const fd = fs.openSync(logPath, 'r');
        fs.readSync(fd, buf, 0, buf.length, this.consoleOffset);
        fs.closeSync(fd);
        const enc = buf[1] === 0 ? 'utf16le' : 'utf-8';
        const text = buf.toString(enc);
        this.consoleOffset = stat.size;
        text.split('\n').filter(Boolean).forEach((line) => {
          this.parsePlayerEvents(line);
          this.broadcastLine(line);
        });
      } catch {}
    });
  }

  private stopConsoleWatcher(): void {
    if (this.consoleWatcher) {
      this.consoleWatcher.close();
      this.consoleWatcher = null;
    }
  }

  private broadcastLine(line: string): void {
    for (const client of this.sseClients) this.sendSSE(client.res, 'line', line);
  }

  private parsePlayerEvents(line: string): void {
    // Parse player login
    const loginMatch = line.match(/HandlePossessedBy:\s*\d+,\s*\d+,\s*(.+)/);
    if (loginMatch) {
      const playerName = loginMatch[1].trim();
      // Extract SteamID from other patterns
      const steamIdMatch = line.match(/(\d{17})/);
      if (steamIdMatch) {
        const steamId = steamIdMatch[1];
        this.onlinePlayers.set(steamId, {
          steamId,
          name: playerName,
          connectedAt: new Date(),
        });
      }
      return;
    }

    // Alternative login pattern
    const altLogin = line.match(/LogSCUM:.+'\d+:([^(]+)\((\d{17})\)'.+logged in/);
    if (altLogin) {
      const name = altLogin[1].trim();
      const steamId = altLogin[2];
      this.onlinePlayers.set(steamId, {
        steamId,
        name,
        connectedAt: new Date(),
      });
      return;
    }

    // Parse player logout
    const logoutMatch = line.match(/LogSCUM:.+'\d+:([^(]+)\((\d{17})\)'.+logged out/);
    if (logoutMatch) {
      const steamId = logoutMatch[2];
      this.onlinePlayers.delete(steamId);
      return;
    }

    // Alternative logout pattern
    const altLogout = line.match(/Prisoner logging out:\s*([^(]+)\s*\((\d{17})\)/);
    if (altLogout) {
      const steamId = altLogout[2];
      this.onlinePlayers.delete(steamId);
    }
  }

  startPlayersPoll(): void {
    this.stopPlayersPoll();
    this.pollPlayers();
    this.playersPollInterval = setInterval(() => this.pollPlayers(), this.PLAYERS_POLL_INTERVAL);
  }

  stopPlayersPoll(): void {
    if (this.playersPollInterval) {
      clearInterval(this.playersPollInterval);
      this.playersPollInterval = null;
    }
  }

  private async pollPlayers(): Promise<void> {
    if (!this.rconClient) return;

    if (!this.rconClient.isConnected()) {
      if (this.rconCredentials) {
        console.log('[WebPanel] RCON disconnected, attempting reconnect...');
        const result = await this.rconClient.connect(
          this.rconCredentials.host,
          this.rconCredentials.port,
          this.rconCredentials.password,
        );
        if (!result.success) {
          console.error('[WebPanel] Reconnect failed:', result.error);
          return;
        }
        console.log('[WebPanel] Reconnected successfully');
      } else {
        return;
      }
    }

    try {
      const result = await this.rconClient.sendCommand('ListPlayers');
      if (result.success && result.response) {
        this.cachedPlayers = this.parseListPlayersOutput(result.response);
        console.log(`[WebPanel] pollPlayers: parsed ${this.cachedPlayers.length} players`);
      } else {
        console.log('[WebPanel] pollPlayers: ListPlayers returned no response');
      }
    } catch (e) {
      console.error('[WebPanel] Poll players error:', e);
    }
  }

  // WARGM handlers
  private handleWargmGetSettings(res: http.ServerResponse): void {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    this.sendJson(res, this.wargmManager.getSettings());
  }

  private async handleWargmSaveSettings(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    try {
      const body = await this.readBody(req);
      const settings = JSON.parse(body) as WargmSettings;
      this.wargmManager.saveSettings(settings);
      this.sendJson(res, { success: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleWargmGetCards(res: http.ServerResponse): void {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    this.sendJson(res, this.wargmManager.getCards());
  }

  private async handleWargmSaveCard(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    try {
      const body = await this.readBody(req);
      const card = JSON.parse(body) as WargmCard;
      const id = this.wargmManager.saveCard(card);
      this.sendJson(res, { success: true, id });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleWargmDeleteCard(id: number, res: http.ServerResponse): void {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    this.wargmManager.deleteCard(id);
    this.sendJson(res, { success: true });
  }

  private handleWargmDuplicateCard(id: number, res: http.ServerResponse): void {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    const newId = this.wargmManager.duplicateCard(id);
    this.sendJson(res, { success: !!newId, id: newId });
  }

  private async handleWargmTest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    try {
      const body = await this.readBody(req);
      const settings = JSON.parse(body) as WargmSettings;
      const result = await this.wargmManager.testConnection(settings);
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleWargmCheck(steamId: string, res: http.ServerResponse): Promise<void> {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    try {
      const settings = this.wargmManager.getSettings();
      const result = await this.wargmManager.processPlayer(settings, steamId);
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleWargmExport(res: http.ServerResponse): void {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    const json = this.wargmManager.exportCards();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="wargm_cards.json"' });
    res.end(json);
  }

  private async handleWargmImport(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    try {
      const body = await this.readBody(req);
      const { json } = JSON.parse(body);
      const result = this.wargmManager.importCards(json);
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleWargmDeliveries(steamId: string, res: http.ServerResponse): void {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    const deliveries = this.wargmManager.getDeliveriesBySteam(steamId);
    this.sendJson(res, deliveries);
  }

  private async handleWargmDebugOperations(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.wargmManager) { this.sendJson(res, { error: 'WARGM not initialized' }, 500); return; }
    try {
      const body = await this.readBody(req);
      const { steamId } = JSON.parse(body);
      const settings = this.wargmManager.getSettings();
      const result = await this.wargmManager.fetchRawOperations(settings, steamId);
      this.sendJson(res, result);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleItems(res: http.ServerResponse): void {
    this.sendJson(res, this.itemsCache || []);
  }

  private serveIndex(res: http.ServerResponse): void {
    try {
      const htmlPath = path.join(__dirname, 'webPanelUnified.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlContent);
    } catch (e: any) {
      res.writeHead(500);
      res.end('Error loading panel: ' + e.message);
    }
  }
}
