import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { watch, FSWatcher } from 'chokidar';
import { ServerManager } from './serverManager';
import { FileManager } from './fileManager';
import { BackupManager } from './backupManager';
import { SteamCmd } from './steamCmd';
import { LogWatcher } from './logWatcher';
import { DiscordWebhook } from './discordWebhook';
import { FtpServer } from './ftpServer';
import { WebPanel } from './webPanel';
import { RconClient } from './rconClient';
import { WargmManager } from './wargmManager';
import { ScumDatabaseReader, initSqlJs } from './scumDatabase';
import { autoUpdater } from 'electron-updater';
import ElectronStore from 'electron-store';
import type { AppConfig } from './types';

process.on('uncaughtException', (err) => {
  try { fs.writeFileSync(path.join(__dirname, '..', '..', 'crash.log'), `[${new Date().toISOString()}] UNCAUGHT: ${err.stack || err.message}\n`, { flag: 'a' }); } catch {}
  console.error('[FATAL]', err);
});
process.on('unhandledRejection', (reason) => {
  try { fs.writeFileSync(path.join(__dirname, '..', '..', 'crash.log'), `[${new Date().toISOString()}] UNHANDLED: ${reason}\n`, { flag: 'a' }); } catch {}
  console.error('[FATAL]', reason);
});

app.commandLine.appendSwitch('disable-gpu');
if (app.isPackaged) { app.commandLine.appendSwitch('no-sandbox'); }

function detectServerPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'Server'),
    path.join(__dirname, '..', '..'), process.cwd(),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'SCUM', 'Server')] : []),
    ...(process.env.PROGRAMFILES ? [path.join(process.env.PROGRAMFILES, 'Steam', 'steamapps', 'common', 'SCUM Server')] : []),
    ...(process.env['PROGRAMFILES(X86)'] ? [path.join(process.env['PROGRAMFILES(X86)'], 'Steam', 'steamapps', 'common', 'SCUM Server')] : []),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'SCUM', 'Binaries', 'Win64', 'SCUMServer.exe'))) return dir;
  }
  return '';
}

function detectSteamCmdPath(): string {
  const candidates = [
    __dirname,
    path.join(__dirname, '..', '..'),
    process.cwd(),
    path.join(process.cwd(), 'bin', 'steam'),
    path.join(process.cwd(), 'steamCMD'),
    path.join(process.cwd(), '..', 'scumServerManager', 'bin', 'steam'),
    path.join(process.cwd(), '..', 'scumServerManager', 'steamCMD'),
    'D:\\steamcmd',
    'D:\\scumServerManager\\steamCMD',
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'steamcmd.exe'))) return dir;
    } catch {}
  }
  return '';
}

const store = new ElectronStore<AppConfig>({
  defaults: {
    server: {
      serverPath: '', steamCmdPath: '', serverPort: 2302, queryPort: 2502,
      maxPlayers: 50, fileOpenLog: true, noBattlEye: false, autoStart: false,
      autoRestart: false, restartSchedule: ['06:00', '12:00', '18:00', '00:00'],
      restartMode: 'specific', restartIntervalHours: 4, restartDays: [0, 1, 2, 3, 4, 5, 6],
      robotScheduleEnabled: false, robotEnableTime: '08:00', robotDisableTime: '22:00',
      robotEnableDays: [6], robotDisableDays: [1],
      robotEnableCommand: '#SetSectorScanEnabled True', robotDisableCommand: '#SetSectorScanEnabled False',
    },
    discord: { adminLogWebhook: '', chatWebhook: '', vehicleWebhook: '', loginWebhook: '', serverStatusWebhook: '', enabled: false },
    backup: { enabled: true, interval: 6, retention: 30, path: '' },
    theme: 'dark', language: 'ru',
    ftp: { enabled: false, port: 21, username: 'scum', password: 'scum123' },
    webPanel: { enabled: false, port: 8080, username: 'admin', password: 'scum' },
    rcon: { enabled: false, host: 'localhost', port: 28015, password: '' },
    packs: {
      starter: { enabled: true, items: [], cooldownHours: 0 },
      daily: { enabled: true, items: [], cooldownHours: 24 },
    },
    plugins: {
      teleport: { enabled: true, locations: [] },
      vip: {
        enabled: true,
        players: [],
        starterBonus: { items: [{ itemId: 'Apple', amount: 10 }], money: 1000, gold: 100, fame: 500 },
        dailyBonus: { items: [{ itemId: 'Apple', amount: 5 }], money: 500, gold: 50, fame: 200 },
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
    },
  },
  deserialize: (data: string): AppConfig => { if (data.charCodeAt(0) === 0xfeff) data = data.slice(1); return JSON.parse(data); },
});

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager;
let fileManager: FileManager;
let backupManager: BackupManager;
let steamCmd: SteamCmd;
let logWatcher: LogWatcher;
let discordWebhook: DiscordWebhook;
let scumDatabase: ScumDatabaseReader;
let restartScheduler: NodeJS.Timeout | null = null;
let consoleWatcher: FSWatcher | null = null;
let consoleOffset = 0;
const ftpServer = new FtpServer();
const webPanel = new WebPanel(store.store.webPanel);
const rconClient = new RconClient();
const wargmManager = new WargmManager();

function startRestartScheduler(): void {
  if (restartScheduler) clearInterval(restartScheduler);
  const cfg = store.store.server;
  if (!cfg.autoRestart) return;
  restartScheduler = setInterval(() => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const day = now.getDay();
    const doRestart = () => { serverManager.restart().then(() => discordWebhook?.sendStatusUpdate('restarted').catch(() => {})).catch(() => {}); };
    if (cfg.restartMode === 'interval') {
      const hours = cfg.restartIntervalHours || 4;
      if (now.getMinutes() === 0 && now.getHours() % hours === 0) doRestart();
    } else if (cfg.restartSchedule?.includes(time)) {
      if (!cfg.restartDays || cfg.restartDays.length === 0 || cfg.restartDays.includes(day)) doRestart();
    }
    if (cfg.robotScheduleEnabled) {
      if (cfg.robotEnableTime === time && cfg.robotEnableDays?.includes(day)) serverManager.setSentryRobots(true).catch(() => {});
      if (cfg.robotDisableTime === time && cfg.robotDisableDays?.includes(day)) serverManager.setSentryRobots(false).catch(() => {});
    }
  }, 30000);
}

let backupTimer: NodeJS.Timeout | null = null;
function startBackupScheduler(): void {
  if (backupTimer) clearInterval(backupTimer);
  const cfg = store.store.backup;
  if (!cfg.enabled || !cfg.path || !store.store.server.serverPath) return;
  backupTimer = setInterval(async () => { try { await backupManager.createBackup(); } catch {} }, (cfg.interval || 3) * 3600000);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
  });
  if (process.env.NODE_ENV === 'development') { mainWindow.loadURL('http://localhost:5173'); mainWindow.webContents.openDevTools(); }
  else { mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')); }
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function initServices(): void {
  // Clean up old service instances before creating new ones
  if (logWatcher) logWatcher.destroy();
  const config = store.store;
  fileManager = new FileManager(config.server.serverPath);
  backupManager = new BackupManager(config.backup, config.server.serverPath);
  steamCmd = new SteamCmd(config.server.steamCmdPath);
  if (config.server.serverPath) steamCmd.setServerPath(config.server.serverPath);
  discordWebhook = new DiscordWebhook(config.discord);
  serverManager = new ServerManager(config.server);
  logWatcher = new LogWatcher(config.server.serverPath, discordWebhook);
  logWatcher.setRconClient(rconClient);
  logWatcher.setTeleportLocations(config.plugins.teleport?.locations || []);
  logWatcher.setPacksConfig(config.packs);
  scumDatabase = new ScumDatabaseReader(config.server.serverPath);
  webPanel.setServices(serverManager, steamCmd, config.server.serverPath);
  webPanel.setRconClient(rconClient);
  webPanel.updateConfig(config.webPanel);
  webPanel.setPacksConfig(config.packs);
  webPanel.setPacksSaveCallback((packs) => {
    console.log('[Packs] Saving packs config to store, items:', packs.starter.items.length, 'starter,', packs.daily.items.length, 'daily');
    console.log('[Packs] Starter items:', JSON.stringify(packs.starter.items));
    console.log('[Packs] Daily items:', JSON.stringify(packs.daily.items));
    try {
      store.set('packs', packs);
      console.log('[Packs] Store saved successfully');
    } catch (e: any) {
      console.error('[Packs] Store save error:', e.message);
    }
    logWatcher.setPacksConfig(packs);
  });
  webPanel.setPackCooldownProvider({
    getCooldowns: () => logWatcher.getCooldowns(),
    resetCooldown: (steamId: string, packType?: 'starter' | 'daily') => logWatcher.resetPlayerCooldown(steamId, packType),
  });
  let pluginsCfg = config.plugins;
  if (!pluginsCfg) {
    pluginsCfg = {
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
        minItems: 3, maxItems: 8,
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
    store.set('plugins', pluginsCfg);
  } else if (!pluginsCfg.vip) {
    pluginsCfg.vip = {
      enabled: true, players: [],
      starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
      dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
    };
    store.set('plugins', pluginsCfg);
  }
  if (!pluginsCfg.saveHome) {
    pluginsCfg.saveHome = { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0 };
    store.set('plugins', pluginsCfg);
  }
  if (!pluginsCfg.airdrop) {
    pluginsCfg.airdrop = {
      enabled: false,
      chestItem: 'Improvised_Metal_Chest',
      minItems: 3, maxItems: 8,
      cooldownMinutes: 60,
      autoDropEnabled: false,
      autoDropIntervalMinutes: 120,
      autoDropMinPlayers: 5,
    };
    store.set('plugins', pluginsCfg);
  }
  if (pluginsCfg.airdrop.autoDropMinPlayers === undefined) {
    pluginsCfg.airdrop.autoDropMinPlayers = 5;
    store.set('plugins', pluginsCfg);
  }
  if (!pluginsCfg.chatSender) {
    pluginsCfg.chatSender = 'AMUR bot';
    store.set('plugins', pluginsCfg);
  }
  if (!pluginsCfg.rewards) {
    pluginsCfg.rewards = {
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
    };
    store.set('plugins', pluginsCfg);
  }
  if (!pluginsCfg.ratingBlacklist) {
    pluginsCfg.ratingBlacklist = [];
    store.set('plugins', pluginsCfg);
  }
  webPanel.setPluginsConfig(pluginsCfg);
  webPanel.setPluginsSaveCallback((plugins) => {
    console.log('[Plugins] Saving plugins config to store');
    try {
      store.set('plugins', plugins);
    } catch (e: any) {
      console.error('[Plugins] Store save error:', e.message);
    }
    logWatcher.setTeleportLocations(plugins.teleport?.locations || []);
    const vip = plugins.vip || {
      enabled: true, players: [],
      starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
      dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
    };
    logWatcher.setVipConfig(vip);
    logWatcher.setSaveHomeConfig(plugins.saveHome || { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0 });
  });
  const vipCfg = config.plugins.vip || {
    enabled: true, players: [],
    starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
    dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
  };
  logWatcher.setVipConfig(vipCfg);
  logWatcher.setSaveHomeConfig(config.plugins.saveHome || { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0 });
  wargmManager.setVipAddCallback((steamId: string, days: number) => {
    const cur = store.store;
    const p = cur.plugins || { teleport: { enabled: true, locations: [] }, vip: vipCfg };
    if (!p.vip) p.vip = vipCfg;
    const existing = p.vip.players.findIndex((x: any) => x.steamId === steamId);
    const expiresAt = Date.now() + days * 86400000;
    if (existing >= 0) {
      p.vip.players[existing].expiresAt = Math.max(p.vip.players[existing].expiresAt, expiresAt);
    } else {
      p.vip.players.push({ steamId, expiresAt, note: 'WARGM' });
    }
    store.set('plugins', p);
    logWatcher.setVipConfig(p.vip);
    webPanel.setPluginsConfig(p);
  });
  wargmManager.setRconClient(rconClient);
  if (config.server.serverPath) wargmManager.setServerPath(config.server.serverPath);
  webPanel.setWargmManager(wargmManager);
  logWatcher.setWargmManager(wargmManager);
  webPanel.setServerConfigProvider({
    get: () => store.store,
    save: (cfg: any) => { try { store.store = cfg; initServices(); startRestartScheduler(); startBackupScheduler(); return true; } catch { return false; } },
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('config:get', () => store.store);
  ipcMain.handle('config:set', (_event, config: AppConfig) => {
    store.store = config; initServices(); startRestartScheduler(); startBackupScheduler(); return true;
  });

  ipcMain.handle('server:start', async () => { rconClient.setAutoReconnect(false); await serverManager.start(); const s = serverManager.getStatus(); if (s.running) { setTimeout(() => { rconClient.connect(store.store.rcon.host || 'localhost', store.store.rcon.port || 28015, store.store.rcon.password).catch(() => {});     }, 60000); discordWebhook.sendStatusUpdate('started').catch(() => {}); } return s; });
  ipcMain.handle('server:stop', async () => { await serverManager.stop(); const s = serverManager.getStatus(); discordWebhook.sendStatusUpdate('stopped').catch(() => {}); return s; });
  ipcMain.handle('server:restart', async () => { rconClient.setAutoReconnect(false); await serverManager.restart(); const s = serverManager.getStatus(); if (s.running) { setTimeout(() => { rconClient.connect(store.store.rcon.host || 'localhost', store.store.rcon.port || 28015, store.store.rcon.password).catch(() => {});     }, 60000); discordWebhook.sendStatusUpdate('restarted').catch(() => {}); } return s; });
  ipcMain.handle('server:status', () => serverManager.getStatus());
  ipcMain.handle('server:check-update', async () => {
    try {
      steamCmd.setSteamCmdPath(store.store.server.steamCmdPath || 'D:\\steamcmd');
      if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath);
      const result = await steamCmd.checkForUpdate();
      return result;
    } catch (e: any) { return { available: false, error: e.message || 'Update check error' }; }
  });
  ipcMain.handle('server:update', async () => {
    steamCmd.setSteamCmdPath(store.store.server.steamCmdPath || 'D:\\steamcmd');
    if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath);
    return steamCmd.updateServer();
  });
  ipcMain.handle('server:manual-update', async () => {
    steamCmd.setSteamCmdPath(store.store.server.steamCmdPath || 'D:\\steamcmd');
    if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath);
    await steamCmd.manualUpdate();
    return true;
  });
  ipcMain.handle('server:update-stream', async () => {
    steamCmd.setSteamCmdPath(store.store.server.steamCmdPath || 'D:\\steamcmd');
    if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath);
    const result = await steamCmd.runUpdateWithDetailedProgress(
      (progress) => { try { mainWindow?.webContents.send('server:update-progress', progress); } catch {} },
    );
    try { mainWindow?.webContents.send('server:update-done', result); } catch {}
    return result;
  });
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:check-update', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return { available: false };
      return { available: true, version: result.updateInfo.version };
    } catch {
      return { available: false };
    }
  });

  ipcMain.handle('server:console-start', () => {
    const logPath = path.join(store.store.server.serverPath || '', 'SCUM', 'Saved', 'Logs', 'SCUM.log');
    if (!fs.existsSync(logPath)) { try { mainWindow?.webContents.send('server:console-lines', ['[CONSOLE] SCUM.log not found. Start the server first.']); } catch {} return; }
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > 0) {
        const readSize = Math.min(stat.size, 65536); const buf = Buffer.alloc(readSize);
        const fd = fs.openSync(logPath, 'r'); fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize)); fs.closeSync(fd);
        const enc = buf[1] === 0 ? 'utf16le' : 'utf-8'; consoleOffset = stat.size;
        const lines = buf.toString(enc).split('\n').filter(Boolean);
        if (lines.length > 0) try { mainWindow?.webContents.send('server:console-lines', lines); } catch {}
      } else { try { mainWindow?.webContents.send('server:console-lines', ['[CONSOLE] SCUM.log is empty. Waiting for server output...']); } catch {} }
      if (consoleWatcher) { consoleWatcher.close(); consoleWatcher = null; }
      consoleWatcher = watch(logPath, { persistent: true, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200 } });
      consoleWatcher.on('change', () => {
        try {
          const s = fs.statSync(logPath); if (s.size <= consoleOffset) return;
          const b = Buffer.alloc(s.size - consoleOffset); const f = fs.openSync(logPath, 'r');
          fs.readSync(f, b, 0, b.length, consoleOffset); fs.closeSync(f);
          const enc = b[1] === 0 ? 'utf16le' : 'utf-8'; consoleOffset = s.size;
          const lines = b.toString(enc).split('\n').filter(Boolean);
          if (lines.length > 0) try { mainWindow?.webContents.send('server:console-lines', lines); } catch {}
        } catch {}
      });
    } catch (e: any) { try { mainWindow?.webContents.send('server:console-lines', [`[CONSOLE] Error: ${e.message}`]); } catch {} }
  });
  ipcMain.handle('server:console-stop', () => { if (consoleWatcher) { consoleWatcher.close(); consoleWatcher = null; } });
  ipcMain.handle('steamcmd:install', async () => { await steamCmd.install(); return true; });

  ipcMain.handle('files:read', async (_event, filePath: string) => fileManager.readFile(filePath));
  ipcMain.handle('files:write', async (_event, filePath: string, content: string) => fileManager.writeFile(filePath, content));
  ipcMain.handle('files:list', async (_event, dirPath: string) => fileManager.listFiles(dirPath));
  ipcMain.handle('backup:list', () => backupManager.listBackups());
  ipcMain.handle('backup:create', async (_event, name?: string) => backupManager.createBackup(name));
  ipcMain.handle('backup:restore', async (_event, id: string) => backupManager.restoreBackup(id));
  ipcMain.handle('backup:delete', async (_event, id: string) => backupManager.deleteBackup(id));
  ipcMain.handle('logs:get', () => logWatcher.getEvents());
  ipcMain.handle('logs:get-by-type', (_event, type: string) => logWatcher.getEventsByType(type));
  ipcMain.handle('dialog:selectFolder', async () => { const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
  ipcMain.handle('discord:test', async (_event, url: string) => discordWebhook.test(url));
  ipcMain.handle('ftp:start', async (_event, port: number, user: string, pass: string, pasvHost?: string) => { await ftpServer.start(port, store.store.server.serverPath || '', user, pass, pasvHost); return true; });
  ipcMain.handle('ftp:stop', () => { ftpServer.stop(); return true; });
  ipcMain.handle('ftp:status', () => ({ running: ftpServer.isRunning() }));
  ipcMain.handle('ftp:save-config', async (_event, cfg: any) => { const cur = store.store; cur.ftp = cfg; store.store = cur; return true; });
  ipcMain.handle('webpanel:start', async () => { await webPanel.start(); return true; });
  ipcMain.handle('webpanel:stop', () => { webPanel.stop(); return true; });
  ipcMain.handle('webpanel:status', () => ({ running: webPanel.isRunning() }));
  ipcMain.handle('webpanel:save-config', async (_event, cfg: any) => { const cur = store.store; cur.webPanel = cfg; store.store = cur; webPanel.updateConfig(cfg); return true; });
  ipcMain.handle('db:init', async () => { try { await initSqlJs(); scumDatabase.setServerPath(store.store.server.serverPath); scumDatabase.open(); return { ok: true, tables: scumDatabase.getTables() }; } catch (e: any) { return { ok: false, error: e.message }; } });
  ipcMain.handle('db:status', () => ({ available: scumDatabase.isAvailable(), open: !!(scumDatabase as any).db }));
  ipcMain.handle('db:getPlayers', () => scumDatabase.getPlayers());
  ipcMain.handle('db:getPlayerBySteamId', (_event, sid: string) => scumDatabase.getPlayerBySteamId(sid));
  ipcMain.handle('db:getPlayerByName', (_event, name: string) => scumDatabase.getPlayerByName(name));
  ipcMain.handle('db:getWallet', (_event, sid: string) => scumDatabase.getWallet(sid));
  ipcMain.handle('db:getAttributes', (_event, sid: string) => scumDatabase.getAttributes(sid));
  ipcMain.handle('db:getSkills', (_event, sid: string) => scumDatabase.getSkills(sid));
  ipcMain.handle('db:getInventory', (_event, sid: string) => scumDatabase.getInventory(sid));
  ipcMain.handle('db:getQuickSlots', (_event, sid: string) => scumDatabase.getQuickSlots(sid));
  ipcMain.handle('db:getSquads', () => scumDatabase.getSquads());
  ipcMain.handle('db:getVehicles', () => scumDatabase.getVehicles());
  ipcMain.handle('db:getFlags', () => scumDatabase.getFlags());
  ipcMain.handle('db:getBankAccounts', () => scumDatabase.getBankAccounts());
  ipcMain.handle('db:getEconomyLeaderboard', () => scumDatabase.getEconomyLeaderboard());

  // RCON handlers
  ipcMain.handle('rcon:connect', async (_event, config) => {
    rconClient.setAutoReconnect(true);
    const result = await rconClient.connect(config.host, config.port, config.password);
    if (result.success) {
      const cur = store.store;
      cur.rcon = { ...config, enabled: true };
      store.store = cur;
    }
    return result;
  });
  ipcMain.handle('rcon:disconnect', () => {
    rconClient.disconnect();
    const cur = store.store;
    cur.rcon.enabled = false;
    store.store = cur;
    return true;
  });
  ipcMain.handle('rcon:sendCommand', async (_event, command) => {
    return await rconClient.sendCommand(command);
  });
  ipcMain.handle('rcon:status', () => ({
    connected: rconClient.isConnected(),
    config: rconClient.getConfig(),
  }));
  ipcMain.handle('rcon:saveConfig', async (_event, config) => {
    const cur = store.store;
    cur.rcon = config;
    store.store = cur;
    return true;
  });
}

app.whenReady().then(() => {
  initServices();
  registerIpcHandlers();
  createWindow();
  startRestartScheduler();

  // Auto-updater
  autoUpdater.logger = console;
  autoUpdater.autoDownload = false;
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No updates available');
  });
  autoUpdater.on('error', (err) => {
    console.log('[Updater] Error:', err.message);
  });
  autoUpdater.on('download-progress', (p) => {
    console.log('[Updater] Downloading:', p.percent.toFixed(1) + '%');
  });
  autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
  });

  const cur = store.store;
  let changed = false;
  if (!cur.server.serverPath) { const d = detectServerPath(); if (d) { cur.server.serverPath = d; changed = true; } }
  if (!cur.server.steamCmdPath) { const d = detectSteamCmdPath(); if (d) { cur.server.steamCmdPath = d; changed = true; } }
  if (changed) { store.store = cur; initServices(); }

  startBackupScheduler();

  if (store.store.ftp.enabled && store.store.server.serverPath) {
    const f = store.store.ftp;
    ftpServer.start(f.port || 21, store.store.server.serverPath, f.username || 'scum', f.password || 'scum123', f.pasvHost || undefined).catch(() => {});
  }

  initSqlJs().then(() => {
    try { scumDatabase.setServerPath(store.store.server.serverPath); scumDatabase.open(); console.log('[SCUMdb] Opened SCUM.db'); } catch (e: any) { console.log('[SCUMdb] Not available:', e.message); }
  }).catch((e) => console.log('[SCUMdb] Init error:', e.message));

  wargmManager.init().then(ok => {
    if (ok) console.log('[WargmDB] Initialized');
    else console.log('[WargmDB] Init failed');
  }).catch(e => console.log('[WargmDB] Init error:', e.message));

  if (store.store.webPanel.enabled) {
    webPanel.start().catch((e) => console.error('[WebPanel]', e.message));
  }

  // Auto-connect RCON on startup if config exists
  if (store.store.rcon.enabled && store.store.rcon.password) {
    rconClient.setAutoReconnect(true);
    rconClient.connect(store.store.rcon.host || 'localhost', store.store.rcon.port || 28015, store.store.rcon.password)
      .then(result => {
        if (result.success) {
          console.log('[RCON] Auto-connected on startup');
          webPanel.startPlayersPoll(); // Start polling players in web panel
        } else {
          console.log('[RCON] Auto-connect failed:', result.error);
        }
      })
      .catch(e => console.log('[RCON] Auto-connect error:', e.message));
  }

  if (store.store.server.autoStart) serverManager.start();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });
app.on('before-quit', () => {
  if (restartScheduler) clearInterval(restartScheduler);
  if (backupTimer) clearInterval(backupTimer);
  if (consoleWatcher) consoleWatcher.close();
  if (logWatcher) logWatcher.destroy();
  if (scumDatabase) scumDatabase.close();
  if (rconClient) rconClient.disconnect();
  webPanel.stop();
  ftpServer.stop();
  wargmManager.close();
});
