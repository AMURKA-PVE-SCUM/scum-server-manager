import { exec, execSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { app } from 'electron';
import psList from 'ps-list';
import type { ServerConfig, ServerStatus } from './types';

const APP_ROOT = app?.isPackaged
  ? process.resourcesPath
  : path.resolve(__dirname, '..', '..');
const TOOL_DIR = path.join(APP_ROOT, 'tools');
const SEND_CTRL_C = path.join(TOOL_DIR, 'SendCtrlC.exe');
const CLOSE_WINDOW = path.join(TOOL_DIR, 'CloseSCUMWindow.exe');
const SYSTEM32 = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, 'system32')
  : 'C:\\Windows\\system32';
const TASKKILL = path.join(SYSTEM32, 'taskkill.exe');
const WMIC = path.join(SYSTEM32, 'wbem', 'wmic.exe');

const LOG_PREFIX = '[ServerManager]';

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args);
}

async function findScumPids(): Promise<number[]> {
  try {
    const processes = await psList();
    return processes
      .filter((p) => p.name && p.name.toLowerCase().includes('scumserver'))
      .map((p) => p.pid);
  } catch {
    return [];
  }
}

function getMemoryMb(pid: number): number {
  try {
    const buf = execSync(
      `"${WMIC}" process where "ProcessId=${pid}" get WorkingSetSize /format:csv`,
      { stdio: 'pipe', timeout: 5000 },
    );
    const out = buf?.toString()?.trim();
    const lines = out?.split('\n').filter((l) => l.trim()) || [];
    for (const line of lines) {
      if (line.includes(',') && !line.startsWith('Node')) {
        const parts = line.split(',');
        const ws = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(ws)) return Math.round(ws / 1024 / 1024);
      }
    }
  } catch {}
  return 0;
}

function sendCtrlC(pid: number): boolean {
  try {
    execSync(`"${SEND_CTRL_C}" ${pid}`, { stdio: 'pipe', timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

function closeWindow(): boolean {
  const titles = ['SCUMServer', 'SCUMServer.exe', 'SCUM Server', 'SCUM'];
  for (const t of titles) {
    try {
      execSync(`"${CLOSE_WINDOW}" "${t}"`, { stdio: 'pipe', timeout: 5000 });
    } catch {}
  }
  return true;
}

function killPid(pid: number): boolean {
  try {
    execSync(`"${TASKKILL}" /F /T /PID ${pid}`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch (err: any) {
    const msg = err.stderr?.toString()?.trim() || err.message;
    if (msg.toLowerCase().includes('not found') || msg.includes('не найден')) return true;
    return false;
  }
}

function killByName(): boolean {
  try {
    execSync(`"${TASKKILL}" /F /T /IM SCUMServer.exe`, { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch (err: any) {
    const msg = err.stderr?.toString()?.trim() || err.message;
    if (msg.toLowerCase().includes('not found') || msg.includes('не найден')) return true;
    return false;
  }
}

async function waitPidsGone(pids: number[], timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await findScumPids();
    const stillAlive = pids.filter((pid) => current.includes(pid));
    if (stillAlive.length === 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export class ServerManager {
  private config: ServerConfig;
  private startTime: number = 0;
  private monInterval: NodeJS.Timeout | null = null;
  private serverPid: number | null = null;
  private status: ServerStatus = {
    running: false,
    pid: null,
    uptime: 0,
    memoryUsage: 0,
    players: 0,
    maxPlayers: 50,
    cpuUsage: 0,
    fps: 0,
    playersList: [],
  };

  constructor(config: ServerConfig) {
    this.config = config;
  }

  private get maxPlayers(): number {
    return this.config.maxPlayers || 50;
  }

  async start(): Promise<void> {
    if (this.status.running) return;

    await this.killAll();

    const serverExe = path.join(
      this.config.serverPath,
      'SCUM', 'Binaries', 'Win64', 'SCUMServer.exe',
    );
    if (!(await fs.pathExists(serverExe))) {
      throw new Error(
        `SCUMServer.exe не найден: ${serverExe}. Укажите путь в настройках.`,
      );
    }

    const serverDir = path.dirname(serverExe);
    const port = this.config.serverPort || 2302;
    const queryPort = this.config.queryPort || 2502;
    const args = [
      `Port=${port}`,
      `QueryPort=${queryPort}`,
      '-log',
      '-NoGUI',
      '-unattended',
      '-NoSteamClient',
    ];
    if (this.config.fileOpenLog) args.push('-fileopenlog');
    if (this.config.noBattlEye) args.push('-NoBattlEye');
    args.push(`-MaxPlayers=${this.maxPlayers}`);

    const cmd = `cd /d "${serverDir}" && start "" "${serverExe}" ${args.join(' ')}`;
    log('Starting server...');
    exec(cmd);

    this.startTime = Date.now();
    this.status.running = true;

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const pids = await findScumPids();
      if (pids.length > 0) {
        this.serverPid = pids[0];
        this.status.pid = pids[0];
        log(`Server started, PID: ${pids[0]}`);
        try {
          execSync(
            `powershell -NoProfile -NonInteractive -Command "` +
            `Add-Type -Name W -Namespace W -MemberDefinition '[DllImport(\\\"user32.dll\\\")]public static extern bool ShowWindowAsync(IntPtr h,int n);'; ` +
            `do { \$w = (Get-Process -Id ${pids[0]} -ErrorAction SilentlyContinue).MainWindowHandle; Start-Sleep -Milliseconds 200 } ` +
            `until (\$w -ne 0 -or (Get-Date).Second -gt ([datetime]::Now.AddSeconds(5)).Second); ` +
            `if (\$w -ne 0) { [W]::ShowWindowAsync(\$w, 0) }"`,
            { stdio: 'ignore', timeout: 10000 },
          );
          log('Server console window hidden');
        } catch {}
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!this.serverPid) {
      log('WARNING: Could not detect server PID');
    }

    this.startMonitoring();
  }

  async stop(): Promise<void> {
    log('=== STOP ===');
    await this.killAll();
    this.clearStatus();
    log('Server stopped');
  }

  async restart(): Promise<void> {
    log('=== RESTART ===');
    this.clearStatus();
    await this.killAll();
    await new Promise((r) => setTimeout(r, 3000));
    await this.start();
    log('=== RESTART DONE ===');
  }

  private async killAll(): Promise<void> {
    const pids = new Set<number>();
    if (this.serverPid) pids.add(this.serverPid);
    (await findScumPids()).forEach((p) => pids.add(p));
    const pidArr = [...pids];

    if (pidArr.length === 0) {
      killByName();
      return;
    }

    log('Closing server console window...');
    closeWindow();
    await new Promise((r) => setTimeout(r, 2000));

    for (const pid of pidArr) sendCtrlC(pid);
    await new Promise((r) => setTimeout(r, 2000));

    let alive = (await findScumPids()).filter((p) => pidArr.includes(p));
    if (alive.length > 0) {
      for (const pid of alive) killPid(pid);
      await new Promise((r) => setTimeout(r, 1000));
    }

    alive = (await findScumPids()).filter((p) => pidArr.includes(p));
    if (alive.length > 0) killByName();
    await new Promise((r) => setTimeout(r, 1000));

    alive = (await findScumPids()).filter((p) => pidArr.includes(p));
    for (const pid of alive) {
      try {
        execSync(`"${WMIC}" process where "ProcessId=${pid}" delete`, {
          stdio: 'pipe', timeout: 10000,
        });
      } catch {}
    }

    const allDead = await waitPidsGone(pidArr, 10000);
    if (!allDead) log('WARNING: Some processes could not be killed');
  }

  private clearStatus(): void {
    if (this.monInterval) {
      clearInterval(this.monInterval);
      this.monInterval = null;
    }
    this.serverPid = null;
    this.status.running = false;
    this.status.pid = null;
  }

  getStatus(): ServerStatus {
    return {
      ...this.status,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
    };
  }

  async setSentryRobots(enabled: boolean): Promise<void> {
    log(`Setting sentry robots: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    try {
      const iniPath = path.join(this.config.serverPath, 'SCUM', 'Saved', 'Config', 'WindowsServer', 'ServerSettings.ini');
      if (!(await fs.pathExists(iniPath))) { log(`ServerSettings.ini not found at ${iniPath}`); return; }
      let content = await fs.readFile(iniPath, 'utf-8');
      if (enabled) {
        content = content.replace(/scum\.DisableSentrySpawning=.*/gi, 'scum.DisableSentrySpawning=False');
        content = content.replace(/scum\.EnableSentryRespawning=.*/gi, 'scum.EnableSentryRespawning=True');
      } else {
        content = content.replace(/scum\.DisableSentrySpawning=.*/gi, 'scum.DisableSentrySpawning=True');
        content = content.replace(/scum\.EnableSentryRespawning=.*/gi, 'scum.EnableSentryRespawning=False');
      }
      if (!content.toLowerCase().includes('scum.disablesentryspawning')) content += `\r\nscum.DisableSentrySpawning=${enabled ? 'False' : 'True'}`;
      if (!content.toLowerCase().includes('scum.enablesentryrespawning')) content += `\r\nscum.EnableSentryRespawning=${enabled ? 'True' : 'False'}`;
      await fs.writeFile(iniPath, content, 'utf-8');
      log(`ServerSettings.ini updated: sentry robots ${enabled ? 'ON' : 'OFF'}`);
    } catch (e: any) { log(`Failed to update sentry robots: ${e.message}`); }
  }

  /** Parse SCUM.log for Global Stats player count */
  private parseLogPlayerCount(): number {
    try {
      const logPath = path.join(
        this.config.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log',
      );
      if (!fs.existsSync(logPath)) return 0;
      const stat = fs.statSync(logPath);
      if (stat.size === 0) return 0;

      const readSize = Math.min(stat.size, 65536);
      const buf = Buffer.alloc(readSize);
      const fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
      fs.closeSync(fd);

      const content = buf[1] === 0 ? buf.toString('utf16le') : buf.toString('utf-8');
      const lines = content.split('\n').filter(Boolean);

      let lastCount = 0;
      for (const line of lines) {
        const m = line.match(/Global Stats:.*?P:\s*(\d+)/);
        if (m) lastCount = parseInt(m[1], 10);
      }
      return lastCount;
    } catch {
      return 0;
    }
  }

  private startMonitoring(): void {
    if (this.monInterval) clearInterval(this.monInterval);
    this.monInterval = setInterval(async () => {
      try {
        const allProcs = await psList();
        const serverProcs = allProcs.filter(
          (p) => p.name && p.name.toLowerCase().includes('scumserver'),
        );
        if (serverProcs.length === 0) {
          if (this.status.running) {
            log('Server process died unexpectedly');
            this.clearStatus();
            if (this.config.autoRestart) {
              log('Auto-restart enabled, restarting in 5s...');
              setTimeout(() => { this.start().catch((e) => log('Auto-restart failed:', e.message)); }, 5000);
            }
          }
          return;
        }
        const p = serverProcs[0];
        this.status.running = true;
        this.status.pid = p.pid;
        this.serverPid = p.pid;
        this.status.memoryUsage = getMemoryMb(p.pid);
        this.status.players = this.parseLogPlayerCount();
      } catch {}
    }, 5000);
  }
}
