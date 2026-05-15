import type { DiscordConfig } from './types';
export declare class DiscordWebhook {
    private config;
    constructor(config: DiscordConfig);
    send(webhookUrl: string, content: string, title?: string): Promise<boolean>;
    sendAdminLog(message: string): Promise<boolean>;
    sendChatMessage(player: string, message: string): Promise<boolean>;
    sendVehicleEvent(event: string): Promise<boolean>;
    sendLoginEvent(player: string, steamId: string): Promise<boolean>;
    sendStatusUpdate(status: string): Promise<boolean>;
    test(webhookUrl: string): Promise<boolean>;
}
//# sourceMappingURL=discordWebhook.d.ts.map