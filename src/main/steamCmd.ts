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

    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const proc = spawn(steamCmdExe, args, {
        cwd: this.steamCmdPath,
        stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      });

      if (captureOutput) {
        proc.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          if (onLine) {
            text.split('\n').filter(Boolean).forEach((l) => onLine(l.trim()));
          } else {
            output.push(text);
            // Cap output buffer at 64KB to prevent OOM
            if (output.join('').length > 65536) {
              output.splice(0, Math.floor(output.length / 2));
            }
          }
        });
        proc.stderr?.on('data', (data: Buffer) => {
          const text = data.toString();
          if (onLine) {
            text.split('\n').filter(Boolean).forEach((l) => onLine(l.trim()));
          } else {
            output.push(text);
            if (output.join('').length > 65536) {
              output.splice(0, Math.floor(output.length / 2));
            }
          }
        });
      }

      const timeout = setTimeout(() => {
        try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
        reject(new Error('SteamCMD timeout'));
      }, 600000);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Ошибка запуска SteamCMD: ${err.message}`));
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        const out = output.join('\n');
        if (code === 0) resolve(out);
        else if (code === 8) reject(new Error(
          `SteamCMD: ошибка 8. Не удалось установить приложение. Попробуйте перезапустить SteamCMD или проверить соединение.`
        ));
        else if (code === 7) reject(new Error(
          `SteamCMD: ошибка соединения (код 7). Проверьте интернет и firewall. Сервера Steam могут быть недоступны.`
        ));
        else if (code === 6) reject(new Error(
          `SteamCMD: ошибка входа (код 6). Неверный логин или пароль. Проверьте данные в Settings → App Settings.`
        ));
        else if (code === 5) reject(new Error(
          `SteamCMD: ошибка блокировки БД (код 5). Удалите файл ${this.steamCmdPath}\\steamapps\\appcache\\appinfo.vdf и попробуйте снова.`
        ));
        else reject(new Error(
          `SteamCMD: ошибка ${code}. Проверьте консоль выше для подробностей.`
        ));
      });
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
