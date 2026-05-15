import type { ServerConfig, ServerStatus } from './types';
export declare class ServerManager {
    private config;
    private startTime;
    private monInterval;
    private status;
    constructor(config: ServerConfig);
    /** Verify the SendCtrlC helper exists, warn if not */
    private ensureTools;
    private get maxPlayers();
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    /** Aggressive multi-method kill for all server processes */
    private killAllServers;
    getStatus(): ServerStatus;
    private startMonitoring;
}
//# sourceMappingURL=serverManager.d.ts.map