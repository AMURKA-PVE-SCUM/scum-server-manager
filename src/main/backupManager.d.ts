import type { BackupConfig, BackupInfo } from './types';
export declare class BackupManager {
    private config;
    private serverPath;
    constructor(config: BackupConfig, serverPath?: string);
    setServerPath(p: string): void;
    listBackups(): Promise<BackupInfo[]>;
    createBackup(name?: string): Promise<BackupInfo>;
    restoreBackup(backupId: string): Promise<boolean>;
    deleteBackup(backupId: string): Promise<boolean>;
}
//# sourceMappingURL=backupManager.d.ts.map