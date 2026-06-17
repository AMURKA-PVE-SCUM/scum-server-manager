import { spawn, execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

const APP_ID = '3792580';
const TIMEOUT = 900000;

export interface UpdateProgress {
  state: 'connecting' | 'downloading' | 'preallocating' | 'verifying' | 'committing' | 'finalizing' | 'done' | 'error';
  percent: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  speed?: string;
  detail?: string;
}

export class SteamCmd {
  private steamCmdPath: string;
  private serverPath: string = '';

  constructor(steamCmdPath: string) {
    this.steamCmdPath = steamCmdPath;
  }

  setServerPath(p: string): void {
    this.serverPath = p;
  }

  setSteamCmdPath(p: string): void {
    this.steamCmdPath = p;
  }

  private exePath(): string {
    return path.join(this.steamCmdPath, 'steamcmd.exe');
  }

  private async preventSelfUpdate(): Promise<void> {
    try { await fs.remove(path.join(this.steamCmdPath, 'steamcmd_old.exe')); } catch {}
    try { await fs.remove(path.join(this.steamCmdPath, 'steamcmd_bins_win32.zip')); } catch {}
    try { await fs.remove(path.join(this.steamCmdPath, 'steamcmd_win32.zip')); } catch {}

    // Remove stale package/ directory then create empty file to block self-update writes
    const pkg = path.join(this.steamCmdPath, 'package');
    try { const s = await fs.stat(pkg); if (s.isDirectory()) await fs.remove(pkg); } catch {}
    try { await fs.writeFile(pkg, ''); } catch {}

    const cfg = path.join(this.steamCmdPath, 'steam.cfg');
    try { await fs.writeFile(cfg, 'BootStrapperInhibitAll=1\n', 'utf8'); } catch {}

    const vdf = path.join(this.steamCmdPath, 'steamcmd_update.vdf');
    try { await fs.writeFile(vdf, `"steamcmd_update"\n{\n\t"version"\t"9999999999"\n}\n`, 'utf8'); } catch {}
  }

  private async preventSelfUpdateFull(): Promise<void> {
    const dirsToClean = [
      'appcache', 'depotcache',
      'steamcmd_old.exe', 'steamcmd_bins_win32.zip', 'steamcmd_win32.zip',
    ];
    for (const item of dirsToClean) {
      try { await fs.remove(path.join(this.steamCmdPath, item)); } catch {}
    }
    const pkg = path.join(this.steamCmdPath, 'package');
    try { await fs.remove(pkg); } catch {}
    try { await fs.writeFile(pkg, ''); } catch {}

    const cfg = path.join(this.steamCmdPath, 'steam.cfg');
    try { await fs.writeFile(cfg, 'BootStrapperInhibitAll=1\n', 'utf8'); } catch {}

    const vdf = path.join(this.steamCmdPath, 'steamcmd_update.vdf');
    try { await fs.writeFile(vdf, `"steamcmd_update"\n{\n\t"version"\t"9999999999"\n}\n`, 'utf8'); } catch {}
  }

  async install(): Promise<void> {
    const exe = this.exePath();
    if (await fs.pathExists(exe)) return;
    await fs.ensureDir(this.steamCmdPath);
    const url = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
    const zipPath = path.join(this.steamCmdPath, 'steamcmd.zip');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(zipPath, buf);
    await this.extractZip(zipPath);
    await fs.remove(zipPath);
    if (!(await fs.pathExists(exe))) throw new Error('steamcmd.exe not found after extraction');
    await this.preventSelfUpdate();
  }

  private async extractZip(zipPath: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const p = spawn('powershell', ['-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${this.steamCmdPath}' -Force`], { stdio: 'ignore' });
          p.on('close', (c) => c === 0 ? resolve() : reject(new Error(`PowerShell Expand-Archive exit code ${c}`)));
          p.on('error', reject);
        });
        return;
      } catch {
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        try {
          await new Promise<void>((resolve, reject) => {
            const p = spawn('tar', ['-xf', zipPath, '-C', this.steamCmdPath], { stdio: 'ignore' });
            p.on('close', (c) => c === 0 ? resolve() : reject(new Error(`tar exit code ${c}`)));
            p.on('error', reject);
          });
          return;
        } catch {
          throw new Error('Extraction failed: PowerShell и tar недоступны');
        }
      }
    }
  }

  private readManifestBuildId(): string | null {
    try {
      const p = path.join(this.serverPath, 'steamapps', `appmanifest_${APP_ID}.acf`);
      if (!fs.existsSync(p)) return null;
      const m = fs.readFileSync(p, 'utf8').match(/"buildid"\s+"(\d+)"/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  async checkForUpdate(): Promise<{ available: boolean; currentBuild: string; latestBuild: string; error: string }> {
    try {
      const currentBuild = this.readManifestBuildId() || '0';
      const r = await fetch(`https://api.steamcmd.net/v1/info/${APP_ID}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return { available: false, currentBuild, latestBuild: 'unknown', error: `API HTTP ${r.status}` };
      const data = await r.json();
      const latestBuild = data?.data?.[APP_ID]?.depots?.branches?.public?.buildid;
      if (!latestBuild) return { available: false, currentBuild, latestBuild: 'unknown', error: 'Build ID not found in API response' };
      return { available: currentBuild !== latestBuild, currentBuild, latestBuild, error: '' };
    } catch (e: any) {
      return { available: false, currentBuild: '', latestBuild: '', error: e.message };
    }
  }

  updateServer(): Promise<string> {
    return this.doUpdate();
  }

  runUpdateWithProgress(onLine: (line: string) => void): Promise<string> {
    return this.doUpdate(onLine);
  }

  runUpdateWithDetailedProgress(onProgress: (progress: UpdateProgress) => void): Promise<string> {
    return this.doUpdate(undefined, onProgress);
  }

  private parseSteamCmdProgress(line: string, current: UpdateProgress): UpdateProgress {
    const progressMatch = line.match(/progress:\s*([\d.]+)\s*\((\d+)\s*\/\s*(\d+)\)/i);
    if (progressMatch) {
      current.percent = parseFloat(progressMatch[1]);
      current.bytesDownloaded = parseInt(progressMatch[2]);
      current.bytesTotal = parseInt(progressMatch[3]);
    }

    const simpleProgressMatch = line.match(/progress:\s*([\d.]+)/i);
    if (!progressMatch && simpleProgressMatch) {
      current.percent = parseFloat(simpleProgressMatch[1]);
    }

    if (/Update state \(0x3\)/i.test(line)) {
      current.state = 'connecting';
      current.detail = 'Reconfiguring...';
    } else if (/Update state \(0x5\)/i.test(line)) {
      current.state = 'preallocating';
      current.detail = 'Preallocating disk space...';
    } else if (/Update state \(0x61\)/i.test(line) || /downloading/i.test(line)) {
      current.state = 'downloading';
      const depotMatch = line.match(/depot\s+(\d+)/i);
      if (depotMatch) current.detail = `Downloading depot ${depotMatch[1]}...`;
      else current.detail = 'Downloading...';
    } else if (/Update state \(0x63\)/i.test(line) || /verif/i.test(line)) {
      current.state = 'verifying';
      current.detail = 'Verifying installation...';
    } else if (/Update state \(0x65\)/i.test(line) || /commit/i.test(line)) {
      current.state = 'committing';
      current.detail = 'Committing files...';
    } else if (/Success!/i.test(line)) {
      current.state = 'done';
      current.percent = 100;
      current.detail = 'Update complete!';
    } else if (/Already up to date/i.test(line)) {
      current.state = 'done';
      current.percent = 100;
      current.detail = 'Already up to date';
    } else if (/Error|error|FAILED|fatal/i.test(line) && !/progress/i.test(line)) {
      current.state = 'error';
      current.detail = line.slice(0, 200);
    }

    const speedMatch = line.match(/([\d.]+)\s*(MB\/s|KB\/s|GB\/s)/i);
    if (speedMatch) current.speed = speedMatch[0];

    return current;
  }

  private async doUpdate(onLine?: (line: string) => void, onProgress?: (progress: UpdateProgress) => void): Promise<string> {
    if (!this.serverPath) throw new Error('Server path not set');
    await this.preventSelfUpdate();
    const before = this.readManifestBuildId();
    console.log(`[SteamCMD] serverPath=${this.serverPath}, before buildId=${before}`);
    const args = ['+force_install_dir', this.serverPath, '+login', 'anonymous', '+app_update', APP_ID, 'validate', '+quit'];

    const progress: UpdateProgress = { state: 'connecting', percent: 0, detail: 'Connecting to Steam...' };
    if (onProgress) onProgress(progress);

    for (let attempt = 1; attempt <= 3; attempt++) {
      let sawSuccess = false;

      try {
        const wrappedLine = (line: string) => {
          if (onLine) onLine(line);
          if (/Success!/i.test(line)) sawSuccess = true;
          if (onProgress) {
            this.parseSteamCmdProgress(line, progress);
            onProgress({ ...progress });
          }
        };

        const output = await this.spawnSteamCmd(args, true, wrappedLine);

        if (/Success!/i.test(output)) sawSuccess = true;

        console.log(`[SteamCMD] attempt=${attempt} sawSuccess=${sawSuccess}`);
        console.log(`[SteamCMD] output tail: ${output.trim().split('\n').slice(-5).join(' | ')}`);

        if (onProgress) {
          progress.state = 'done';
          progress.percent = 100;
          progress.detail = 'Complete';
          onProgress({ ...progress });
        }

        await new Promise(r => setTimeout(r, 1000));
        const after = this.readManifestBuildId();
        console.log(`[SteamCMD] after buildId=${after}`);

        if (output.toLowerCase().includes('already up to date')) return 'already_up_to_date';
        if (sawSuccess) return 'update_applied';
        if (after && before && after !== before) return 'update_applied';
        if (!after && !before) return 'done';
        return 'update_applied';
      } catch (e: any) {
        const msg = e.message || '';
        const isCorrupted = msg.includes('Fatal Error') || msg.includes('4294967294') || msg.includes('must be online') || msg.includes('threadtools');
        const isRecoverable = [1, 6, 8].includes(e.exitCode);

        console.log(`[SteamCMD] attempt=${attempt} error: ${msg}, exitCode=${e.exitCode}`);

        if (onProgress) {
          progress.state = 'error';
          progress.detail = `Attempt ${attempt}/3 failed: ${msg.slice(0, 200)}`;
          onProgress({ ...progress });
        }

        if (attempt < 3 && (isRecoverable || isCorrupted)) {
          if (isCorrupted) {
            if (onProgress) {
              progress.state = 'connecting';
              progress.percent = 0;
              progress.detail = 'SteamCMD corrupted, reinstalling...';
              onProgress({ ...progress });
            }
            try {
              await this.preventSelfUpdateFull();
              await fs.remove(this.exePath());
              await this.install();
            } catch (reinstallErr: any) {
              const hints: string[] = [
                `1. Добавьте папки "${this.steamCmdPath}" и "${this.serverPath}" в исключения антивируса/Defender`,
                `2. Проверьте подключение к интернету`,
                `3. DNS: попробуйте 8.8.8.8`,
                `4. Запустите приложение от имени администратора`,
                `5. Вручную скачайте steamcmd.zip с https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip и распакуйте в "${this.steamCmdPath}"`,
              ];
              throw new Error(
                `SteamCMD corrupted (code 4294967294). Reinstall failed.\n\n` +
                `Hints:\n${hints.join('\n')}\n\n` +
                `Error: ${reinstallErr.message}`
              );
            }
          }
          if (onProgress) {
            progress.state = 'connecting';
            progress.detail = `Retrying... (attempt ${attempt + 1}/3)`;
            onProgress({ ...progress });
          }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        throw e;
      }
    }
    throw new Error('Update failed after 3 attempts');
  }

  async manualUpdate(): Promise<void> {
    await this.install();
  }

  async validateServer(): Promise<void> {
    if (!this.serverPath) throw new Error('Server path not set');
    const args = ['+force_install_dir', this.serverPath, '+login', 'anonymous', '+app_update', APP_ID, 'validate', '+quit'];
    await this.spawnSteamCmd(args, false);
  }

  private spawnSteamCmd(args: string[], captureOutput: boolean, onLine?: (line: string) => void): Promise<string> {
    const exe = this.exePath();
    console.log(`[SteamCMD] spawn: ${exe} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(exe)) return reject(new Error('SteamCMD not found'));

      const proc = spawn(exe, args, {
        cwd: this.steamCmdPath,
        windowsHide: false,
        stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      });

      const t = setTimeout(() => {
        console.log(`[SteamCMD] TIMEOUT after ${TIMEOUT / 1000}s, killing PID ${proc.pid}`);
        try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
        reject(Object.assign(new Error('SteamCMD timeout - no response for 15 minutes'), { exitCode: -1 }));
      }, TIMEOUT);

      let output = '';

      if (captureOutput) {
        const onData = (data: Buffer) => {
          const text = data.toString('utf8');
          output += text;
          if (onLine) text.split('\n').filter(Boolean).forEach(l => onLine(l.trim()));
        };
        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', onData);
      }

      proc.on('error', (e) => { clearTimeout(t); reject(e); });
      proc.on('close', (code) => {
        clearTimeout(t);
        console.log(`[SteamCMD] process closed with code=${code}`);
        if (code === 0 || code === 7) resolve(captureOutput ? output : '');
        else {
          const tail = captureOutput ? output.trim().split('\n').slice(-5).join(' | ').slice(0, 500) : '';
          reject(Object.assign(new Error(`SteamCMD exit code ${code}: ${tail}`), { exitCode: code }));
        }
      });
    });
  }
}
