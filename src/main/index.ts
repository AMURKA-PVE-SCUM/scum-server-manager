import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { watch } from 'chokidar';
import { ServerManager } from './serverManager';
import { FileManager } from './fileManager';
import { BackupManager } from './backupManager';
import { SteamCmd } from './steamCmd';
import { LogWatcher } from './logWatcher';
import { DiscordWebhook } from './discordWebhook';
import ElectronStore from 'electron-store';
import type { AppConfig } from './types';

// Global error logging
process.on('uncaughtException', (err) => {
  try { fs.writeFileSync(path.join(__dirname, '..', '..', 'crash.log'), `[${new Date().toISOString()}] UNCAUGHT: ${err.stack || err.message}\n`, { flag: 'a' }); } catch {}
  console.error('[FATAL]', err);
});
process.on('unhandledRejection', (reason) => {
  try { fs.writeFileSync(path.join(__dirname, '..', '..', 'crash.log'), `[${new Date().toISOString()}] UNHANDLED: ${reason}\n`, { flag: 'a' }); } catch {}
  console.error('[FATAL]', reason);
});

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

/** Auto-detect server path by checking common locations */
function detectServerPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'Server'),
    path.join(__dirname, '..', '..'),
    process.cwd(),
    ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'SCUM', 'Server')] : []),
    ...(process.env.PROGRAMFILES ? [path.join(process.env.PROGRAMFILES, 'Steam', 'steamapps', 'common', 'SCUM Server')] : []),
    ...(process.env['PROGRAMFILES(X86)'] ? [path.join(process.env['PROGRAMFILES(X86)'], 'Steam', 'steamapps', 'common', 'SCUM Server')] : []),
  ];
  for (const dir of candidates) {
    const exe = path.join(dir, 'SCUM', 'Binaries', 'Win64', 'SCUMServer.exe');
    if (fs.existsSync(exe)) return dir;
  }
  return '';
}

function detectSteamCmdPath(): string {
  const candidates = [
    __dirname,
    path.join(__dirname, '..', '..'),
    process.cwd(),
  ];
  for (const dir of candidates) {
    const exe = path.join(dir, 'steamcmd.exe');
    if (fs.existsSync(exe)) return dir;
  }
  return '';
}

const store = new ElectronStore<AppConfig>({
  defaults: {
    server: {
      serverPath: '',
      steamCmdPath: '',
      serverPort: 2302,
      queryPort: 2502,
      maxPlayers: 50,
      fileOpenLog: true,
      noBattlEye: false,
      autoStart: false,
      autoRestart: false,
      restartSchedule: ['06:00', '12:00', '18:00', '00:00'],
      restartMode: 'specific',
      restartIntervalHours: 4,
      restartDays: [0, 1, 2, 3, 4, 5, 6],
    },
    discord: {
      adminLogWebhook: '',
      chatWebhook: '',
      vehicleWebhook: '',
      loginWebhook: '',
      serverStatusWebhook: '',
      enabled: false,
    },
    backup: {
      enabled: true,
      interval: 6,
      retention: 30,
      path: '',
    },
    theme: 'dark',
    language: 'ru',
  },
});

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager;
let fileManager: FileManager;
let backupManager: BackupManager;
let steamCmd: SteamCmd;
let logWatcher: LogWatcher;
let discordWebhook: DiscordWebhook;
let restartScheduler: NodeJS.Timeout | null = null;
let updateCheckTimer: NodeJS.Timeout | null = null;
let updateAvailable = false;
let updateCheckError = '';
let consoleWatcher: ReturnType<typeof watch> | null = null;
let consoleOffset = 0;

/** Check for server update by running SteamCMD app_update in dry mode */
async function checkForUpdate(): Promise<{ available: boolean; error: string }> {
  try {
    if (!steamCmd) return { available: false, error: 'SteamCMD не инициализирован' };
    const result = await steamCmd.checkForUpdate();
    return result;
  } catch (e: any) {
    return { available: false, error: e.message || 'Ошибка проверки' };
  }
}

async function runUpdateCheck(): Promise<void> {
  const result = await checkForUpdate();
  updateAvailable = result.available;
  updateCheckError = result.error;
}

function startScheduledUpdateCheck(): void {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateCheckTimer = setInterval(runUpdateCheck, 600000);
  runUpdateCheck(); // immediate first check
}

function startRestartScheduler(): void {
  if (restartScheduler) clearInterval(restartScheduler);
  const cfg = store.store.server;
  if (!cfg.autoRestart) return;

  restartScheduler = setInterval(() => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const day = now.getDay();

    if (cfg.restartMode === 'interval') {
      const hours = cfg.restartIntervalHours || 4;
      if (now.getMinutes() === 0 && now.getHours() % hours === 0) {
        serverManager.restart().catch(() => {});
      }
    } else if (cfg.restartSchedule?.includes(time)) {
      if (!cfg.restartDays || cfg.restartDays.length === 0 || cfg.restartDays.includes(day)) {
        serverManager.restart().catch(() => {});
      }
    }
  }, 30000);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    autoHideMenuBar: true,
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
}

function registerIpcHandlers(): void {
  ipcMain.handle('config:get', () => store.store);
  ipcMain.handle('config:set', (_event, config: AppConfig) => {
    store.store = config;
    initServices();
    startRestartScheduler();
    return true;
  });

  ipcMain.handle('server:start', async () => {
    await serverManager.start();
    const s = serverManager.getStatus();
    if (s.running) { discordWebhook.sendStatusUpdate('🟢 **Сервер запущен**').catch(() => {}); }
    return s;
  });

  ipcMain.handle('server:stop', async () => {
    await serverManager.stop();
    const s = serverManager.getStatus();
    discordWebhook.sendStatusUpdate('🔴 **Сервер остановлен**').catch(() => {});
    return s;
  });

  ipcMain.handle('server:restart', async () => {
    await serverManager.restart();
    const s = serverManager.getStatus();
    discordWebhook.sendStatusUpdate('🔄 **Сервер перезапущен**').catch(() => {});
    return s;
  });

  ipcMain.handle('server:status', () => {
    const s = serverManager.getStatus();
    return { ...s, updateAvailable, updateCheckError };
  });
  ipcMain.handle('server:check-update', async () => {
    await runUpdateCheck();
    return { updateAvailable, updateCheckError };
  });

  ipcMain.handle('server:update', async () => {
    return steamCmd.updateServer();
  });

  ipcMain.handle('server:update-stream', async () => {
    const result = await steamCmd.runUpdateWithProgress((line) => {
      try { mainWindow?.webContents.send('server:update-line', line); } catch {}
    });
    try { mainWindow?.webContents.send('server:update-done', result); } catch {}
    return result;
  });

  // Console: tail SCUM.log live
  ipcMain.handle('server:console-start', () => {
    const logPath = path.join(
      store.store.server.serverPath || '',
      'SCUM', 'Saved', 'Logs', 'SCUM.log'
    );
    if (!fs.existsSync(logPath)) {
      try { mainWindow?.webContents.send('server:console-lines', ['[CONSOLE] SCUM.log не найден. Запустите сервер сначала.']); } catch {}
      return;
    }
    try {
      const stat = fs.statSync(logPath);
      if (stat.size === 0) {
        try { mainWindow?.webContents.send('server:console-lines', ['[CONSOLE] SCUM.log пуст. Ожидание вывода сервера...']); } catch {}
      } else {
        const readSize = Math.min(stat.size, 65536);
        const buf = Buffer.alloc(readSize);
        const fd = fs.openSync(logPath, 'r');
        fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
        fs.closeSync(fd);
        const encoding = buf[1] === 0 ? 'utf16le' : 'utf-8';
        const initial = buf.toString(encoding);
        consoleOffset = stat.size;
        const lines = initial.split('\n').filter(Boolean);
        if (lines.length > 0) {
          try { mainWindow?.webContents.send('server:console-lines', lines); } catch {}
        }
      }

      if (consoleWatcher) { consoleWatcher.close(); consoleWatcher = null; }
      consoleWatcher = watch(logPath, { persistent: true, ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200 } });
      consoleWatcher.on('change', () => {
        try {
          const s = fs.statSync(logPath);
          if (s.size <= consoleOffset) return;
          const b = Buffer.alloc(s.size - consoleOffset);
          const f = fs.openSync(logPath, 'r');
          fs.readSync(f, b, 0, b.length, consoleOffset);
          fs.closeSync(f);
          const enc = b[1] === 0 ? 'utf16le' : 'utf-8';
          const text = b.toString(enc);
          consoleOffset = s.size;
          const lines = text.split('\n').filter(Boolean);
          if (lines.length > 0) {
            try { mainWindow?.webContents.send('server:console-lines', lines); } catch {}
          }
        } catch {}
      });
    } catch (e: any) {
      try { mainWindow?.webContents.send('server:console-lines', [`[CONSOLE] Ошибка: ${e.message}`]); } catch {}
    }
  });

  ipcMain.handle('server:console-stop', () => {
    if (consoleWatcher) { consoleWatcher.close(); consoleWatcher = null; }
  });

  ipcMain.handle('steamcmd:install', async () => {
    await steamCmd.install();
    return true;
  });

  ipcMain.handle('files:read', async (_event, filePath: string) => {
    return fileManager.readFile(filePath);
  });

  ipcMain.handle('files:write', async (_event, filePath: string, content: string) => {
    try { await backupManager.createBackup(filePath); } catch {}
    return fileManager.writeFile(filePath, content);
  });

  ipcMain.handle('files:list', async (_event, dirPath: string) => {
    return fileManager.listFiles(dirPath);
  });

  ipcMain.handle('backup:list', () => backupManager.listBackups());
  ipcMain.handle('backup:create', async (_event, name?: string) => {
    return backupManager.createBackup(name);
  });
  ipcMain.handle('backup:restore', async (_event, backupId: string) => {
    return backupManager.restoreBackup(backupId);
  });
  ipcMain.handle('backup:delete', async (_event, backupId: string) => {
    return backupManager.deleteBackup(backupId);
  });

  ipcMain.handle('logs:get', () => logWatcher.getEvents());
  ipcMain.handle('logs:get-by-type', (_event, type: string) => logWatcher.getEventsByType(type));

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('discord:test', async (_event, webhookUrl: string) => {
    return discordWebhook.test(webhookUrl);
  });
}

app.whenReady().then(() => {
  createWindow();
  initServices();
  registerIpcHandlers();
  startRestartScheduler();

  // Auto-fill paths if empty (first run)
  const cur = store.store;
  let changed = false;
  if (!cur.server.serverPath) {
    const detected = detectServerPath();
    if (detected) { cur.server.serverPath = detected; changed = true; }
  }
  if (!cur.server.steamCmdPath) {
    const detected = detectSteamCmdPath();
    if (detected) { cur.server.steamCmdPath = detected; changed = true; }
  }
  if (changed) { store.store = cur; initServices(); }

  startScheduledUpdateCheck();

  if (store.store.server.autoStart) {
    serverManager.start();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
