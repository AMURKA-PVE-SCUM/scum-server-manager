export interface ServerConfig {
  serverName: string;
  serverPath: string;
  steamCmdPath: string;
  serverPort: number;
  queryPort: number;
  maxPlayers: number;
  fileOpenLog: boolean;
  noBattlEye: boolean;
  autoStart: boolean;
  autoRestart: boolean;
  restartSchedule: string[];
  restartMode?: 'interval' | 'specific';
  restartIntervalHours?: number;
  restartDays?: number[];
  robotScheduleEnabled: boolean;
  robotEnableTime: string;
  robotDisableTime: string;
  robotEnableDays: number[];
  robotDisableDays: number[];
  robotEnableCommand: string;
  robotDisableCommand: string;
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

export interface FtpConfig {
  enabled: boolean;
  port: number;
  username: string;
  password: string;
  pasvHost?: string;
}

export interface WebPanelConfig {
  enabled: boolean;
  port: number;
  username: string;
  password: string;
}

export interface RconConfig {
  enabled: boolean;
  host: string;
  port: number;
  password: string;
}

export interface OnlinePlayer {
  steamId: string;
  name: string;
  connectedAt: Date;
  location?: { x: number; y: number; z: number };
  fame?: number;
  balance?: number;
  gold?: number;
}

export interface PackItem {
  itemId: string;
  amount: number;
}

export interface PackConfig {
  starter: {
    enabled: boolean;
    items: PackItem[];
    cooldownHours: number;
  };
  daily: {
    enabled: boolean;
    items: PackItem[];
    cooldownHours: number;
  };
}

export interface TeleportLocation {
  name: string;
  x: number;
  y: number;
  z: number;
  price: number;
  goldPrice?: number;
  famePrice?: number;
}

export interface VipPlayer {
  steamId: string;
  expiresAt: number;
  note?: string;
}

export interface VipBonus {
  items: PackItem[];
  money: number;
  gold: number;
  fame: number;
}

export interface VipConfig {
  enabled: boolean;
  players: VipPlayer[];
  starterBonus: VipBonus;
  dailyBonus: VipBonus;
}

export interface VehicleTeleportConfig {
  enabled: boolean;
  maxVehicles: number;
  vipMaxVehicles: number;
  registerRadius: number;
  teleportPrice: number;
  teleportGoldPrice?: number;
  teleportFamePrice?: number;
  cooldownSeconds: number;
  players: VipPlayer[];
}

export interface SaveHomeConfig {
  enabled: boolean;
  maxLocations: number;
  vipMaxLocations: number;
  teleportPrice: number;
  teleportGoldPrice?: number;
  teleportFamePrice?: number;
}

export interface VoteConfig {
  enabled: boolean;
  weatherEnabled: boolean;
  timeEnabled: boolean;
  cooldownSeconds: number;
  vipCooldownSeconds: number;
}

export interface ShopItem {
  type: 'item' | 'vehicle';
  itemName: string;
  amount: number;
  price: number;
  goldPrice?: number;
  famePrice?: number;
  enabled: boolean;
}

export interface ShopConfig {
  enabled: boolean;
  items: ShopItem[];
}

export interface RewardsConfig {
  enabled: boolean;
  hourlyEnabled: boolean;
  hourlyGold: number;
  hourlyMoney: number;
  hourlyFame: number;
  topEnabled: boolean;
  topIntervalDays: number;
  topCount: number;
  topGold: number;
  topMoney: number;
  topFame: number;
}

export interface AirdropConfig {
  enabled: boolean;
  chestItem: string;
  minItems: number;
  maxItems: number;
  cooldownMinutes: number;
  autoDropEnabled: boolean;
  autoDropIntervalMinutes: number;
  autoDropMinPlayers: number;
}

export interface AirdropCalibrationPoint {
  x: number;
  y: number;
  z: number;
  sector: string;
}

export interface AutoMessageItem {
  enabled: boolean;
  text: string;
  intervalSec: number;
}

export interface AutoMessagesConfig {
  enabled: boolean;
  onlyWhenOnline: boolean;
  messages: AutoMessageItem[];
}

export interface OnlineChatConfig {
  enabled: boolean;
  intervalSec: number;
  template: string;
}

export interface JoinLeaveChatConfig {
  enabled: boolean;
  joinTemplate: string;
  leaveTemplate: string;
}

export interface PluginsConfig {
  teleport: {
    enabled: boolean;
    locations: TeleportLocation[];
  };
  vip: VipConfig;
  vehicleTeleport: VehicleTeleportConfig;
  saveHome: SaveHomeConfig;
  vote: VoteConfig;
  shop: ShopConfig;
  airdrop: AirdropConfig;
  rewards: RewardsConfig;
  chatSender: string;
  autoMessages: AutoMessagesConfig;
  onlineChat: OnlineChatConfig;
  joinLeaveChat: JoinLeaveChatConfig;
  ratingBlacklist: string[];
}

export interface LolkaBotConfig {
  enabled: boolean;
  token: string;
  guildId: string;
  channelId: string;
  activityText: string;
}

export interface AppConfig {
  server: ServerConfig;
  discord: DiscordConfig;
  backup: BackupConfig;
  ftp: FtpConfig;
  webPanel: WebPanelConfig;
  rcon: RconConfig;
  packs: PackConfig;
  plugins: PluginsConfig;
  lolkaBot: LolkaBotConfig;
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
  playersList: any[];
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

// WARGM types
export interface WargmSettings {
  apiUrl: string;
  shopId: string;
  apiKey: string;
  timeout: number;
  duplicateCheckMinutes: number;
  commandCooldownSeconds: number;
  maxItemsPerCard: number;
}

export interface WargmCardItem {
  id?: number;
  type: 'item' | 'vehicle' | 'skill' | 'attributes' | 'money' | 'gold' | 'fame' | 'cargo_drop' | 'vip' | 'chest_full' | 'car_teleport';
  data: Record<string, any>;
  sortOrder?: number;
}

export interface WargmCard {
  id?: number;
  name: string;
  shopItemId: string;
  enabled: boolean;
  items: WargmCardItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WargmDelivery {
  id?: number;
  purchaseId: string;
  steamId: string;
  cardId: number;
  cardName?: string;
  deliveredAt: string;
}

export interface WargmApiPurchase {
  purchase_id: string;
  steam_id: string;
  item_id: string;
  status: string;
  created_at: string;
  amount?: number;
}
