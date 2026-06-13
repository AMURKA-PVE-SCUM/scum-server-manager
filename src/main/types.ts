export interface ServerConfig {
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

export interface SaveHomeConfig {
  enabled: boolean;
  maxLocations: number;
  vipMaxLocations: number;
  teleportPrice: number;
}

export interface PluginsConfig {
  teleport: {
    enabled: boolean;
    locations: TeleportLocation[];
  };
  vip: VipConfig;
  saveHome: SaveHomeConfig;
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
  type: 'item' | 'vehicle' | 'skill' | 'attributes' | 'money' | 'gold' | 'cargo_drop' | 'vip';
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
