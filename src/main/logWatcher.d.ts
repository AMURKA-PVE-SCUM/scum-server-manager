import type { LogEvent } from './types';
import { DiscordWebhook } from './discordWebhook';
export declare class LogWatcher {
    private events;
    private watchers;
    private discord;
    private serverPath;
    private offsets;
    constructor(serverPath: string, discord: DiscordWebhook);
    startWatching(): void;
    private handleFileChange;
    private processLine;
    getEvents(): LogEvent[];
    getEventsByType(type: string): LogEvent[];
    stop(): void;
}
//# sourceMappingURL=logWatcher.d.ts.map