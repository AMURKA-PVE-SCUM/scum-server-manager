export interface ServerConfig {
    serverPath: string;
    steamCmdPath: string;
    serverPort: number;
    queryPort: number;
    maxPlayers: number;
    fileOpenLog: boolean;
    autoStart: boolean;
    autoRestart: boolean;
    restartSchedule: string[];
    restartMode?: 'interval' | 'specific';
    restartIntervalHours?: number;
    restartDays?: number[];
}
export interface DiscordConfig {
    adminLogWebhook: string;
    chatWebhook: string;
    vehicleWebhook: string;
    loginWebhook: string;
    serverStatusWebhook: string;
    enabled: boolean;
}
export interface BackupConfig {
    enabled: boolean;
    interval: number;
    retention: number;
    path: string;
}
export interface AppConfig {
    server: ServerConfig;
    discord: DiscordConfig;
    backup: BackupConfig;
    theme: 'dark' | 'light';
    language: string;
}
export interface ServerStatus {
    running: boolean;
    pid: number | null;
    uptime: number;
    cpuUsage: number;
    memoryUsage: number;
    players: number;
    maxPlayers: number;
    fps: number;
}
export interface PlayerInfo {
    steamId: string;
    name: string;
    ip: string;
    ping: number;
    timeConnected: number;
}
export interface LogEvent {
    id: string;
    timestamp: string;
    type: 'admin' | 'chat' | 'login' | 'vehicle' | 'system';
    message: string;
    details?: Record<string, string>;
}
export interface BackupInfo {
    id: string;
    name: string;
    timestamp: string;
    size: number;
    files: number;
    type: 'auto' | 'manual';
}
//# sourceMappingURL=types.d.ts.map