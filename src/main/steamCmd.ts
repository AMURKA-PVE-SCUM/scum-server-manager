import { spawn, execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

const APP_ID = '3792580';
const TIMEOUT = 600000;

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
    const dirsToClean = [
      'appcache', 'depotcache',
      'steamcmd_old.exe', 'steamcmd_bins_win32.zip', 'steamcmd_win32.zip',
    ];
    for (const item of dirsToClean) {
      const p = path.join(this.steamCmdPath, item);
      try { await fs.remove(p); } catch {}
    }
    // Удаляем package/ (папку) и создаём файл package — SteamCMD не сможет
    // записать туда обновление и пропустит самообновление.
    const pkg = path.join(this.steamCmdPath, 'package');
    try { await fs.remove(pkg); } catch {}
    try { await fs.writeFile(pkg, ''); } catch {}

    // steam.cfg с пустым bootstrapper — SteamCMD не будет проверять версию
    const cfg = path.join(this.steamCmdPath, 'steam.cfg');
    try { await fs.writeFile(cfg, 'BootStrapperInhibitAll=1\n', 'utf8'); } catch {}

    const vdf = path.join(this.steamCmdPath, 'steamcmd_update.vdf');
    try { await fs.writeFile(vdf, `"steamcmd_update"\n{\n\t"version"\t"9999999999"\n}\n`, 'utf8'); } catch {}
    for (const sub of ['logs', 'config']) {
      const p = path.join(this.steamCmdPath, sub);
      try { await fs.emptyDir(p); } catch {}
    }
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

  private async doUpdate(onLine?: (line: string) => void): Promise<string> {
    if (!this.serverPath) throw new Error('Server path not set');
    await this.preventSelfUpdate();
    const before = this.readManifestBuildId();
    const args = ['+force_install_dir', this.serverPath, '+login', 'anonymous', '+app_update', APP_ID, 'validate', '+quit'];

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const output = await this.spawnSteamCmd(args, true, onLine);
        const after = this.readManifestBuildId();
        if (after && before && after !== before) return 'update_applied';
        if (!after && !before) return 'done';
        if (output.toLowerCase().includes('already up to date')) return 'already_up_to_date';
        return 'already_up_to_date';
      } catch (e: any) {
        const msg = e.message || '';
        const isCorrupted = msg.includes('Fatal Error') || msg.includes('4294967294') || msg.includes('must be online') || msg.includes('threadtools');
        const isRecoverable = [1, 6, 8].includes(e.exitCode);
        if (attempt < 3 && (isRecoverable || isCorrupted)) {
          if (isCorrupted) {
            try {
              await this.preventSelfUpdate();
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
                `SteamCMD повреждён (код 4294967294). Переустановка не удалась.\n\n` +
                `Рекомендации:\n${hints.join('\n')}\n\n` +
                `Ошибка: ${reinstallErr.message}`
              );
            }
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

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(exe)) return reject(new Error('SteamCMD not found'));

      const proc = spawn(exe, args, {
        cwd: this.steamCmdPath,
        windowsHide: true,
        stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'ignore',
      });

      const t = setTimeout(() => {
        try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
        reject(Object.assign(new Error('Timeout'), { exitCode: -1 }));
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
        if (code === 0 || code === 7) resolve(captureOutput ? output : '');
        else {
          const tail = captureOutput ? output.trim().split('\n').slice(-3).join(' ').slice(0, 500) : '';
          reject(Object.assign(new Error(`SteamCMD exit code ${code}: ${tail}`), { exitCode: code }));
        }
      });
    });
  }
}
