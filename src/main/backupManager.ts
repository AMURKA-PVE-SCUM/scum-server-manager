import fs from 'fs-extra';
import path from 'path';
import type { BackupConfig, BackupInfo } from './types';

export class BackupManager {
  private config: BackupConfig;
  private serverPath: string;

  constructor(config: BackupConfig, serverPath = '') {
    this.config = config;
    this.serverPath = serverPath;
  }

  setServerPath(p: string): void {
    this.serverPath = p;
  }

  updateConfig(config: BackupConfig): void {
    this.config = config;
  }

  async listBackups(): Promise<BackupInfo[]> {
    const backupPath = this.config.path;
    if (!backupPath || !(await fs.pathExists(backupPath))) return [];
    const entries = await fs.readdir(backupPath);
    const backups: BackupInfo[] = [];
    for (const entry of entries) {
      const full = path.join(backupPath, entry);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        backups.push({
          id: entry, name: entry,
          timestamp: stat.birthtime.toISOString(),
          size: stat.size, files: 0,
          type: entry.startsWith('auto_') ? 'auto' : 'manual',
        });
      }
    }
    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async createBackup(name?: string): Promise<BackupInfo> {
    const backupPath = this.config.path;
    await fs.ensureDir(backupPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = name || `auto_${timestamp}`;
    const destPath = path.join(backupPath, backupName);
    await fs.ensureDir(destPath);

    if (this.serverPath) {
      const configDir = path.join(this.serverPath, 'SCUM', 'Saved', 'Config', 'WindowsServer');
      const savesDir = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles');
      if (await fs.pathExists(configDir)) {
        await fs.copy(configDir, path.join(destPath, 'Config'));
      }
      if (await fs.pathExists(savesDir)) {
        await fs.copy(savesDir, path.join(destPath, 'SaveFiles'));
      }
    }

    if (!name && this.config.retention > 0) {
      await this.cleanupOldBackups();
    }

    return { id: backupName, name: backupName, timestamp: new Date().toISOString(), size: 0, files: 0, type: name ? 'manual' : 'auto' };
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const all = await this.listBackups();
      const autoBackups = all.filter((b) => b.type === 'auto');
      if (autoBackups.length > this.config.retention) {
        const toDelete = autoBackups.slice(this.config.retention);
        for (const b of toDelete) {
          await this.deleteBackup(b.id);
        }
      }
    } catch {}
  }

  async restoreBackup(backupId: string): Promise<boolean> {
    const backupPath = path.join(this.config.path, backupId);
    if (!(await fs.pathExists(backupPath))) throw new Error('Backup not found');
    if (!this.serverPath) throw new Error('Server path not configured');
    await fs.copy(backupPath, this.serverPath, { overwrite: true });
    return true;
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    const p = path.join(this.config.path, backupId);
    await fs.remove(p);
    return true;
  }
}
