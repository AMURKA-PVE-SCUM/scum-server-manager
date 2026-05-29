import { spawn, execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';

export class SteamCmd {
  private steamCmdPath: string;
  private serverPath: string = '';

  constructor(steamCmdPath: string) {
    this.steamCmdPath = steamCmdPath;
  }

  setServerPath(p: string): void {
    this.serverPath = p;
  }

  async install(): Promise<void> {
    const steamCmdExe = path.join(this.steamCmdPath, 'steamcmd.exe');
    if (await fs.pathExists(steamCmdExe)) return;

    await fs.ensureDir(this.steamCmdPath);

    const downloadUrl = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
    const zipPath = path.join(this.steamCmdPath, 'steamcmd.zip');

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Failed to download SteamCMD: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(zipPath, buffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('powershell', [
        '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${this.steamCmdPath}' -Force`,
      ], { stdio: 'inherit' });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('Extraction failed')));
      proc.on('error', reject);
    });

    await fs.remove(zipPath);
  }

  private killExistingSteamCmd(): void {
    try {
      execSync('taskkill /F /IM steamcmd.exe 2>nul', { stdio: 'ignore' });
    } catch {}
  }

  private async runSteamCmd(args: string[], captureOutput = false, onLine?: (line: string) => void): Promise<string> {
    const steamCmdExe = path.join(this.steamCmdPath, 'steamcmd.exe');
    if (!(await fs.pathExists(steamCmdExe))) {
      throw new Error(`SteamCMD не найден: ${steamCmdExe}. Установите его в Settings → Server Install.`);
    }

    this.killExistingSteamCmd();
    await new Promise((r) => setTimeout(r, 1000));

    if (!captureOutput) {
      return new Promise((resolve, reject) => {
        const proc = spawn(steamCmdExe, args, {
          cwd: this.steamCmdPath, stdio: 'ignore', windowsHide: true,
        });
        const t = setTimeout(() => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {} reject(new Error('SteamCMD timeout')); }, 600000);
        proc.on('error', (err) => { clearTimeout(t); reject(err); });
        proc.on('close', (code) => { clearTimeout(t); code === 0 ? resolve('') : reject(new Error(`SteamCMD exit code ${code}`)); });
      });
    }

    const q = (s: string) => s.includes(' ') ? `"${s}"` : s;

    const logPath = path.join(this.steamCmdPath, 'steamcmd_update.log');
    try { fs.unlinkSync(logPath); } catch {}

    const batchPath = path.join(this.steamCmdPath, 'steamcmd_update.bat');
    const cmdEscaped = `${q(steamCmdExe)} ${args.map(q).join(' ')}`;
    fs.writeFileSync(batchPath, `@echo off\r\n${cmdEscaped} >"${logPath}" 2>&1\r\nset EXITCODE=%ERRORLEVEL%\r\necho.\r\necho SteamCMD exit code: %EXITCODE%\r\npause\r\n`, 'utf8');

    const batchProc = spawn(batchPath, [], {
      cwd: this.steamCmdPath, stdio: 'ignore', windowsHide: false, detached: true,
    });
    batchProc.unref();

    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        try { execSync(`taskkill /F /IM steamcmd.exe`, { stdio: 'ignore' }); } catch {}
        try { if (batchProc.pid) execSync(`taskkill /F /PID ${batchProc.pid} /T`, { stdio: 'ignore' }); } catch {}
        reject(new Error('SteamCMD timeout (10 min)'));
      }, 600000);

      let lastSize = 0;
      const pollLog = setInterval(() => {
        try {
          if (!fs.existsSync(logPath)) return;
          const s = fs.statSync(logPath).size;
          if (s > lastSize) {
            const buf = Buffer.alloc(s - lastSize);
            const fd = fs.openSync(logPath, 'r');
            fs.readSync(fd, buf, 0, buf.length, lastSize);
            fs.closeSync(fd);
            lastSize = s;
            if (onLine) buf.toString('utf8').split('\n').filter(Boolean).forEach((l) => onLine(l.trim()));
          }
        } catch {}
      }, 1000);

      const checkDone = setInterval(() => {
        const pid = batchProc.pid;
        if (!pid) { clearInterval(pollLog); clearInterval(checkDone); clearTimeout(t); resolve(''); return; }
        try {
          const r = execSync(`tasklist /V /FO CSV /NH /FI "PID eq ${pid}"`, { stdio: 'pipe', encoding: 'utf8', timeout: 3000 });
          if (!r.includes(pid.toString())) throw new Error('done');
        } catch {
          clearInterval(pollLog); clearInterval(checkDone); clearTimeout(t);
          setTimeout(() => {
            try {
              const out = fs.readFileSync(logPath, 'utf8');
              const lower = out.toLowerCase();
              if (lower.includes('error') || lower.includes('failure') || lower.includes('not found')) reject(new Error(`SteamCMD error. Лог: ${logPath}`));
              else resolve(out);
            } catch { resolve(''); }
          }, 2000);
        }
      }, 2000);

    });
  }

  /** Check if an update is available (fast, no download) */
  async checkForUpdate(): Promise<{ available: boolean; error: string }> {
    try {
      const args: string[] = [];
      if (this.serverPath) args.push('+force_install_dir', this.serverPath);
      args.push('+login', 'anonymous');
      args.push('+app_info_update', '1');
      args.push('+app_info_request', '3792580');
      args.push('+quit');
      await this.runSteamCmd(args, false);
      return { available: false, error: '' };
    } catch (e: any) {
      return { available: false, error: e.message };
    }
  }

  updateServer(): Promise<string> {
    return this.runUpdateCapture();
  }

  /** Run update with real-time progress callback (returns lines via emitter) */
  runUpdateWithProgress(onLine: (line: string) => void): Promise<string> {
    return this.runUpdateCapture(onLine);
  }

  private async runUpdateCapture(onLine?: (line: string) => void): Promise<string> {
    const args: string[] = [];
    if (this.serverPath) args.push('+force_install_dir', this.serverPath);
    args.push('+login', 'anonymous');
    args.push('+app_update', '3792580', 'validate', '+quit');
    const output = await this.runSteamCmd(args, true, onLine);
    const lower = output.toLowerCase();
    if (lower.includes('already up to date') || lower.includes('success')) {
      return 'already_up_to_date';
    }
    if (lower.includes('downloading')) {
      return 'update_applied';
    }
    return 'done';
  }

  async validateServer(): Promise<void> {
    const args: string[] = [];
    if (this.serverPath) {
      args.push('+force_install_dir', this.serverPath);
    }
    args.push('+login', 'anonymous');
    args.push('+app_update', '3792580', 'validate', '+quit');
    await this.runSteamCmd(args);
  }
}
