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
import { ScumDatabaseReader, initSqlJs } from './scumDatabase';
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
  const candidates = [__dirname, path.join(__dirname, '..', '..'), process.cwd()];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'steamcmd.exe'))) return dir;
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

function startRestartScheduler(): void {
  if (restartScheduler) clearInterval(restartScheduler);
  const cfg = store.store.server;
  if (!cfg.autoRestart) return;
  restartScheduler = setInterval(() => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const day = now.getDay();
    const doRestart = () => { serverManager.restart().then(() => discordWebhook?.sendStatusUpdate('Server restarted').catch(() => {})).catch(() => {}); };
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
  });
  if (process.env.NODE_ENV === 'development') { mainWindow.loadURL('http://localhost:5173'); mainWindow.webContents.openDevTools(); }
  else { mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')); }
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function initServices(): void {
  const config = store.store;
  fileManager = new FileManager(config.server.serverPath);
  backupManager = new BackupManager(config.backup, config.server.serverPath);
  steamCmd = new SteamCmd(config.server.steamCmdPath);
  if (config.server.serverPath) steamCmd.setServerPath(config.server.serverPath);
  discordWebhook = new DiscordWebhook(config.discord);
  serverManager = new ServerManager(config.server);
  logWatcher = new LogWatcher(config.server.serverPath, discordWebhook);
  scumDatabase = new ScumDatabaseReader(config.server.serverPath);
  webPanel.setServices(serverManager, steamCmd, config.server.serverPath);
  webPanel.updateConfig(config.webPanel);
}

function registerIpcHandlers(): void {
  ipcMain.handle('config:get', () => store.store);
  ipcMain.handle('config:set', (_event, config: AppConfig) => {
    store.store = config; initServices(); startRestartScheduler(); startBackupScheduler(); return true;
  });

  ipcMain.handle('server:start', async () => { await serverManager.start(); const s = serverManager.getStatus(); if (s.running) discordWebhook.sendStatusUpdate('Server started').catch(() => {}); return s; });
  ipcMain.handle('server:stop', async () => { await serverManager.stop(); const s = serverManager.getStatus(); discordWebhook.sendStatusUpdate('Server stopped').catch(() => {}); return s; });
  ipcMain.handle('server:restart', async () => { await serverManager.restart(); const s = serverManager.getStatus(); discordWebhook.sendStatusUpdate('Server restarted').catch(() => {}); return s; });
  ipcMain.handle('server:status', () => serverManager.getStatus());
  ipcMain.handle('server:check-update', async () => {
    try { if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath); const r = await steamCmd.updateServer(); return { updated: r !== 'already_up_to_date', error: '' }; }
    catch (e: any) { return { updated: false, error: e.message || 'Update error' }; }
  });
  ipcMain.handle('server:update', async () => { if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath); return steamCmd.updateServer(); });
  ipcMain.handle('server:update-stream', async () => {
    if (store.store.server.serverPath) steamCmd.setServerPath(store.store.server.serverPath);
    const result = await steamCmd.runUpdateWithProgress((line) => { try { mainWindow?.webContents.send('server:update-line', line); } catch {} });
    try { mainWindow?.webContents.send('server:update-done', result); } catch {}
    return result;
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
}

app.whenReady().then(() => {
  createWindow();
  initServices();
  registerIpcHandlers();
  startRestartScheduler();

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

  if (store.store.webPanel.enabled) {
    webPanel.start().catch((e) => console.error('[WebPanel]', e.message));
  }

  if (store.store.server.autoStart) serverManager.start();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });
