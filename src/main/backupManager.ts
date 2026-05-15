import fs from 'fs-extra';
import path from 'path';
import type { BackupConfig, BackupInfo } from './types';

// Simple zip without archiver dependency - use fs-extra copy
export class BackupManager {
  private config: BackupConfig;
  private serverPath: string;

  constructor(config: BackupConfig, serverPath: string = '') {
    this.config = config;
    this.serverPath = serverPath;
  }

  setServerPath(p: string): void {
    this.serverPath = p;
  }

  async listBackups(): Promise<BackupInfo[]> {
    const backupPath = this.config.path;
    if (!backupPath || !(await fs.pathExists(backupPath))) return [];

    const entries = await fs.readdir(backupPath);
    const backups: BackupInfo[] = [];

    for (const entry of entries) {
      const stat = await fs.stat(path.join(backupPath, entry));
      if (stat.isDirectory()) {
        backups.push({
          id: entry,
          name: entry,
          timestamp: stat.birthtime.toISOString(),
          size: stat.size,
          files: 0,
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
      await fs.copy(this.serverPath, destPath);
    }

    return {
      id: backupName,
      name: backupName,
      timestamp: new Date().toISOString(),
      size: 0,
      files: 0,
      type: name ? 'manual' : 'auto',
    };
  }

  async restoreBackup(backupId: string): Promise<boolean> {
    const backupPath = path.join(this.config.path, backupId);
    if (!(await fs.pathExists(backupPath))) throw new Error('Backup not found');

    if (!this.serverPath) throw new Error('Server path not configured');
    await fs.copy(backupPath, this.serverPath, { overwrite: true });
    return true;
  }

  async deleteBackup(backupId: string): Promise<boolean> {
    const backupPath = path.join(this.config.path, backupId);
    await fs.remove(backupPath);
    return true;
  }
}
