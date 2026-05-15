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
      updateAvailable: boolean; updateCheckError: string;
    }>;
    checkUpdate: () => Promise<any>;
    update: () => Promise<string>;
    updateStream: () => Promise<string>;
    onUpdateLine: (cb: (line: string) => void) => void;
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
}

interface Window {
  electronAPI: ElectronAPI;
}