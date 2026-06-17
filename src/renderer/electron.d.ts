interface ElectronAPI {
  config: {
    get: () => Promise<any>;
    set: (config: any) => Promise<boolean>;
  };
  server: {
    start: () => Promise<any>;
    stop: () => Promise<any>;
    restart: () => Promise<any>;
    status: () => Promise<{
      running: boolean; pid: number | null; uptime: number;
      cpuUsage: number; memoryUsage: number;
      players: number; maxPlayers: number; fps: number;
      playersList: Array<{ steamId: string; name: string; ip: string; ping: number; timeConnected: number }>;
    }>;
    checkUpdate: () => Promise<{ available: boolean; currentBuild: string; latestBuild: string; error: string }>;
    update: () => Promise<string>;
    updateStream: () => Promise<string>;
    onUpdateLine: (cb: (line: string) => void) => void;
    onUpdateProgress: (cb: (progress: { state: string; percent: number; bytesDownloaded?: number; bytesTotal?: number; speed?: string; detail?: string }) => void) => void;
    onUpdateDone: (cb: (result: string) => void) => void;
    removeUpdateListeners: () => void;
    consoleStart: () => Promise<void>;
    consoleStop: () => Promise<void>;
    onConsoleLines: (cb: (lines: string[]) => void) => void;
    removeConsoleListeners: () => void;
  };
  steamcmd: {
    install: () => Promise<boolean>;
  };
  files: {
    read: (filePath: string) => Promise<string>;
    write: (filePath: string, content: string) => Promise<boolean>;
    list: (dirPath: string) => Promise<any[]>;
  };
  backup: {
    list: () => Promise<any[]>;
    create: (name?: string) => Promise<any>;
    restore: (id: string) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
  };
  logs: {
    get: () => Promise<any[]>;
    getByType: (type: string) => Promise<any[]>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
  };
  discord: {
    test: (webhookUrl: string) => Promise<boolean>;
  };
  ftp: {
    start: (port: number, user: string, pass: string, pasvHost?: string) => Promise<boolean>;
    stop: () => Promise<boolean>;
    status: () => Promise<{ running: boolean }>;
    saveConfig: (cfg: any) => Promise<boolean>;
  };
  webPanel: {
    start: () => Promise<boolean>;
    stop: () => Promise<boolean>;
    status: () => Promise<{ running: boolean }>;
    saveConfig: (cfg: any) => Promise<boolean>;
  };
  db: {
    init: () => Promise<{ ok: boolean; tables?: string[]; error?: string }>;
    status: () => Promise<{ available: boolean; open: boolean }>;
    getPlayers: () => Promise<any[]>;
    getPlayerBySteamId: (sid: string) => Promise<any>;
    getPlayerByName: (name: string) => Promise<any>;
    getWallet: (sid: string) => Promise<any>;
    getAttributes: (sid: string) => Promise<any>;
    getSkills: (sid: string) => Promise<any[]>;
    getInventory: (sid: string) => Promise<any[]>;
    getQuickSlots: (sid: string) => Promise<any[]>;
    getSquads: () => Promise<any[]>;
    getVehicles: () => Promise<any[]>;
    getFlags: () => Promise<any[]>;
    getBankAccounts: () => Promise<any[]>;
    getEconomyLeaderboard: () => Promise<any[]>;
  };
  rcon: {
    connect: (config: any) => Promise<any>;
    disconnect: () => Promise<void>;
    sendCommand: (command: string) => Promise<any>;
    status: () => Promise<any>;
    saveConfig: (config: any) => Promise<void>;
  };
}

interface Window {
  electronAPI: ElectronAPI;
}
