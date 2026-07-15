import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { watch, FSWatcher } from 'chokidar';
import { RconClient } from './rconClient';
import { WargmManager } from './wargmManager';
import { RatingManager } from './ratingManager';
import type { PackConfig, PluginsConfig, TeleportLocation, VipConfig, WargmCard, WargmSettings, WebPanelConfig, OnlinePlayer, AirdropCalibrationPoint } from './types';

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
  private cachedRconVehicles: any[] = [];
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
  private ratingManager: RatingManager | null = null;
  private pluginsConfig: PluginsConfig = {
    teleport: { enabled: true, locations: [] },
    vip: {
      enabled: true, players: [],
      starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
      dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
    },
    saveHome: { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0 },
    airdrop: {
      enabled: false,
      chestItem: 'Improvised_Metal_Chest',
      minItems: 3,
      maxItems: 8,
      cooldownMinutes: 60,
      autoDropEnabled: false,
      autoDropIntervalMinutes: 120,
      autoDropMinPlayers: 5,
    },
    rewards: {
      enabled: false,
      hourlyEnabled: true,
      hourlyGold: 10,
      hourlyMoney: 100,
      hourlyFame: 5,
      topEnabled: true,
      topIntervalDays: 10,
      topCount: 3,
      topGold: 100,
      topMoney: 1000,
      topFame: 50,
    },
    chatSender: 'AMUR bot',
    ratingBlacklist: [],
  };
  private pluginsSaveCallback: ((cfg: PluginsConfig) => void) | null = null;
  private itemsCache: string[] | null = null;
  private itemImagesMap: Record<string, string> = {};
  private chatOffsets = new Map<string, number>();
  private commandPoller: NodeJS.Timeout | null = null;
  private autoDropTimer: NodeJS.Timeout | null = null;
  private calibrationData: AirdropCalibrationPoint[] = [];
  private calibrationActive = false;
  private calibrationIndex = 0;
  private calibrationSteamId = '';
  private calibrationBusy = false;
  private readonly CALIBRATION_POINTS_COUNT = 125;
  private rewardTimer: NodeJS.Timeout | null = null;
  private rewardsDataPath = '';
  private lastHourlyReward: Record<string, number> = {};
  private lastTopRewardTime = 0;

  constructor(config: WebPanelConfig) {
    this.config = config;
    this.loadItemsCache();
    this.loadCalibrationData();
    setTimeout(() => this.loadItemImagesMap(), 0);
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

  private loadItemImagesMap(): void {
    const candidates = [
      path.join(process.cwd(), 'SCUM-Images', 'items'),
      path.join(process.cwd(), '..', 'SCUM-Images', 'items'),
      path.join(__dirname, '..', '..', 'SCUM-Images', 'items'),
      path.join(process.cwd(), 'resources', 'SCUM-Images', 'items'),
    ];
    let imagesDir = '';
    for (const p of candidates) { if (fs.existsSync(p)) { imagesDir = p; break; } }
    if (!imagesDir) { console.warn('[WebPanel] SCUM-Images/items not found'); return; }

    // Collect all image entries with their word-sets for scoring
    interface ImgEntry { key: string; url: string; words: string[] }
    const images: ImgEntry[] = [];
    const imgWordExtract = (rawName: string): string[] => {
      const w = new Set<string>();
      const cleaned = rawName.replace(/\.png$/i, '').replace(/^ico_/i, '');
      for (const token of cleaned.split('_')) {
        for (const sub of token.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split('_')) {
          if (sub.length >= 2) w.add(sub);
        }
      }
      return [...w];
    };
    const scan = (dir: string) => {
      let entries: string[];
      try { entries = fs.readdirSync(dir); } catch { return; }
      for (const name of entries) {
        const full = path.join(dir, name);
        try {
          if (fs.statSync(full).isDirectory()) { scan(full); }
          else if (name.toLowerCase().endsWith('.png')) {
            const key = name.replace(/\.png$/i, '').replace(/^ico_/i, '').toLowerCase();
            const rel = path.relative(imagesDir, full).replace(/\\/g, '/');
            images.push({ key, url: `/api/item-image/${rel}`, words: imgWordExtract(name) });
          }
        } catch {}
      }
    };
    scan(imagesDir);

    const toSnakeCase = (s: string) =>
      s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();

    const extractWords = (name: string): Set<string> => {
      const w = new Set<string>();
      for (const token of name.split('_')) {
        for (const sub of token.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split('_')) {
          if (sub.length >= 2) w.add(sub);
        }
      }
      return w;
    };

    // Score each image against the item, pick the best
    const bestMatch = (itemName: string): string | null => {
      const lower = itemName.toLowerCase();
      const snaked = toSnakeCase(itemName);
      const itemWords = extractWords(itemName);
      const itemWordArr = [...itemWords];

      let bestScore = 0;
      let best: string | null = null;

      for (const img of images) {
        // Exact match = instant win
        if (img.key === lower || img.key === snaked) return img.url;

        let matched = 0;
        for (const iw of itemWordArr) {
          if (img.words.includes(iw)) matched++;
        }
        if (matched === 0) continue;

        const matchRatio = matched / Math.max(itemWordArr.length, 1);
        const imgCoverage = matched / Math.max(img.words.length, 1);
        // Score formula: prefer high word coverage on both sides
        const score = matchRatio * 100 + imgCoverage * 50;
        if (score > bestScore) { bestScore = score; best = img.url; }
      }
      // Require at least 50% item word overlap
      return bestScore >= 50 ? best : null;
    };

    const map: Record<string, string> = {};
    for (const img of images) map[img.key] = img.url;

    if (this.itemsCache) {
      let matched = 0;
      for (const item of this.itemsCache) {
        const url = bestMatch(item);
        if (url) { map[item] = url; matched++; }
      }
      // Manual overrides for vehicles whose names don't match their icon filenames
    const manualOverrides: Record<string, string> = {
      'BPC_Barba': '/api/item-image/ICO_MotorBoat_01_A.png',
      'BPC_Laika': '/api/item-image/ICO_Laika.png',
      'BPC_Dirtbike': '/api/item-image/ICO_Motorcycle_01_A.png',
      'BPC_MountainBike': '/api/item-image/ICO_Bicycle_02_A.png',
      'BPC_CityBike': '/api/item-image/ICO_Bicycle_01_A.png',
    };
    for (const [key, url] of Object.entries(manualOverrides)) {
      if (!map[key]) map[key] = url;
    }
    // Match vehicle names against icons
    const allVehicles = ['BPC_WolfsWagen','BPC_Laika','BPC_Barba','BPC_Dirtbike','BPC_CityBike','BPC_MountainBike','BPC_Kinglet_Duster','BPC_Kinglet_Mariner','BPC_RIS','BPC_Dinghy','BPC_Cruiser','BPC_Tractor','BPC_SidecarBike','BPC_Rager'];
    for (const v of allVehicles) {
      if (!map[v]) { const url = bestMatch(v); if (url) map[v] = url; }
    }
    console.log(`[WebPanel] Images: ${images.length} files, ${matched}/${this.itemsCache.length} items matched (${Object.keys(map).length} map entries)`);
    } else {
      console.log(`[WebPanel] Images: ${images.length} files`);
    }
    this.itemImagesMap = map;
  }

  private generateCalibrationPoints(): { x: number; y: number; sector: string }[] {
    const MIN_X = -905000, MAX_X = 619000, MIN_Y = -905000, MAX_Y = 619000;
    const SPAN = MAX_X - MIN_X;
    const SECTOR_PX = 4096 / 5;
    const rowLabels = ['D', 'C', 'B', 'A', 'Z'];
    const colLabels = ['4', '3', '2', '1', '0'];
    const points: { x: number; y: number; sector: string }[] = [];
    const offsets = [
      [0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75],
    ];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const sectorLeft = c * SECTOR_PX;
        const sectorTop = r * SECTOR_PX;
        for (const [ox, oy] of offsets) {
          const px = sectorLeft + ox * SECTOR_PX;
          const py = sectorTop + oy * SECTOR_PX;
          const x = MAX_X - (px / 4096) * SPAN;
          const y = MIN_Y + (py / 4096) * SPAN;
          points.push({ x: Math.round(x), y: Math.round(y), sector: rowLabels[r] + colLabels[c] });
        }
      }
    }
    return points;
  }

  private get calibrationFilePath(): string {
    if (this.serverPath) {
      return path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'airdrop_calibration.json');
    }
    return path.join(process.cwd(), 'data', 'airdrop_calibration.json');
  }

  private loadCalibrationData(): void {
    try {
      const primary = this.calibrationFilePath;
      const fallback = path.join(process.cwd(), 'data', 'airdrop_calibration.json');
      let loaded = false;
      for (const fp of [primary, fallback]) {
        if (fs.existsSync(fp)) {
          const raw = fs.readFileSync(fp, 'utf-8');
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            this.calibrationData = data.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number');
            console.log(`[Airdrop] Loaded ${this.calibrationData.length} calibration points from ${fp}`);
            loaded = true;
            if (fp !== primary) {
              // Migrate to primary path
              this.saveCalibrationData();
            }
            break;
          }
        }
      }
      if (!loaded) this.calibrationData = [];
    } catch (e) {
      console.warn('[Airdrop] Failed to load calibration data:', e);
      this.calibrationData = [];
    }
  }

  private saveCalibrationData(): void {
    try {
      const fp = this.calibrationFilePath;
      fs.ensureDirSync(path.dirname(fp));
      fs.writeFileSync(fp, JSON.stringify(this.calibrationData, null, 2), 'utf-8');
      console.log(`[Airdrop] Saved ${this.calibrationData.length} calibration points to ${fp}`);
    } catch (e) {
      console.error('[Airdrop] Failed to save calibration data:', e);
    }
  }

  private findCalibrationZ(x: number, y: number): number | null {
    if (this.calibrationData.length === 0) return null;
    let best: AirdropCalibrationPoint | null = null;
    let bestDist = Infinity;
    for (const p of this.calibrationData) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    const maxDist = 100000 ** 2;
    if (best && bestDist <= maxDist) return best.z;
    return null;
  }

  setServices(sm: any, sc: any, sp: string): void {
    this.serverManager = sm;
    this.steamCmd = sc;
    this.serverPath = sp;
    if (sp) {
      this.loadCalibrationData();
      this.loadRewardsData();
    }
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
          try {
            const icoPaths = [
              path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
              path.join(process.cwd(), 'assets', 'icon.ico'),
              path.join(process.cwd(), 'resources', 'assets', 'icon.ico'),
            ];
            for (const p of icoPaths) {
              if (fs.existsSync(p)) {
                res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' });
                res.end(fs.readFileSync(p));
                return;
              }
            }
            res.writeHead(204);
            res.end();
          } catch { res.writeHead(204); res.end(); }
        } else if (url === '/api/login' && method === 'POST') {
          this.handleLogin(req, res);
        } else if (url.startsWith('/api/console') && method === 'GET') {
          this.handleConsoleSSE(req, res);
        } else if (url.startsWith('/api/chat') && method === 'GET') {
          this.handleChatSSE(req, res);
        } else if (url === '/api/items' && method === 'GET') {
          this.handleItems(res);
        } else if (url === '/api/item-images-map' && method === 'GET') {
          this.sendJson(res, this.itemImagesMap);
        } else if (url.startsWith('/api/item-image/') && method === 'GET') {
          this.serveItemImage(url.slice('/api/item-image/'.length), res);
        } else if (url.startsWith('/api/map-image/') && method === 'GET') {
          const variant = url.slice('/api/map-image/'.length);
          this.serveMapImage(variant, res);
        } else if (url === '/api/flags' && method === 'GET') {
          this.handleFlags(res);
        } else if (url === '/api/vehicles' && method === 'GET') {
          this.handleVehicles(res);
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
        } else if (url === '/api/update-stream' && method === 'GET') {
          this.handleUpdateStream(req, res);
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
        } else if (url.startsWith('/api/players/whois/') && method === 'GET') {
          const steamId = url.split('/')[4];
          this.handlePlayerWhois(steamId, res);
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
        } else if (url === '/api/plugins/airdrop' && method === 'GET') {
          this.sendJson(res, this.pluginsConfig.airdrop);
        } else if (url === '/api/plugins/airdrop' && method === 'POST') {
          this.handleSetAirdrop(req, res);
        } else if (url === '/api/plugins/airdrop/drop' && method === 'POST') {
          this.handleAirdropDrop(req, res);
        } else if (url === '/api/plugins/airdrop/calibrate/start' && method === 'POST') {
          this.handleCalibrateStart(req, res);
        } else if (url === '/api/plugins/airdrop/calibrate/record' && method === 'POST') {
          this.handleCalibrateRecord(req, res);
        } else if (url === '/api/plugins/airdrop/calibrate/skip' && method === 'POST') {
          this.handleCalibrateSkip(req, res);
        } else if (url === '/api/plugins/airdrop/calibrate/status' && method === 'GET') {
          this.handleCalibrateStatus(res);
        } else if (url === '/api/plugins/airdrop/calibrate/cancel' && method === 'POST') {
          this.handleCalibrateCancel(req, res);
        } else if (url === '/api/plugins/airdrop/calibrate/reset' && method === 'POST') {
          this.handleCalibrateReset(req, res);
        } else if (url === '/api/plugins/chat-sender' && method === 'GET') {
          this.sendJson(res, { sender: this.pluginsConfig.chatSender || 'AMUR bot' });
        } else if (url === '/api/plugins/chat-sender' && method === 'POST') {
          this.handleSetChatSender(req, res);
        } else if (url === '/api/plugins/rewards' && method === 'GET') {
          this.sendJson(res, this.pluginsConfig.rewards);
        } else if (url === '/api/plugins/rewards' && method === 'POST') {
          this.handleSetRewards(req, res);
        } else if (url === '/api/plugins/rewards/data' && method === 'GET') {
          this.handleRewardsData(res);
        } else if (url === '/api/plugins/rewards/status' && method === 'GET') {
          this.sendJson(res, { lastTopRewardTime: this.lastTopRewardTime });
        } else if (url === '/api/plugins/rating/blacklist' && method === 'GET') {
          this.sendJson(res, { blacklist: this.pluginsConfig.ratingBlacklist || [] });
        } else if (url === '/api/plugins/rating/blacklist' && method === 'POST') {
          this.handleSetBlacklist(req, res);
        } else if (url === '/api/rating/leaderboard' && method === 'GET') {
          this.handleRatingLeaderboard(res);
        } else if (url.match(/^\/api\/rating\/player\/(\d+)$/) && method === 'GET') {
          const steamId = url.match(/^\/api\/rating\/player\/(\d+)$/)![1];
          this.handleRatingPlayer(steamId, res);
        } else if (url === '/api/app/version' && method === 'GET') {
          this.handleAppVersion(res);
        } else if (url === '/api/app/check-update' && method === 'GET') {
          this.handleCheckAppUpdate(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.server.on('error', (err: any) => {
        this.server = null;
        reject(new Error(`Web Panel: ${err.message}`));
      });

      if (this.serverPath) {
        this.ratingManager = new RatingManager();
        this.ratingManager.init(this.serverPath);
      }
      this.server.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[WebPanel] Listening on http://0.0.0.0:${this.config.port}`);
        this.startConsoleWatcher();
        this.startCommandPoller();
        this.startAutoDropTimer();
        this.startRewardTimer();
        resolve();
      });
    });
  }

  private handleRatingLeaderboard(res: http.ServerResponse): void {
    if (!this.ratingManager) { this.sendJson(res, { error: 'Rating not initialized' }, 500); return; }
    const blacklist = this.pluginsConfig.ratingBlacklist || [];
    const leaderboard = this.ratingManager.getLeaderboard().filter(e => !blacklist.includes(e.steamId));
    const totalOnline = this.ratingManager.getTotalOnlineSeconds();
    this.sendJson(res, { leaderboard, totalOnlineSeconds: totalOnline });
  }

  private handleRatingPlayer(steamId: string, res: http.ServerResponse): void {
    if (!this.ratingManager) { this.sendJson(res, { error: 'Rating not initialized' }, 500); return; }
    const blacklist = this.pluginsConfig.ratingBlacklist || [];
    if (blacklist.includes(steamId)) {
      this.sendJson(res, { blacklisted: true, rank: 0, player: null });
      return;
    }
    const { rank, entry } = this.ratingManager.getPlayerRank(steamId);
    if (!entry) { this.sendJson(res, { error: 'Player not found in rating' }, 404); return; }
    this.sendJson(res, { rank, player: entry });
  }

  stop(): void {
    this.stopPlayersPoll();
    this.stopConsoleWatcher();
    this.stopCommandPoller();
    this.stopAutoDropTimer();
    this.stopRewardTimer();
    if (this.ratingManager) this.ratingManager.stop();
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

  private handleUpdateStream(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.config.username && this.config.password) {
      const qIdx = (req.url || '').indexOf('?');
      const params = new URLSearchParams(qIdx >= 0 ? (req.url || '').slice(qIdx + 1) : '');
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

    this.sendSSE(res, 'connected', 'Update stream connected');

    (async () => {
      try {
        if (!this.steamCmd) { this.sendSSE(res, 'error', 'SteamCMD not initialized'); res.end(); return; }
        if (this.serverPath) this.steamCmd.setServerPath(this.serverPath);
        const steamCmdPath = this.serverConfigProvider?.get().server.steamCmdPath || 'D:\\steamcmd';
        this.steamCmd.setSteamCmdPath(steamCmdPath);
        if (!fs.existsSync(path.join(steamCmdPath, 'steamcmd.exe'))) {
          this.sendSSE(res, 'error', `SteamCMD not found: ${path.join(steamCmdPath, 'steamcmd.exe')}`);
          res.end();
          return;
        }

        const result = await this.steamCmd.runUpdateWithDetailedProgress(
          (progress: any) => {
            this.sendSSE(res, 'progress', JSON.stringify(progress));
          },
        );
        this.sendSSE(res, 'done', result);
      } catch (e: any) {
        this.sendSSE(res, 'error', e.message || 'Update failed');
      }
      res.end();
    })();

    req.on('close', () => {});
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
    const players: OnlinePlayer[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // New format (v0.4.6): "PLAYER | Name | steam=765611... | upid=N | money=N | gold=N | (x, y, z)"
      const pipeMatch = trimmed.match(/^PLAYER\s*\|\s*(.+?)\s*\|\s*steam=(\d{17})\s*\|/i);
      if (pipeMatch) {
        const steamId = pipeMatch[2];
        const name = pipeMatch[1].trim();
        
        const moneyM = trimmed.match(/money=([\d.+-]+)/);
        const goldM = trimmed.match(/gold=([\d.+-]+)/);
        const posM = trimmed.match(/\(([\d.+-]+),\s*([\d.+-]+),\s*([\d.+-]+)\)/);
        
        players.push({
          steamId,
          name,
          connectedAt: new Date(),
          balance: moneyM ? parseFloat(moneyM[1]) : 0,
          gold: goldM ? parseFloat(goldM[1]) : 0,
          location: posM ? {
            x: parseFloat(posM[1]),
            y: parseFloat(posM[2]),
            z: parseFloat(posM[3]),
          } : undefined,
        });
        continue;
      }
      
      // Old format (legacy): "1. Name\nSteam: ..."
      const nameMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (nameMatch) {
        // For old format we push a placeholder and will enrich
        players.push({
          steamId: '',
          name: nameMatch[1].trim(),
          connectedAt: new Date(),
        });
        continue;
      }
      if (players.length > 0) {
        const last = players[players.length - 1];
        const steamMatch = trimmed.match(/Steam:\s*.+?\((\d{17})\)/);
        if (steamMatch) { last.steamId = steamMatch[1]; continue; }
        const locMatch = trimmed.match(/Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
        if (locMatch) { last.location = { x: parseFloat(locMatch[1]), y: parseFloat(locMatch[2]), z: parseFloat(locMatch[3]) }; continue; }
        const fameMatch = trimmed.match(/^Fame:\s*([\d.+-]+)/);
        if (fameMatch) { last.fame = parseFloat(fameMatch[1]); continue; }
        const balanceMatch = trimmed.match(/^Account balance:\s*([\d.+-]+)/);
        if (balanceMatch) { last.balance = parseFloat(balanceMatch[1]); continue; }
        const goldMatch = trimmed.match(/^Gold balance:\s*([\d.+-]+)/);
        if (goldMatch) { last.gold = parseFloat(goldMatch[1]); continue; }
      }
    }
    
    // Filter out old-format entries that never got a steamId
    const filtered = players.filter(p => p.steamId);
    console.log(`[WebPanel] ListPlayers parsed: ${filtered.length}/${players.length}`);
    return filtered;
  }

  private async handlePlayerDetails(steamId: string, res: http.ServerResponse): Promise<void> {
    const scumDb = require('./scumDatabase');
    const dbReader = new scumDb.ScumDatabaseReader(this.serverPath);
    try {
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
    } finally {
      dbReader.close();
    }
  }

  private async handlePlayerWhois(steamId: string, res: http.ServerResponse): Promise<void> {
    if (!this.rconClient || !this.rconClient.isConnected()) {
      this.sendJson(res, { success: false, error: 'RCON not connected' });
      return;
    }
    try {
      const result = await this.rconClient.sendCommand(`Whois ${steamId}`);
      if (!result.success || !result.response) {
        this.sendJson(res, { success: false, error: 'Whois command failed' });
        return;
      }
      const text = result.response;
      const whois: Record<string, any> = {};
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const kv = line.match(/^([^:]+):\s*(.+)$/);
        if (!kv) continue;
        const key = kv[1].trim().toLowerCase();
        const val = kv[2].trim();
        if (key === 'name') whois.name = val;
        else if (key === 'steam id' || key === 'steamid') whois.steamId = val;
        else if (key === 'fame') whois.fame = parseFloat(val) || 0;
        else if (key === 'money') whois.money = parseFloat(val) || 0;
        else if (key === 'gold') whois.gold = parseFloat(val) || 0;
        else if (key === 'kills') whois.kills = parseInt(val) || 0;
        else if (key === 'deaths') whois.deaths = parseInt(val) || 0;
        else if (key === 'k-d' || key === 'kd') whois.kd = parseFloat(val) || 0;
        else if (key.includes('puppet') && key.includes('kill')) whois.puppetKills = parseInt(val) || 0;
        else if (key.includes('headshot') || key.includes('head')) whois.headshotKills = parseInt(val) || 0;
        else if (key === 'playtime' || key === 'time played') whois.playtime = val;
        else if (key === 'squad') whois.squad = val;
        else if (key.includes('vehicle')) {
          if (!whois.vehicles) whois.vehicles = [];
          whois.vehicles.push(val);
        }
      }
      this.sendJson(res, { success: true, whois });
    } catch (e: any) {
      this.sendJson(res, { success: false, error: e.message });
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
        case 'showOtherPlayerInfo':
          command = `#ShowOtherPlayerInfo true ${steamId}`;
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
        case 'chat': {
          const colorMap: Record<string, string> = { White: '0', Red: '7', Green: '3', Blue: '2', Yellow: '4', Orange: '6' };
          const type = colorMap[params.color] || '4';
          command = `SendChat ${type} "${params.message}" ${steamId}`;
          break;
        }
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
              // Fresh ListPlayers lookup
              const listRes = await this.rconClient.sendCommand('ListPlayers');
              if (listRes.success && listRes.response) {
                const lines = listRes.response.split('\n');
                for (const line of lines) {
                  const trimmed = line.trim();
                  // New format: "PLAYER | Name | steam=76561198... | ... | (x, y, z)"
                  const pm = trimmed.match(new RegExp(`steam=${steamId}\\s*\\|[^|]*\\(([\\d.-]+),\\s*([\\d.-]+),\\s*([\\d.-]+)\\)`));
                  if (pm) { x = parseFloat(pm[1]); y = parseFloat(pm[2]); z = parseFloat(pm[3]); break; }
                  // Old format fallback
                  const steamMatch = trimmed.match(/Steam:\s*.+?\((\d{17})\)/);
                  if (steamMatch && steamMatch[1] === steamId) {
                    for (let j = 0; j < lines.length; j++) {
                      if (j === lines.indexOf(line)) continue;
                      const t = lines[j].trim();
                      if (t.match(/^\d+\.\s+\S/)) continue;
                      const locMatch = t.match(/Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
                      if (locMatch) { x = parseFloat(locMatch[1]); y = parseFloat(locMatch[2]); z = parseFloat(locMatch[3]); break; }
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
        case 'unstuck':
          command = `Unstuck ${steamId}`;
          break;
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

      // Get current values from Whois
      const whoisRes = await this.rconClient.sendCommand(`Whois ${steamId}`);
      console.log('[WebPanel] GiveCurrency Whois raw:', whoisRes.response);
      if (!whoisRes.success || !whoisRes.response) {
        return this.sendJson(res, { error: 'Whois command failed' }, 500);
      }

      let currentValue = 0;
      const lines = whoisRes.response.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const kv = line.match(/^([^:]+):\s*(.+)$/);
        if (!kv) continue;
        const key = kv[1].trim().toLowerCase();
        const val = kv[2].trim();
        console.log('[WebPanel] GiveCurrency Whois kv:', key, '=', val);
        if ((type === 'gold' && key === 'gold') ||
            (type === 'fame' && key === 'fame') ||
            (type === 'money' && key === 'money')) {
          currentValue = parseFloat(val) || 0;
        }
      }

      const newValue = Math.round(currentValue + amount);
      let currencyType: string;
      if (type === 'gold') currencyType = 'Gold';
      else if (type === 'fame') currencyType = 'Fame';
      else currencyType = 'Normal';
      const cmd = `#SetCurrencyBalance ${currencyType} ${newValue} ${steamId}`;
      console.log('[WebPanel] GiveCurrency:', { type, amount, currentValue, newValue, cmd });
      const r = await this.rconClient.sendCommand(cmd);
      console.log('[WebPanel] GiveCurrency result:', JSON.stringify(r));
      if (r.success) return this.sendJson(res, { success: true, response: `${currentValue} → ${newValue}` });
      this.sendJson(res, { error: r.response || 'Command failed' }, 500);
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

  private async handleSetAirdrop(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const cfg = JSON.parse(body);
      this.pluginsConfig.airdrop = cfg;
      if (this.pluginsSaveCallback) {
        this.pluginsSaveCallback(this.pluginsConfig);
      }
      this.sendJson(res, { success: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetChatSender(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { sender } = JSON.parse(body);
      this.pluginsConfig.chatSender = sender || 'AMUR bot';
      if (this.pluginsSaveCallback) {
        this.pluginsSaveCallback(this.pluginsConfig);
      }
      this.sendJson(res, { success: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleSetRewards(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const cfg = JSON.parse(body);
      this.pluginsConfig.rewards = cfg;
      if (this.pluginsSaveCallback) this.pluginsSaveCallback(this.pluginsConfig);
      this.sendJson(res, { success: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleRewardsData(res: http.ServerResponse): Promise<void> {
    const now = Date.now();
    const data: Record<string, { lastRewardTime: number; hoursPlayed: number }> = {};
    for (const [steamId, lastReward] of Object.entries(this.lastHourlyReward)) {
      const player = this.cachedPlayers.find(p => p.steamId === steamId);
      const sessionStart = this.ratingManager?.getSessionStart(steamId);
      let hoursPlayed = 0;
      if (sessionStart) {
        const sessionSec = (now - sessionStart) / 1000;
        const totalSec = this.ratingManager?.getPlayerTotalSeconds(steamId) || 0;
        hoursPlayed = Math.floor((totalSec + sessionSec) / 3600);
      }
      data[steamId] = { lastRewardTime: lastReward, hoursPlayed };
    }
    this.sendJson(res, data);
  }

  private async handleSetBlacklist(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { blacklist } = JSON.parse(body);
      this.pluginsConfig.ratingBlacklist = blacklist || [];
      if (this.pluginsSaveCallback) this.pluginsSaveCallback(this.pluginsConfig);
      this.sendJson(res, { success: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleAppVersion(res: http.ServerResponse): void {
    try {
      const { app } = require('electron');
      this.sendJson(res, { version: app.getVersion() });
    } catch {
      this.sendJson(res, { version: '2.1.0' });
    }
  }

  private async handleCheckAppUpdate(res: http.ServerResponse): Promise<void> {
    try {
      const { autoUpdater } = require('electron-updater');
      const result = await autoUpdater.checkForUpdates();
      if (!result) { this.sendJson(res, { available: false }); return; }
      this.sendJson(res, { available: true, version: result.updateInfo.version });
    } catch {
      this.sendJson(res, { available: false });
    }
  }

  private loadRewardsData(): void {
    if (!this.serverPath) return;
    this.rewardsDataPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'rewards_data.json');
    try {
      if (fs.existsSync(this.rewardsDataPath)) {
        const data = JSON.parse(fs.readFileSync(this.rewardsDataPath, 'utf-8'));
        this.lastHourlyReward = data.lastHourlyReward || {};
        this.lastTopRewardTime = data.lastTopRewardTime || 0;
      }
    } catch {}
  }

  private saveRewardsData(): void {
    if (!this.rewardsDataPath) return;
    try {
      fs.writeFileSync(this.rewardsDataPath, JSON.stringify({
        lastHourlyReward: this.lastHourlyReward,
        lastTopRewardTime: this.lastTopRewardTime,
      }, null, 2));
    } catch {}
  }

  private startRewardTimer(): void {
    if (this.rewardTimer) clearInterval(this.rewardTimer);
    this.rewardTimer = setInterval(() => this.checkRewards(), 60000);
  }

  private async checkRewards(): Promise<void> {
    if (!this.rconClient || !this.rconClient.isConnected()) return;
    const cfg = this.pluginsConfig.rewards;
    if (!cfg.enabled) return;
    const now = Date.now();

    // Hourly rewards
    if (cfg.hourlyEnabled) {
      for (const player of this.cachedPlayers) {
        if (!player.steamId || !player.name) continue;
        const lastReward = this.lastHourlyReward[player.steamId] || 0;
        const sessionStart = this.ratingManager?.getSessionStart(player.steamId);
        if (!sessionStart) continue;
        const totalSec = this.ratingManager?.getPlayerTotalSeconds(player.steamId) || 0;
        const elapsedHours = Math.floor(((now - sessionStart) / 1000 + totalSec) / 3600);
        const rewardedHours = Math.floor(lastReward ? (lastReward - sessionStart) / 3600000 + (this.ratingManager?.getPlayerTotalSeconds(player.steamId) || 0) / 3600 : 0);
        const hoursToReward = Math.max(0, elapsedHours - Math.floor(rewardedHours));
        if (hoursToReward >= 1) {
          const cmds: string[] = [];
          if (cfg.hourlyGold > 0) cmds.push(`#AddGold ${cfg.hourlyGold * hoursToReward} ${player.steamId}`);
          if (cfg.hourlyMoney > 0) cmds.push(`#AddMoney ${cfg.hourlyMoney * hoursToReward} ${player.steamId}`);
          if (cfg.hourlyFame > 0) cmds.push(`#AddFame ${cfg.hourlyFame * hoursToReward} ${player.steamId}`);
          for (const cmd of cmds) {
            await this.rconClient.sendCommand(cmd);
          }
          this.lastHourlyReward[player.steamId] = now;
          this.saveRewardsData();
        }
      }
    }

    // Top players reward
    if (cfg.topEnabled && cfg.topCount > 0) {
      const elapsedDays = (now - this.lastTopRewardTime) / 86400000;
      if (this.lastTopRewardTime === 0 || elapsedDays >= cfg.topIntervalDays) {
        const leaderboard = this.ratingManager?.getLeaderboard() || [];
        const blacklist = this.pluginsConfig.ratingBlacklist || [];
        const filtered = leaderboard.filter(e => !blacklist.includes(e.steamId));
        const topPlayers = filtered.slice(0, cfg.topCount);
        if (topPlayers.length > 0) {
          for (let i = 0; i < topPlayers.length; i++) {
            const p = topPlayers[i];
            const multiplier = cfg.topCount - i;
            const cmds: string[] = [];
            if (cfg.topGold > 0) cmds.push(`#AddGold ${cfg.topGold * multiplier} ${p.steamId}`);
            if (cfg.topMoney > 0) cmds.push(`#AddMoney ${cfg.topMoney * multiplier} ${p.steamId}`);
            if (cfg.topFame > 0) cmds.push(`#AddFame ${cfg.topFame * multiplier} ${p.steamId}`);
            for (const cmd of cmds) {
              await this.rconClient.sendCommand(cmd);
            }
          }
          const names = topPlayers.map(p => p.playerName).join(', ');
          await this.rconClient.sendCommand(`SendChat 2 "🏆 Награда топ-${topPlayers.length}: ${names}"`);
          this.lastTopRewardTime = now;
          this.saveRewardsData();
        }
      }
    }
  }

  private async handleAirdropDrop(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (!this.rconClient || !this.rconClient.isConnected()) {
        this.sendJson(res, { error: 'RCON not connected' }, 500);
        return;
      }
      const body = await this.readBody(req);
      const { x: inputX, y: inputY, z: inputZ, steamId } = JSON.parse(body);
      const cfg = this.pluginsConfig.airdrop;
      if (!cfg.enabled) {
        this.sendJson(res, { error: 'Airdrop module disabled' }, 500);
        return;
      }

      // If steamId provided, get player location
      let dropX: number, dropY: number, dropZ: number;
      if (steamId) {
        const player = this.cachedPlayers.find(p => p.steamId === steamId);
        if (!player || !player.location) {
          this.sendJson(res, { error: 'Player not found or location unknown' }, 500);
          return;
        }
        dropX = Math.round(player.location.x);
        dropY = Math.round(player.location.y);
        dropZ = Math.round(player.location.z);
      } else {
        dropX = Math.round(inputX);
        dropY = Math.round(inputY);
        dropZ = inputZ !== undefined && inputZ !== null ? Math.round(inputZ) :
                this.findCalibrationZ(inputX, inputY) ?? 20000;
      }

      // Pick random items from itemsCache (iditem.txt)
      const cache = this.itemsCache || [];
      const count = cfg.minItems + Math.floor(Math.random() * (cfg.maxItems - cfg.minItems + 1));
      const items: string[] = [];
      for (let i = 0; i < count && cache.length > 0; i++) {
        items.push(cache[Math.floor(Math.random() * cache.length)]);
      }

      // SpawnInventoryFullOf with keyed coords after items (SCUM-RCON v0.4.5+)
      const cmd = `SpawnInventoryFullOf ${cfg.chestItem} 1 ${items.join(' ')} x=${dropX} y=${dropY} z=${dropZ}`;
      console.log(`[Airdrop] ${cmd}`);
      const result = await this.rconClient.sendCommand(cmd);
      if (!result.success) {
        this.sendJson(res, { error: result.error || 'Spawn failed' }, 500);
        return;
      }

      // Calculate grid sector
      const MIN_X = -905000, MAX_X = 619000, MIN_Y = -905000, MAX_Y = 619000;
      const span = MAX_X - MIN_X;
      const px = 4096 - ((dropX - MIN_X) / span) * 4096;
      const py = ((MAX_Y - dropY) / span) * 4096;
      const gridStep = 4096 / 5;
      const col = Math.min(4, Math.floor(px / gridStep));
      const row = Math.min(4, Math.floor(py / gridStep));
      const rowLabels = ['D', 'C', 'B', 'A', 'Z'];
      const colLabels = ['4', '3', '2', '1', '0'];
      const sector = rowLabels[row] + colLabels[col];

      // Notify
      const randItem = items.length > 0 ? items[Math.floor(Math.random() * items.length)].replace(/_/g, ' ') : 'лутом';
      const msgs = [
        `🎁| ВНИМАНИЕ! В секторе ${sector} сброшен тайник с лутом! Бегом на поиски!`,
        `🎁| ТРЕВОГА! В секторе ${sector} приземлился тайник с припасами! Кто первый найдёт?`,
        `🎁| В секторе ${sector} сброшен тайник! Говорят, там есть ${randItem}!`,
        `🎁| СЛУХ! В секторе ${sector} замечен тайник с ценным лутом! Проверьте свои карты!`,
      ];
      this.rconClient.sendCommand(`SendChat 2 "${msgs[Math.floor(Math.random() * msgs.length)]}"`).catch(() => {});

      this.sendJson(res, { success: true, sector, items, count, x: dropX, y: dropY, z: dropZ });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  // ---- Airdrop calibration

  private calibrateTeleportToPoint(idx: number): void {
    const points = this.generateCalibrationPoints();
    if (idx < 0 || idx >= points.length) return;
    const p = points[idx];
    const cmd = `Teleport ${p.x} ${p.y} 0 ${this.calibrationSteamId}`;
    console.log(`[Airdrop] Calibrate ${idx + 1}/${points.length}: ${cmd}`);
    this.rconClient!.sendCommand(cmd).catch(() => {});
  }

  private withCalibrationLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.calibrationBusy) return Promise.reject(new Error('Calibration busy'));
    this.calibrationBusy = true;
    return fn().finally(() => { this.calibrationBusy = false; });
  }

  private async handleCalibrateStart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    return this.withCalibrationLock(async () => {
      try {
        if (!this.rconClient || !this.rconClient.isConnected()) {
          this.sendJson(res, { error: 'RCON not connected' }, 500); return;
        }
        const body = await this.readBody(req);
        const { steamId } = JSON.parse(body);
        if (!steamId || steamId.length < 10) {
          this.sendJson(res, { error: 'Invalid SteamID' }, 500); return;
        }
        this.calibrationActive = true;
        this.calibrationIndex = 0;
        this.calibrationSteamId = steamId;
        this.calibrateTeleportToPoint(0);
        this.sendJson(res, { success: true, index: 0, total: this.CALIBRATION_POINTS_COUNT });
      } catch (e: any) { this.sendJson(res, { error: e.message }, 500); }
    }).catch((e) => this.sendJson(res, { error: e.message }, 500));
  }
  
  private async handleCalibrateRecord(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    return this.withCalibrationLock(async () => {
      try {
        if (!this.calibrationActive) {
          this.sendJson(res, { error: 'Calibration not active' }, 500); return;
        }
        const points = this.generateCalibrationPoints();
        const idx = this.calibrationIndex;
        if (idx >= points.length) {
          this.calibrationActive = false;
          this.sendJson(res, { error: 'All points calibrated' }, 500); return;
        }
        const point = points[idx];
        const player = this.cachedPlayers.find(p => p.steamId === this.calibrationSteamId);
        if (!player || !player.location) {
          this.sendJson(res, { error: 'Player not found or location unknown. Are you online?' }, 500); return;
        }
        const z = Math.round(player.location.z);
        this.calibrationData = this.calibrationData.filter(p => !(Math.abs(p.x - point.x) < 1000 && Math.abs(p.y - point.y) < 1000));
        this.calibrationData.push({ x: point.x, y: point.y, z, sector: point.sector });
        this.saveCalibrationData();
  
        const nextIdx = idx + 1;
        if (nextIdx >= points.length) {
          this.calibrationActive = false;
          this.sendJson(res, { success: true, done: true, index: nextIdx, total: points.length, z });
          return;
        }
        this.calibrationIndex = nextIdx;
        this.calibrateTeleportToPoint(nextIdx);
        this.sendJson(res, { success: true, done: false, index: nextIdx, total: points.length, z });
      } catch (e: any) { this.sendJson(res, { error: e.message }, 500); }
    }).catch((e) => this.sendJson(res, { error: e.message }, 500));
  }
  
  private async handleCalibrateSkip(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    return this.withCalibrationLock(async () => {
      try {
        if (!this.calibrationActive) {
          this.sendJson(res, { error: 'Calibration not active' }, 500); return;
        }
        const points = this.generateCalibrationPoints();
        const nextIdx = this.calibrationIndex + 1;
        if (nextIdx >= points.length) {
          this.calibrationActive = false;
          this.sendJson(res, { success: true, done: true, index: nextIdx, total: points.length });
          return;
        }
        this.calibrationIndex = nextIdx;
        this.calibrateTeleportToPoint(nextIdx);
        this.sendJson(res, { success: true, done: false, index: nextIdx, total: points.length });
      } catch (e: any) { this.sendJson(res, { error: e.message }, 500); }
    }).catch((e) => this.sendJson(res, { error: e.message }, 500));
  }

  private handleCalibrateStatus(res: http.ServerResponse): void {
    try {
      const points = this.generateCalibrationPoints();
      const savedSet = new Set(this.calibrationData.map(p => `${Math.round(p.x / 1000)},${Math.round(p.y / 1000)}`));
      let calibratedCount = 0;
      for (const p of points) {
        if (savedSet.has(`${Math.round(p.x / 1000)},${Math.round(p.y / 1000)}`)) calibratedCount++;
      }
      this.sendJson(res, {
        active: this.calibrationActive,
        currentIndex: this.calibrationIndex,
        total: points.length,
        calibratedCount,
        totalSaved: this.calibrationData.length,
        points: this.calibrationData,
      });
    } catch (e: any) { this.sendJson(res, { error: e.message }, 500); }
  }

  private async handleCalibrateCancel(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      this.calibrationActive = false;
      this.calibrationIndex = 0;
      this.calibrationSteamId = '';
      this.sendJson(res, { success: true });
    } catch (e: any) { this.sendJson(res, { error: e.message }, 500); }
  }

  private async handleCalibrateReset(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      this.calibrationData = [];
      this.calibrationActive = false;
      this.calibrationIndex = 0;
      this.calibrationSteamId = '';
      this.saveCalibrationData();
      this.sendJson(res, { success: true });
    } catch (e: any) { this.sendJson(res, { error: e.message }, 500); }
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

  private handleChatSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.config.username && this.config.password) {
      const qIdx = (req.url || '').indexOf('?');
      const params = new URLSearchParams(qIdx >= 0 ? (req.url || '').slice(qIdx + 1) : '');
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
    this.sendSSE(res, 'connected', 'Chat stream connected');

    // Send initial history from chat logs
    if (this.serverPath) {
      const logsPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
      if (fs.existsSync(logsPath)) {
        const files = fs.readdirSync(logsPath).filter(f => f.toLowerCase().startsWith('chat') && f.endsWith('.log'));
        if (files.length > 0) {
          const latest = files.map(f => ({ name: f, time: fs.statSync(path.join(logsPath, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time)[0].name;
          const fp = path.join(logsPath, latest);
          const stat = fs.statSync(fp);
          if (stat.size > 0) {
            const readSize = Math.min(stat.size, 16384);
            const readOffset = Math.max(0, stat.size - readSize);
            // Ensure even offset for UTF-16LE
            const alignedOffset = readOffset % 2 === 0 ? readOffset : readOffset + 1;
            const actualReadSize = Math.min(stat.size - alignedOffset, readSize);
            const buf = Buffer.alloc(actualReadSize);
            const fd = fs.openSync(fp, 'r');
            fs.readSync(fd, buf, 0, actualReadSize, alignedOffset);
            fs.closeSync(fd);
            const enc = buf[1] === 0 ? 'utf16le' : 'utf-8';
            let raw = buf.toString(enc);
            if (raw.charCodeAt(0) === 0xFEFF || raw.charCodeAt(0) === 0xFFFE) raw = raw.slice(1);
            raw = raw.replace(/\r/g, '');
            const parsed = raw.split('\n').filter(Boolean).slice(-50).map(line => this.parseChatLine(line)).filter(Boolean);
            this.sendSSE(res, 'init', JSON.stringify(parsed));
          }
        }
      }
    }

    // Poll for new chat messages
    const pollTimer = setInterval(() => {
      if (!this.serverPath) return;
      const logsPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
      if (!fs.existsSync(logsPath)) return;
      const files = fs.readdirSync(logsPath).filter(f => f.toLowerCase().startsWith('chat') && f.endsWith('.log'));
      if (files.length === 0) return;
      const latest = files.map(f => ({ name: f, time: fs.statSync(path.join(logsPath, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time)[0].name;
      const fp = path.join(logsPath, latest);
      try {
        const stat = fs.statSync(fp);
        let offset: number = this.chatOffsets.get(fp) ?? -1;
        const isNewFile = offset === -1;
        if (isNewFile) offset = 0;
        if (stat.size > offset) {
          const buf = Buffer.alloc(stat.size - offset);
          const fd = fs.openSync(fp, 'r');
          fs.readSync(fd, buf, 0, buf.length, offset);
          fs.closeSync(fd);
          this.chatOffsets.set(fp, stat.size);
          const enc = buf[1] === 0 ? 'utf16le' : 'utf-8';
          let text = buf.toString(enc);
          if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) text = text.slice(1);
          text = text.replace(/\r/g, '');
          text.split('\n').filter(Boolean).forEach(line => {
            const parsed = this.parseChatLine(line);
            if (parsed) {
              this.sendSSE(res, 'chat', JSON.stringify(parsed));
              this.handleChatCommand(parsed);
            } else this.sendSSE(res, 'raw', line);
          });
        }
      } catch {}
    }, 1000);

    req.on('close', () => {
      clearInterval(pollTimer);
    });
  }

  private handleChatCommand(parsed: any): void {
    if (!parsed || !parsed.message || !this.ratingManager || !this.rconClient || !this.rconClient.isConnected()) return;
    const msg = parsed.message.trim().toLowerCase();
    const steamId = parsed.steamId;
    if ((msg === '!rating' || msg === '!rank' || msg === '!рейтинг') && steamId) {
      const blacklist = this.pluginsConfig.ratingBlacklist || [];
      if (blacklist.includes(steamId)) {
        this.rconClient.sendCommand(`SendChat 4 "Вы не участвуете в рейтинге." ${steamId}`);
        return;
      }
      const { rank, entry } = this.ratingManager.getPlayerRank(steamId);
      if (entry) {
        const hours = this.ratingManager.formatPlayTime(entry.playTimeSeconds);
        const totalPlayers = this.ratingManager.getLeaderboard().filter(e => !blacklist.includes(e.steamId)).length;
        let reply = `[Рейтинг] #${rank}/${totalPlayers} | Онлайн: ${hours} | Деньги: ${entry.money} | Золото: ${entry.gold} | Слава: ${entry.fame}`;
        if (rank === 1) reply = '🏆 ' + reply;
        this.rconClient.sendCommand(`SendChat 4 "${reply}" ${steamId}`);
      } else {
        this.rconClient.sendCommand(`SendChat 4 "Вы ещё не в рейтинге. Подождите обновления данных." ${steamId}`);
      }
    }
  }

  private parseChatLine(line: string): any {
    const m = line.match(/'(\d+):([^(]+)\(\d+\)'[^']*'([^:]+):\s*([^']+)/);
    if (m) return { steamId: m[1], playerName: m[2].trim(), channel: m[3].trim(), message: m[4].trim(), timestamp: new Date().toISOString() };
    return null;
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

  private startCommandPoller(): void {
    this.commandPoller = setInterval(() => this.pollChatCommands(), 2000);
  }

  private stopCommandPoller(): void {
    if (this.commandPoller) { clearInterval(this.commandPoller); this.commandPoller = null; }
  }

  private startAutoDropTimer(): void {
    this.stopAutoDropTimer();
    this.autoDropTimer = setInterval(() => this.checkAutoDrop(), 30000);
  }

  private stopAutoDropTimer(): void {
    if (this.autoDropTimer) { clearInterval(this.autoDropTimer); this.autoDropTimer = null; }
  }

  private stopRewardTimer(): void {
    if (this.rewardTimer) { clearInterval(this.rewardTimer); this.rewardTimer = null; }
  }

  private lastAutoDropTime = 0;

  private async checkAutoDrop(): Promise<void> {
    const cfg = this.pluginsConfig.airdrop;
    if (!cfg.enabled || !cfg.autoDropEnabled || !this.rconClient || !this.rconClient.isConnected()) return;
    const minPlayers = cfg.autoDropMinPlayers || 1;
    if (this.cachedPlayers.length < minPlayers) return;
    const intervalMs = (cfg.autoDropIntervalMinutes || 120) * 60 * 1000;
    const now = Date.now();
    if (now - this.lastAutoDropTime < intervalMs) return;
    this.lastAutoDropTime = now;

    try {
      // Pick random calibration point, or random coords if none
      let x: number, y: number;
      if (this.calibrationData.length > 0) {
        const p = this.calibrationData[Math.floor(Math.random() * this.calibrationData.length)];
        x = p.x;
        y = p.y;
      } else {
        const MIN_X = -905000, MAX_X = 619000, MIN_Y = -905000, MAX_Y = 619000;
        x = MIN_X + Math.random() * (MAX_X - MIN_X);
        y = MIN_Y + Math.random() * (MAX_Y - MIN_Y);
      }

      const cache = this.itemsCache || [];
      const count = cfg.minItems + Math.floor(Math.random() * (cfg.maxItems - cfg.minItems + 1));
      const items: string[] = [];
      for (let i = 0; i < count && cache.length > 0; i++) {
        items.push(cache[Math.floor(Math.random() * cache.length)]);
      }

      const calZ = this.findCalibrationZ(x, y);
      const z = calZ !== null ? calZ : 20000;
      const rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
      const cmd = `SpawnInventoryFullOf ${cfg.chestItem} 1 ${items.join(' ')} x=${rx} y=${ry} z=${rz}`;
      console.log(`[Airdrop] Auto-drop: ${cmd}`);
      const result = await this.rconClient.sendCommand(cmd);
      if (result.success) {
        // Calculate sector
        const MIN_X = -905000, MAX_X = 619000, MIN_Y = -905000, MAX_Y = 619000;
        const span = MAX_X - MIN_X;
        const px = 4096 - ((rx - MIN_X) / span) * 4096;
        const py = ((MAX_Y - ry) / span) * 4096;
        const gridStep = 4096 / 5;
        const col = Math.min(4, Math.floor(px / gridStep));
        const row = Math.min(4, Math.floor(py / gridStep));
        const sector = ['D', 'C', 'B', 'A', 'Z'][row] + ['4', '3', '2', '1', '0'][col];
        const randItem = items.length > 0 ? items[Math.floor(Math.random() * items.length)].replace(/_/g, ' ') : 'лутом';
        const autoMsgs = [
          `🎁| ВНИМАНИЕ! В секторе ${sector} сброшен тайник с лутом! Бегом на поиски!`,
          `🎁| ТРЕВОГА! В секторе ${sector} приземлился тайник с припасами! Кто первый найдёт?`,
          `🎁| В секторе ${sector} сброшен тайник! Говорят, там есть ${randItem}!`,
          `🎁| СЛУХ! В секторе ${sector} замечен тайник с ценным лутом! Проверьте свои карты!`,
        ];
        this.rconClient.sendCommand(`SendChat 2 "${autoMsgs[Math.floor(Math.random() * autoMsgs.length)]}"`).catch(() => {});
        console.log(`[Airdrop] Auto-drop OK at ${rx},${ry},${rz} sector ${sector} (${items.length} items)`);
      } else {
        console.warn(`[Airdrop] Auto-drop failed: ${result.error}`);
      }
    } catch (e: any) {
      console.error('[Airdrop] Auto-drop error:', e.message);
    }
  }

  private pollChatCommands(): void {
    if (!this.serverPath || !this.ratingManager || !this.rconClient || !this.rconClient.isConnected()) return;
    try {
      const logsPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
      if (!fs.existsSync(logsPath)) return;
      const files = fs.readdirSync(logsPath).filter(f => f.toLowerCase().startsWith('chat') && f.endsWith('.log'));
      if (files.length === 0) return;
      const latest = files.map(f => ({ name: f, time: fs.statSync(path.join(logsPath, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time)[0].name;
      const fp = path.join(logsPath, latest);
      const stat = fs.statSync(fp);
      let offset: number = this.chatOffsets.get(fp) ?? -1;
      const isNewFile = offset === -1;
      if (isNewFile) offset = 0;
      if (stat.size > offset) {
        const buf = Buffer.alloc(stat.size - offset);
        const fd = fs.openSync(fp, 'r');
        fs.readSync(fd, buf, 0, buf.length, offset);
        fs.closeSync(fd);
        this.chatOffsets.set(fp, stat.size);
        const enc = buf[1] === 0 ? 'utf16le' : 'utf-8';
        let text = buf.toString(enc);
        if (text.charCodeAt(0) === 0xFEFF || text.charCodeAt(0) === 0xFFFE) text = text.slice(1);
        text = text.replace(/\r/g, '');
        text.split('\n').filter(Boolean).forEach(line => {
          const parsed = this.parseChatLine(line);
          if (parsed) this.handleChatCommand(parsed);
        });
      }
    } catch {}
  }

  private broadcastLine(line: string): void {
    for (const client of this.sseClients) this.sendSSE(client.res, 'line', line);
  }

  private parsePlayerEvents(line: string): void {
    // HandlePossessedBy: steamId, charId, playerName
    const possessedMatch = line.match(/APrisoner::HandlePossessedBy:\s*(\d+),\s*\d+,\s*(.+)/);
    if (possessedMatch) {
      const steamId = possessedMatch[1];
      const playerName = possessedMatch[2].trim();
      this.onlinePlayers.set(steamId, { steamId, name: playerName, connectedAt: new Date() });
      if (this.ratingManager) this.ratingManager.playerConnected(steamId, playerName);
      return;
    }

    // 'IP SteamID:PlayerName(CharID)' logged in
    const loginMatch = line.match(/LogSCUM:.+'[\d.]+ (\d+):([^(]+)\(\d+\)'.+logged in/);
    if (loginMatch) {
      const steamId = loginMatch[1];
      const name = loginMatch[2].trim();
      this.onlinePlayers.set(steamId, { steamId, name, connectedAt: new Date() });
      if (this.ratingManager) this.ratingManager.playerConnected(steamId, name);
      return;
    }

    // 'IP SteamID:PlayerName(CharID)' logged out
    const logoutMatch = line.match(/LogSCUM:.+'[\d.]+ (\d+):([^(]+)\(\d+\)'.+logged out/);
    if (logoutMatch) {
      const steamId = logoutMatch[1];
      this.onlinePlayers.delete(steamId);
      if (this.ratingManager) this.ratingManager.playerDisconnected(steamId);
      return;
    }

    // Prisoner logging out: PlayerName (SteamID) — may have Warning: prefix
    const altLogout = line.match(/(?:Warning:\s*)?Prisoner logging out:\s*([^(]+)\s*\((\d+)\)/);
    if (altLogout) {
      const steamId = altLogout[2];
      this.onlinePlayers.delete(steamId);
      if (this.ratingManager) this.ratingManager.playerDisconnected(steamId);
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
    if (!this.rconClient || !this.rconClient.isConnected()) return;

    try {
      const result = await this.rconClient.sendCommand('ListPlayers');
      if (result.success && result.response) {
        this.cachedPlayers = this.parseListPlayersOutput(result.response);
        if (this.ratingManager) {
          const onlineIds = new Set(this.cachedPlayers.map(p => p.steamId).filter(Boolean));
          for (const p of this.cachedPlayers) {
            if (p.steamId) {
              this.ratingManager.ensurePlayer(p.steamId, p.name);
              this.ratingManager.updateEconomy(p.steamId, p.balance || 0, p.gold || 0, p.fame || 0);
            }
          }
          // Close sessions for players no longer online
          for (const [sid] of this.ratingManager.getActiveSessions()) {
            if (!onlineIds.has(sid)) this.ratingManager.playerDisconnected(sid);
          }
        }
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

  private serveItemImage(relPath: string, res: http.ServerResponse): void {
    const decoded = decodeURIComponent(relPath.replace(/\+/g, ' '));
    // Prevent directory traversal
    const safe = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidates = [
      path.join(process.cwd(), 'SCUM-Images', 'items', safe),
      path.join(process.cwd(), '..', 'SCUM-Images', 'items', safe),
      path.join(__dirname, '..', '..', 'SCUM-Images', 'items', safe),
      path.join(process.cwd(), 'resources', 'SCUM-Images', 'items', safe),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const ext = path.extname(p).toLowerCase();
          const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
          res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
          res.end(fs.readFileSync(p));
          return;
        }
      } catch {}
    }
    res.writeHead(404);
    res.end('Not found');
  }

  private serveMapImage(variant: string, res: http.ServerResponse): void {
    const variantMap: Record<string, string> = {
      'basic': 'islandmap.jpg',
      'grey': 'islandmapgrey.jpg',
      'orange': 'islandmaporange.jpg',
    };
    const filename = variantMap[variant];
    if (!filename) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const candidates = [
      path.join(process.cwd(), 'SCUM-Images', 'map', filename),
      path.join(process.cwd(), '..', 'SCUM-Images', 'map', filename),
      path.join(__dirname, '..', '..', 'SCUM-Images', 'map', filename),
      path.join(process.cwd(), 'resources', 'SCUM-Images', 'map', filename),
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': stat.size,
            'Cache-Control': 'public, max-age=86400',
          });
          const stream = fs.createReadStream(p);
          stream.pipe(res);
          stream.on('error', () => { res.writeHead(500); res.end('Error'); });
          return;
        }
      } catch {}
    }
    res.writeHead(404);
    res.end('Not found');
  }

  private async handleVehicles(res: http.ServerResponse): Promise<void> {
    const scumDb = require('./scumDatabase');
    const dbReader = new scumDb.ScumDatabaseReader(this.serverPath);
    try {
      if (!this.serverPath) {
        this.sendJson(res, { vehicles: [] });
        return;
      }

      // Use RCON as primary source when connected
      if (this.rconClient && this.rconClient.isConnected()) {
        try {
          const rconRes = await this.rconClient.sendCommand('ListSpawnedVehicles');
          if (rconRes.success && rconRes.response) {
            console.log('[WebPanel] ListSpawnedVehicles raw:', rconRes.response);
            this.cachedRconVehicles = this.parseListSpawnedVehicles(rconRes.response);
            console.log('[WebPanel] Parsed RCON vehicles:', JSON.stringify(this.cachedRconVehicles).slice(0, 3000));
            const vehicles = this.cachedRconVehicles.map((rv: any) => ({
              entityId: rv.entityId,
              asset: rv.asset,
              x: rv.x,
              y: rv.y,
              ownerName: rv.ownerName || null,
              customName: (rv.customName && rv.customName !== '-') ? rv.customName : null,
            }));
            console.log('[WebPanel] Sending', vehicles.length, 'RCON vehicles to frontend, first has ownerName:', vehicles[0]?.ownerName);
            this.sendJson(res, { vehicles });
            return;
          } else {
            console.log('[WebPanel] ListSpawnedVehicles: no response, falling back to DB');
          }
        } catch (e: any) {
          console.error('[WebPanel] ListSpawnedVehicles error:', e.message);
        }
      }

      // Fallback: DB vehicles (no owner info)
      let rows = dbReader.getVehicles() || [];
      console.log('[WebPanel] Sending', rows.length, 'DB vehicles to frontend (RCON unavailable)');
      this.sendJson(res, { vehicles: rows || [] });
    } catch (e: any) {
      this.sendJson(res, { error: e.message, vehicles: [] }, 500);
    } finally {
      dbReader.close();
    }
  }
  
  private parseListSpawnedVehicles(output: string): any[] {
    const vehicles: any[] = [];
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      let entityId: number | null = null;
      let asset: string | null = null;
      let ownerName: string | null = null;
      let ownerDbId: number | null = null;
      let x: number | null = null;
      let y: number | null = null;
      let customName: string | null = null;

      // Format: "ID 12345678 | BPC_Asset | name: CustomName | (x, y, z) | owner: PlayerName (db id 999)"
      const idM = line.match(/ID\s+(\d+)/i);
      if (idM) entityId = parseInt(idM[1]);

      // Asset is the first token after "ID xxx |" before " | name:"
      const assetM = line.match(/\|\s+([A-Z][A-Za-z_0-9]+)\s+\|/);
      if (assetM) asset = assetM[1];

      // Custom name: "name: something |"
      const nameM = line.match(/\|\s*name:\s*([^|]+?)\s*\|/i);
      if (nameM) customName = nameM[1].trim();

      // Position: (x, y, z)
      const posM = line.match(/\(?([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)?/);
      if (posM) { x = parseFloat(posM[1]); y = parseFloat(posM[2]); }

      // Owner: "owner: PlayerName (db id 999)" or "owner: -"
      const ownerM = line.match(/\|\s*owner:\s*(.+?)(?:\s*\(db id (\d+)\))?\s*$/i);
      if (ownerM) {
        const raw = ownerM[1].trim();
        ownerName = (raw === '-' || raw === 'None' || raw === '') ? null : raw;
        if (ownerM[2]) ownerDbId = parseInt(ownerM[2]);
      }

      // Fallback: "| OwnerName (db id ...)" without "owner:" prefix
      if (!ownerM) {
        const o2 = line.match(/\|\s*(.+?)\s*\(db id (\d+)\)\s*$/i);
        if (o2) {
          const r = o2[1].trim();
          ownerName = (r === '-' || r === 'None' || r === '') ? null : r;
          ownerDbId = parseInt(o2[2]);
        }
      }

      if (entityId || asset) {
        vehicles.push({ entityId, asset, ownerName, ownerDbId, x, y, customName });
      }
    }
    return vehicles;
  }
  
  private async handleFlags(res: http.ServerResponse): Promise<void> {
    const scumDb = require('./scumDatabase');
    const dbReader = new scumDb.ScumDatabaseReader(this.serverPath);
    try {
      if (!this.serverPath) {
        this.sendJson(res, { flags: [] });
        return;
      }
      const rows = dbReader.getFlags();
      this.sendJson(res, { flags: rows || [] });
    } catch (e: any) {
      this.sendJson(res, { error: e.message, flags: [] }, 500);
    } finally {
      dbReader.close();
    }
  }
}
