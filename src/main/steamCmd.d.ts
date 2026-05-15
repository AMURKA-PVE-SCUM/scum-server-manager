export declare class SteamCmd {
    private steamCmdPath;
    private serverPath;
    constructor(steamCmdPath: string);
    setServerPath(p: string): void;
    install(): Promise<void>;
    private killExistingSteamCmd;
    private runSteamCmd;
    updateServer(): Promise<void>;
    validateServer(): Promise<void>;
}
//# sourceMappingURL=steamCmd.d.ts.map