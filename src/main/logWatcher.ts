import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { watch, FSWatcher } from 'chokidar';
import { DiscordWebhook } from './discordWebhook';
import { RconClient } from './rconClient';
import { WargmManager } from './wargmManager';
import { ScumDatabaseReader } from './scumDatabase';
import type { LogEvent, PackConfig, PackItem, SaveHomeConfig, ShopConfig, ShopItem, TeleportLocation, VehicleTeleportConfig, VipConfig, VoteConfig } from './types';

interface ChatCommand {
  trigger: string;
  rconCommand: string;
  requiresArgs?: boolean;
  description: string;
  isHelp?: boolean;
  hideFromHelp?: boolean;
  helpTrigger?: string;
}

export class LogWatcher {
  private events: LogEvent[] = [];
  private watchers: FSWatcher[] = [];
  private discord: DiscordWebhook;
  private serverPath: string;
  private offsets = new Map<string, number>();
  private scumLogOffset = 0;
  private lastPlayerCount = 0;

  private rconClient: RconClient | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private packsConfig: PackConfig = {
    starter: { enabled: true, items: [], cooldownHours: 0 },
    daily: { enabled: true, items: [], cooldownHours: 24 },
  };
  private cooldowns: Record<string, number> = {};
  private teleportLocations: TeleportLocation[] = [];
  private vipConfig: VipConfig = {
    enabled: true, players: [],
    starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
    dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
  };
  private wargmManager: WargmManager | null = null;
  private cooldownPath = '';
  private saveHomeConfig: SaveHomeConfig = { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0, teleportGoldPrice: 0, teleportFamePrice: 0 };
  private homeLocations: Record<string, { name: string; x: number; y: number; z: number }[]> = {};
  private homeDataPath = '';
  private vehicleTeleportConfig: VehicleTeleportConfig = {
    enabled: true, maxVehicles: 1, vipMaxVehicles: 3, registerRadius: 300,
    teleportPrice: 0, teleportGoldPrice: 0, teleportFamePrice: 0, cooldownSeconds: 60, players: [],
  };
  private vehicleRegistrations: Record<string, { entityId: number; name: string; asset: string; registeredAt: number }[]> = {};
  private vehicleRegPath = '';
  private voteConfig: VoteConfig = { enabled: true, weatherEnabled: true, timeEnabled: true, cooldownSeconds: 600, vipCooldownSeconds: 300 };
  private shopConfig: ShopConfig = { enabled: true, items: [] };
  private scumDb: ScumDatabaseReader | null = null;
  private chatCommands: ChatCommand[] = [
    { trigger: '!balance', rconCommand: 'ListPlayers', description: 'Check your balance', hideFromHelp: true },
    { trigger: '!location', rconCommand: 'ListPlayers', description: 'Show your location', hideFromHelp: true },
    { trigger: '!online', rconCommand: 'ListPlayers', description: 'Show online players', hideFromHelp: true },
    { trigger: '!startpack', rconCommand: '', description: '', helpTrigger: '!стартпак' },
    { trigger: '!dailypack', rconCommand: '', description: '', helpTrigger: '!дейлипак' },
    { trigger: '!wargm', rconCommand: '', description: '', helpTrigger: '!варгм' },
    { trigger: '!teleport', rconCommand: '', description: '', helpTrigger: '!телепорт' },
    { trigger: '!vip', rconCommand: '', description: '', helpTrigger: '!вип' },

    { trigger: '!savedom', rconCommand: '', description: '', helpTrigger: '!сохранитьдом' },
    { trigger: '!home', rconCommand: '', description: '', helpTrigger: '!дом' },
    { trigger: '!homes', rconCommand: '', description: '', helpTrigger: '!дома' },
    { trigger: '!rating', rconCommand: '', description: '', helpTrigger: '!рейтинг' },
    { trigger: '!car', rconCommand: '', description: '', helpTrigger: '!машина' },
    { trigger: '!carregister', rconCommand: '', description: '', helpTrigger: '!привязать' },
    { trigger: '!carunbind', rconCommand: '', description: '', helpTrigger: '!отвязать' },
    { trigger: '!cars', rconCommand: '', description: '', helpTrigger: '!машины' },
    { trigger: '!weather', rconCommand: '', description: '', helpTrigger: '!погода' },
    { trigger: '!time', rconCommand: '', description: '', helpTrigger: '!время' },
    { trigger: '!shop', rconCommand: '', description: '', helpTrigger: '!купить' },
    { trigger: '!help', rconCommand: '', description: '', isHelp: true },
  ];
  private commandAliases: Record<string, string> = {
    '!баланс': '!balance',
    '!помощь': '!help',
    '!онлайн': '!online',
    '!локация': '!location',
    '!координаты': '!location',
    '!стартпак': '!startpack',
    '!дейлипак': '!dailypack',
    '!телепорт': '!teleport',
    '!вип': '!vip',
    '!варгм': '!wargm',

    '!сохранитьдом': '!savedom',
    '!дом': '!home',
    '!дома': '!homes',
    '!удалитьдом': '!delhome',
    '!машина': '!car',
    '!привязать': '!carregister',
    '!привязатьмашину': '!carregister',
    '!машины': '!cars',
    '!транспорт': '!cars',
    '!отвязать': '!carunbind',
    '!отвязатьмашину': '!carunbind',
    '!отвязатьавто': '!carunbind',
    '!погода': '!weather',
    '!время': '!time',
    '!купить': '!shop',
    '!магазин': '!shop',
  };

  private migrateOldFile(oldRel: string, filename: string): string {
    if (!this.serverPath) {
      // No server configured — store in protected user data dir (survives reinstall)
      const newPath = path.join(app.getPath('userData'), path.dirname(oldRel), filename);
      const oldPath = path.join(process.cwd(), oldRel, filename);
      fs.ensureDirSync(path.dirname(newPath));
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        try { fs.copyFileSync(oldPath, newPath); } catch {}
      }
      return newPath;
    }
    const newPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', filename);
    const oldPath = path.join(process.cwd(), oldRel, filename);
    fs.ensureDirSync(path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles'));
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      try { fs.copyFileSync(oldPath, newPath); } catch {}
    }
    return newPath;
  }

  constructor(serverPath: string, discord: DiscordWebhook) {
    this.serverPath = serverPath;
    this.discord = discord;
    this.cooldownPath = this.migrateOldFile('logs', 'pack_cooldowns.json');
    fs.ensureDirSync(path.dirname(this.cooldownPath));
    this.loadCooldowns();
    this.homeDataPath = this.migrateOldFile('data', 'home_locations.json');
    fs.ensureDirSync(path.dirname(this.homeDataPath));
    this.loadHomeLocations();
    this.vehicleRegPath = this.migrateOldFile('data', 'vehicle_registrations.json');
    fs.ensureDirSync(path.dirname(this.vehicleRegPath));
    this.loadVehicleRegistrations();
    if (serverPath) this.startWatching();
  }

  setPacksConfig(cfg: PackConfig): void {
    this.packsConfig = cfg;
  }

  setTeleportLocations(locations: TeleportLocation[]): void {
    this.teleportLocations = locations;
  }

  setVipConfig(cfg: VipConfig): void {
    this.vipConfig = cfg;
  }

  setSaveHomeConfig(cfg: SaveHomeConfig): void {
    this.saveHomeConfig = cfg;
  }

  setVehicleTeleportConfig(cfg: VehicleTeleportConfig): void {
    this.vehicleTeleportConfig = cfg;
  }

  setVoteConfig(cfg: VoteConfig): void {
    this.voteConfig = cfg;
  }

  setShopConfig(cfg: ShopConfig): void {
    this.shopConfig = cfg;
  }

  private loadVehicleRegistrations(): void {
    try {
      if (fs.existsSync(this.vehicleRegPath)) {
        this.vehicleRegistrations = JSON.parse(fs.readFileSync(this.vehicleRegPath, 'utf-8'));
      }
    } catch {}
  }

  private saveVehicleRegistrations(): void {
    try {
      fs.writeFileSync(this.vehicleRegPath, JSON.stringify(this.vehicleRegistrations, null, 2));
    } catch {}
  }

  getVehicleRegistrations(steamId: string): { entityId: number; name: string; asset: string; registeredAt: number }[] {
    return this.vehicleRegistrations[steamId] || [];
  }

  private isVehicleTeleport(steamId: string): boolean {
    if (!this.vehicleTeleportConfig.enabled) return false;
    const p = this.vehicleTeleportConfig.players.find(x => x.steamId === steamId);
    if (!p) return false;
    if (p.expiresAt > 0 && Date.now() > p.expiresAt) return false;
    return true;
  }

  private maxVehicleSlots(steamId: string): number {
    return this.isVehicleTeleport(steamId) ? this.vehicleTeleportConfig.vipMaxVehicles : this.vehicleTeleportConfig.maxVehicles;
  }

  private voteCooldownSeconds(steamId: string): number {
    return this.isVip(steamId) ? this.voteConfig.vipCooldownSeconds : this.voteConfig.cooldownSeconds;
  }

  private loadHomeLocations(): void {
    try {
      if (fs.existsSync(this.homeDataPath)) {
        this.homeLocations = JSON.parse(fs.readFileSync(this.homeDataPath, 'utf-8'));
      }
    } catch {}
  }

  private saveHomeLocations(): void {
    try {
      fs.writeFileSync(this.homeDataPath, JSON.stringify(this.homeLocations, null, 2));
    } catch {}
  }

  private isVip(steamId: string): boolean {
    if (!this.vipConfig.enabled) return false;
    const p = this.vipConfig.players.find(x => x.steamId === steamId);
    if (!p) return false;
    if (p.expiresAt > 0 && Date.now() > p.expiresAt) return false;
    return true;
  }

  setWargmManager(mgr: WargmManager): void {
    this.wargmManager = mgr;
  }

  setScumDb(db: ScumDatabaseReader): void {
    this.scumDb = db;
  }

  private loadCooldowns(): void {
    try {
      if (fs.existsSync(this.cooldownPath)) {
        this.cooldowns = JSON.parse(fs.readFileSync(this.cooldownPath, 'utf-8'));
      }
    } catch {}
  }

  private saveCooldowns(): void {
    try {
      fs.writeFileSync(this.cooldownPath, JSON.stringify(this.cooldowns, null, 2));
    } catch {}
  }

  getCooldowns(): Record<string, number> {
    return { ...this.cooldowns };
  }

  resetPlayerCooldown(steamId: string, packType?: 'starter' | 'daily'): void {
    if (packType) {
      const key = packType === 'starter' ? `!startpack_${steamId}` : `!dailypack_${steamId}`;
      delete this.cooldowns[key];
    } else {
      delete this.cooldowns[`!startpack_${steamId}`];
      delete this.cooldowns[`!dailypack_${steamId}`];
    }
    this.saveCooldowns();
  }

  setRconClient(client: RconClient): void {
    this.rconClient = client;
  }

  addChatCommand(trigger: string, rconCommand: string, description: string, requiresArgs = false): void {
    this.chatCommands.push({ trigger, rconCommand, requiresArgs, description });
  }

  private async processChatCommand(steamId: string, playerName: string, message: string): Promise<void> {
    if (!this.rconClient || !this.rconClient.isConnected()) {
      console.log('[LogWatcher] RCON not connected, skipping command');
      return;
    }
    
    const trimmed = message.trim();
    console.log('[LogWatcher] processChatCommand:', { steamId, playerName, trimmed, rconConnected: this.rconClient.isConnected() });
    
    if (!trimmed.startsWith('!')) return;
    
    const trimmedParts = trimmed.toLowerCase().split(/\s+/);
    const baseCmd = trimmedParts[0];
    const cmdKey = this.commandAliases[baseCmd] || baseCmd;
    
    // Help command
    if (cmdKey === '!help' || cmdKey === '!commands') {
      const helpMsg = 'Команды: ' + this.chatCommands.filter(c => !c.isHelp && !c.hideFromHelp).map(c => c.helpTrigger || c.trigger).join(', ');
      console.log('[LogWatcher] Sending help to', playerName);
      await this.rconClient.sendCommand(`SendChat 4 "${helpMsg}" ${steamId}`);
      return;
    }

    // Pack commands
    if (cmdKey === '!startpack' || cmdKey === '!dailypack') {
      const isDaily = cmdKey === '!dailypack';
      const pack = isDaily ? this.packsConfig.daily : this.packsConfig.starter;
      if (!pack.enabled || !pack.items.length) {
        await this.rconClient.sendCommand(`SendChat 4 "${isDaily ? 'Ежедневный' : 'Стартовый'} набор недоступен" ${steamId}`);
        return;
      }
      if (pack.cooldownHours > 0) {
        const lastClaim = this.cooldowns[`${cmdKey}_${steamId}`] || 0;
        const elapsed = (Date.now() - lastClaim) / 3600000;
        if (elapsed < pack.cooldownHours) {
          const remaining = Math.ceil(pack.cooldownHours - elapsed);
          const name = isDaily ? 'Ежедневный' : 'Стартовый';
          await this.rconClient.sendCommand(`SendChat 4 "${name} набор: кулдаун ${remaining}ч" ${steamId}`);
          return;
        }
      } else if (pack.cooldownHours < 0) {
        const key = `${cmdKey}_${steamId}`;
        if (this.cooldowns[key]) {
          const name = isDaily ? 'Ежедневный' : 'Стартовый';
          await this.rconClient.sendCommand(`SendChat 4 "${name} набор уже получен" ${steamId}`);
          return;
        }
      }
      const succeeded: string[] = [];
      const failed: string[] = [];
      for (const item of pack.items) {
        const r = await this.rconClient.sendCommand(`SpawnItem ${item.itemId} ${item.amount} Location ${steamId}`);
        if (r.success) succeeded.push(`${item.itemId}x${item.amount}`);
        else failed.push(`${item.itemId}x${item.amount}`);
      }
      // VIP bonuses
      if (this.isVip(steamId)) {
        const bonus = isDaily ? this.vipConfig.dailyBonus : this.vipConfig.starterBonus;
        for (const item of bonus.items) {
          const r = await this.rconClient.sendCommand(`SpawnItem ${item.itemId} ${item.amount} Location ${steamId}`);
          if (r.success) succeeded.push(`${item.itemId}x${item.amount} (VIP)`);
        }
        if (bonus.money > 0) {
          await this.rconClient!.sendCommand(`ChangeCurrencyBalance Normal +${bonus.money} ${steamId}`);
          succeeded.push(`Деньги +${bonus.money} (VIP)`);
        }
        if (bonus.gold > 0) {
          await this.rconClient!.sendCommand(`ChangeCurrencyBalance Gold +${bonus.gold} ${steamId}`);
          succeeded.push(`Золото +${bonus.gold} (VIP)`);
        }
        if (bonus.fame > 0) {
          await this.rconClient!.sendCommand(`ChangeFamePoints +${bonus.fame} ${steamId}`);
          succeeded.push(`Слава +${bonus.fame} (VIP)`);
        }
      }
      this.cooldowns[`${cmdKey}_${steamId}`] = Date.now();
      this.saveCooldowns();
      const reply = succeeded.length > 0 ? `Получено: ${succeeded.join(', ')}` : 'Не удалось выдать предметы';
      await this.rconClient.sendCommand(`SendChat 4 "${reply}" ${steamId}`);
      return;
    }

    // WARGM command
    if (cmdKey === '!wargm') {
      if (!this.wargmManager) {
        await this.rconClient.sendCommand(`SendChat 4 "Система WARGM недоступна" ${steamId}`);
        return;
      }
      const settings = this.wargmManager.getSettings();
      const cd = this.wargmManager.checkCommandCooldown(steamId, settings.commandCooldownSeconds);
      if (cd > 0) {
        await this.rconClient.sendCommand(`SendChat 4 "Подождите ${cd}с до следующей проверки" ${steamId}`);
        return;
      }
      this.wargmManager.setCommandCooldown(steamId);
      await this.rconClient.sendCommand(`SendChat 4 "Проверяю ваши покупки..." ${steamId}`);
      const result = await this.wargmManager.processPlayer(settings, steamId);
      for (const msg of result.results.slice(0, 5)) {
        await this.rconClient.sendCommand(`SendChat 4 "${msg}" ${steamId}`);
      }
      if (result.results.length > 5) {
        await this.rconClient.sendCommand(`SendChat 4 "...и ещё ${result.results.length - 5} предметов" ${steamId}`);
      }
      return;
    }

    // Teleport command
    if (cmdKey === '!teleport') {
      if (!this.teleportLocations || this.teleportLocations.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "Телепортация недоступна" ${steamId}`);
        return;
      }
      const idx = parseInt(trimmedParts[1]);
      if (isNaN(idx) || idx < 1 || idx > this.teleportLocations.length) {
        const list = this.teleportLocations.map((loc, i) => {
          const costs: string[] = [];
          if (loc.price > 0) costs.push(`$${loc.price}`);
          if ((loc.goldPrice || 0) > 0) costs.push(`${loc.goldPrice} золота`);
          if ((loc.famePrice || 0) > 0) costs.push(`${loc.famePrice} славы`);
          const costStr = costs.length > 0 ? ` (${costs.join(', ')})` : '';
          return `${i + 1}. ${loc.name}${costStr}`;
        }).join(', ');
        await this.rconClient.sendCommand(`SendChat 4 "Список мест телепорта: ${list}" ${steamId}`);
        await this.rconClient.sendCommand(`SendChat 4 "Для телепорта укажите команду !телепорт с нужным номером локации" ${steamId}`);
        return;
      }
      const loc = this.teleportLocations[idx - 1];
      await this.rconClient.sendCommand(`SendChat 4 "⏳ Не двигайтесь! Телепорт в ${loc.name} через 15 секунд..." ${steamId}`);
      await new Promise(resolve => setTimeout(resolve, 15000));
      const costParts: string[] = [];
      if (loc.price > 0) {
        await this.rconClient!.sendCommand(`ChangeCurrencyBalance Normal -${loc.price} ${steamId}`);
        costParts.push(`$${loc.price}`);
      }
      if ((loc.goldPrice || 0) > 0) {
        await this.rconClient!.sendCommand(`ChangeCurrencyBalance Gold -${loc.goldPrice} ${steamId}`);
        costParts.push(`${loc.goldPrice} золота`);
      }
      if ((loc.famePrice || 0) > 0) {
        await this.rconClient!.sendCommand(`ChangeFamePoints -${loc.famePrice} ${steamId}`);
        costParts.push(`${loc.famePrice} славы`);
      }
      if (costParts.length > 0) {
        await this.rconClient!.sendCommand(`SendChat 4 "💸 Списано: ${costParts.join(', ')}" ${steamId}`);
      }
      const cmd = `Teleport ${Math.round(loc.x)} ${Math.round(loc.y)} ${Math.round(loc.z)} ${steamId}`;
      const r = await this.rconClient.sendCommand(cmd);
      if (r.success) {
        await this.rconClient.sendCommand(`SendChat 4 "✅ Телепортация в ${loc.name} выполнена" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "❌ Ошибка телепортации" ${steamId}`);
      }
      return;
    }

    // VIP command
    if (cmdKey === '!vip') {
      if (!this.vipConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "VIP система отключена" ${steamId}`);
        return;
      }
      const p = this.vipConfig.players.find(x => x.steamId === steamId);
      if (!p) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет VIP статуса" ${steamId}`);
        return;
      }
      if (p.expiresAt > 0 && Date.now() > p.expiresAt) {
        await this.rconClient.sendCommand(`SendChat 4 "Срок VIP истёк" ${steamId}`);
        return;
      }
      let msg = '✅ У вас есть VIP!';
      if (p.expiresAt > 0) {
        const remaining = Math.ceil((p.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        msg += ` Осталось: ${remaining} дн.`;
      } else {
        msg += ' Бессрочно';
      }
      if (p.note) msg += ` (${p.note})`;
      await this.rconClient.sendCommand(`SendChat 4 "${msg}" ${steamId}`);
      return;
    }

    // Save Home commands
    if (cmdKey === '!savedom') {
      if (!this.saveHomeConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Сохранение дома отключено" ${steamId}`);
        return;
      }
      if (!this.homeLocations[steamId]) this.homeLocations[steamId] = [];
      const maxLocs = this.isVip(steamId) ? this.saveHomeConfig.vipMaxLocations : this.saveHomeConfig.maxLocations;
      if (this.homeLocations[steamId].length >= maxLocs) {
        await this.rconClient.sendCommand(`SendChat 4 "Достигнут лимит сохранений (${maxLocs}). Используйте !дома для просмотра" ${steamId}`);
        return;
      }
      const d = await this.getListPlayerData(steamId);
      if (!d || (d.x === 0 && d.y === 0 && d.z === 0)) {
        await this.rconClient.sendCommand(`SendChat 4 "Не удалось определить вашу локацию" ${steamId}`);
        return;
      }
      const homeName = trimmedParts.length > 1 ? trimmed.slice(trimmedParts[0].length).trim() : `Дом ${this.homeLocations[steamId].length + 1}`;
      this.homeLocations[steamId].push({ name: homeName, x: d.x, y: d.y, z: d.z });
      this.saveHomeLocations();
      const priceParts: string[] = [];
      if (this.saveHomeConfig.teleportPrice > 0) priceParts.push(`$${this.saveHomeConfig.teleportPrice}`);
      if ((this.saveHomeConfig.teleportGoldPrice || 0) > 0) priceParts.push(`${this.saveHomeConfig.teleportGoldPrice} золота`);
      if ((this.saveHomeConfig.teleportFamePrice || 0) > 0) priceParts.push(`${this.saveHomeConfig.teleportFamePrice} славы`);
      const priceNote = priceParts.length > 0 ? ` | Стоимость телепорта: ${priceParts.join(', ')}` : '';
      await this.rconClient.sendCommand(`SendChat 4 "✅ Локация сохранена: ${homeName} (X=${Math.round(d.x)} Y=${Math.round(d.y)} Z=${Math.round(d.z)})${priceNote}" ${steamId}`);
      return;
    }

    if (cmdKey === '!homes') {
      if (!this.saveHomeConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Сохранение дома отключено" ${steamId}`);
        return;
      }
      const locs = this.homeLocations[steamId] || [];
      if (locs.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет сохранённых локаций. Используйте !сохранитьдом" ${steamId}`);
        return;
      }
      const list = locs.map((l, i) => `${i + 1}. ${l.name}`).join(', ');
      const priceParts: string[] = [];
      if (this.saveHomeConfig.teleportPrice > 0) priceParts.push(`$${this.saveHomeConfig.teleportPrice}`);
      if ((this.saveHomeConfig.teleportGoldPrice || 0) > 0) priceParts.push(`${this.saveHomeConfig.teleportGoldPrice} золота`);
      if ((this.saveHomeConfig.teleportFamePrice || 0) > 0) priceParts.push(`${this.saveHomeConfig.teleportFamePrice} славы`);
      const priceNote = priceParts.length > 0 ? ` | Стоимость телепорта: ${priceParts.join(', ')}` : '';
      await this.rconClient.sendCommand(`SendChat 4 "Ваши сохранения: ${list}. Телепорт: !дом N${priceNote}" ${steamId}`);
      return;
    }

    if (cmdKey === '!delhome') {
      if (!this.saveHomeConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Сохранение дома отключено" ${steamId}`);
        return;
      }
      const locs = this.homeLocations[steamId] || [];
      if (locs.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет сохранённых локаций" ${steamId}`);
        return;
      }
      const idx = parseInt(trimmedParts[1]);
      if (isNaN(idx) || idx < 1 || idx > locs.length) {
        const list = locs.map((l, i) => `${i + 1}. ${l.name}`).join(', ');
        await this.rconClient.sendCommand(`SendChat 4 "Укажите номер дома для удаления: !удалитьдом N. Ваши дома: ${list}" ${steamId}`);
        return;
      }
      const removed = locs.splice(idx - 1, 1)[0];
      this.saveHomeLocations();
      await this.rconClient.sendCommand(`SendChat 4 "✅ Дом \"${removed.name}\" удалён" ${steamId}`);
      return;
    }

    if (cmdKey === '!home') {
      if (!this.saveHomeConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Сохранение дома отключено" ${steamId}`);
        return;
      }
      const locs = this.homeLocations[steamId] || [];
      if (locs.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет сохранённых локаций. Используйте !сохранитьдом" ${steamId}`);
        return;
      }
      const idx = parseInt(trimmedParts[1]);
      const homeIdx = (!isNaN(idx) && idx >= 1 && idx <= locs.length) ? idx - 1 : 0;
      const home = locs[homeIdx];
      const anyCost = this.saveHomeConfig.teleportPrice > 0 || (this.saveHomeConfig.teleportGoldPrice || 0) > 0 || (this.saveHomeConfig.teleportFamePrice || 0) > 0;
      if (anyCost) {
        await this.rconClient.sendCommand(`SendChat 4 "⏳ Телепорт домой (${home.name}) через 15 секунд..." ${steamId}`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        const costParts: string[] = [];
        if (this.saveHomeConfig.teleportPrice > 0) {
          await this.rconClient!.sendCommand(`ChangeCurrencyBalance Normal -${this.saveHomeConfig.teleportPrice} ${steamId}`);
          costParts.push(`$${this.saveHomeConfig.teleportPrice}`);
        }
        if ((this.saveHomeConfig.teleportGoldPrice || 0) > 0) {
          await this.rconClient!.sendCommand(`ChangeCurrencyBalance Gold -${this.saveHomeConfig.teleportGoldPrice} ${steamId}`);
          costParts.push(`${this.saveHomeConfig.teleportGoldPrice} золота`);
        }
        if ((this.saveHomeConfig.teleportFamePrice || 0) > 0) {
          await this.rconClient!.sendCommand(`ChangeFamePoints -${this.saveHomeConfig.teleportFamePrice} ${steamId}`);
          costParts.push(`${this.saveHomeConfig.teleportFamePrice} славы`);
        }
        await this.rconClient!.sendCommand(`SendChat 4 "💸 Списано: ${costParts.join(', ')}" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "⏳ Телепорт домой (${home.name})..." ${steamId}`);
      }
      const cmd = `Teleport ${Math.round(home.x)} ${Math.round(home.y)} ${Math.round(home.z)} ${steamId}`;
      const r = await this.rconClient.sendCommand(cmd);
      if (r.success) {
        await this.rconClient.sendCommand(`SendChat 4 "✅ Телепортация домой (${home.name}) выполнена" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "❌ Ошибка телепортации" ${steamId}`);
      }
      return;
    }

    // Vehicle registration (привязать)
    if (cmdKey === '!carregister') {
      if (!this.vehicleTeleportConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Система привязки транспорта отключена" ${steamId}`);
        return;
      }
      const { pid, prisId, name: dbName } = this.getPlayerDbIds(steamId);
      const vehicles = await this.getListSpawnedVehiclesData();
      const owned = vehicles.filter(v => this.vehicleBelongsToPlayer(v, pid, prisId, dbName));
      if (owned.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет зарегистрированных автомобилей на сервере" ${steamId}`);
        return;
      }
      const num = parseInt(trimmedParts[1]);
      if (isNaN(num) || num < 1 || num > owned.length) {
        const list = owned.map((v, i) => `${i + 1}) ${v.customName || v.asset || 'ID ' + v.entityId}`).join(', ');
        await this.rconClient.sendCommand(`SendChat 4 "Ваши автомобили: ${list}" ${steamId}`);
        await this.rconClient.sendCommand(`SendChat 4 "Для привязки укажите номер: !привязать N" ${steamId}`);
        return;
      }
      const chosen = owned[num - 1];
      const current = this.vehicleRegistrations[steamId] || [];
      const max = this.maxVehicleSlots(steamId);
      if (current.length >= max) {
        await this.rconClient.sendCommand(`SendChat 4 "Достигнут лимит привязок (${max}). Используйте !машины для просмотра" ${steamId}`);
        return;
      }
      if (current.some(r => r.entityId === chosen.entityId)) {
        await this.rconClient.sendCommand(`SendChat 4 "Этот автомобиль уже привязан" ${steamId}`);
        return;
      }
      const label = chosen.customName || chosen.asset || `ID ${chosen.entityId}`;
      current.push({ entityId: chosen.entityId!, name: label, asset: chosen.asset || '', registeredAt: Date.now() });
      this.vehicleRegistrations[steamId] = current;
      this.saveVehicleRegistrations();
      await this.rconClient.sendCommand(`SendChat 4 "✅ Автомобиль \"${label}\" привязан" ${steamId}`);
      return;
    }

    // Vehicle list (машины)
    if (cmdKey === '!cars') {
      if (!this.vehicleTeleportConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Система транспорта отключена" ${steamId}`);
        return;
      }
      const regs = this.vehicleRegistrations[steamId] || [];
      if (regs.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет привязанных машин. Используйте !привязать <имя>" ${steamId}`);
        return;
      }
      const list = regs.map((r, i) => `${i + 1}. ${r.name}`).join(', ');
      await this.rconClient.sendCommand(`SendChat 4 "Ваши машины: ${list}. Телепорт: !машина N, отвязка: !отвязать N" ${steamId}`);
      return;
    }

    // Vehicle unbind (отвязать)
    if (cmdKey === '!carunbind') {
      if (!this.vehicleTeleportConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Система транспорта отключена" ${steamId}`);
        return;
      }
      const regs = this.vehicleRegistrations[steamId] || [];
      if (regs.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет привязанных машин. Используйте !привязать N" ${steamId}`);
        return;
      }
      const num = parseInt(trimmedParts[1]);
      if (isNaN(num) || num < 1 || num > regs.length) {
        const list = regs.map((r, i) => `${i + 1}) ${r.name}`).join(', ');
        await this.rconClient.sendCommand(`SendChat 4 "Ваши привязанные машины: ${list}" ${steamId}`);
        await this.rconClient.sendCommand(`SendChat 4 "Для отвязки укажите номер: !отвязать N" ${steamId}`);
        return;
      }
      const chosen = regs[num - 1];
      const remaining = regs.filter((_, i) => i !== num - 1);
      this.vehicleRegistrations[steamId] = remaining;
      this.saveVehicleRegistrations();
      await this.rconClient.sendCommand(`SendChat 4 "❌ Автомобиль \"${chosen.name}\" отвязан" ${steamId}`);
      return;
    }

    // Vote weather (погода)
    if (cmdKey === '!weather') {
      if (!this.voteConfig.enabled || !this.voteConfig.weatherEnabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Голосование за погоду отключено" ${steamId}`);
        return;
      }
      const val = parseInt(trimmedParts[1]);
      if (trimmedParts.length < 2 || (val !== 0 && val !== 1)) {
        await this.rconClient.sendCommand(`SendChat 4 "Использование: !погода <0|1> (0 — солнечно, 1 — дождь)" ${steamId}`);
        return;
      }
      const cd = this.voteCooldownSeconds(steamId);
      if (cd > 0) {
        const key = `!vote_weather_${steamId}`;
        const last = this.cooldowns[key] || 0;
        const elapsed = (Date.now() - last) / 1000;
        if (elapsed < cd) {
          const remaining = Math.ceil(cd - elapsed);
          await this.rconClient.sendCommand(`SendChat 4 "Подождите ${remaining}с до следующего голосования" ${steamId}`);
          return;
        }
        this.cooldowns[key] = Date.now();
        this.saveCooldowns();
      }
      const label = val === 1 ? 'дождь' : 'солнечно';
      const r = await this.rconClient.sendCommand(`vote SetWeather ${val}`);
      if (r.success) {
        await this.rconClient.sendCommand(`SendChat 4 "✅ Запущено голосование за погоду: ${label}. Проголосуйте в появившемся окне!" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "❌ Не удалось запустить голосование" ${steamId}`);
      }
      return;
    }

    // Vote time of day (время)
    if (cmdKey === '!time') {
      if (!this.voteConfig.enabled || !this.voteConfig.timeEnabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Голосование за время отключено" ${steamId}`);
        return;
      }
      const hour = parseInt(trimmedParts[1]);
      if (trimmedParts.length < 2 || isNaN(hour) || hour < 0 || hour > 23) {
        await this.rconClient.sendCommand(`SendChat 4 "Использование: !время <час 0-23>. Пример: !время 14" ${steamId}`);
        return;
      }
      const cd = this.voteCooldownSeconds(steamId);
      if (cd > 0) {
        const key = `!vote_time_${steamId}`;
        const last = this.cooldowns[key] || 0;
        const elapsed = (Date.now() - last) / 1000;
        if (elapsed < cd) {
          const remaining = Math.ceil(cd - elapsed);
          await this.rconClient.sendCommand(`SendChat 4 "Подождите ${remaining}с до следующего голосования" ${steamId}`);
          return;
        }
        this.cooldowns[key] = Date.now();
        this.saveCooldowns();
      }
      const r = await this.rconClient.sendCommand(`vote SetTimeOfDay ${hour}`);
      if (r.success) {
        await this.rconClient.sendCommand(`SendChat 4 "✅ Запущено голосование за время: ${hour}:00. Проголосуйте в появившемся окне!" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "❌ Не удалось запустить голосование" ${steamId}`);
      }
      return;
    }

    // Shop (купить)
    if (cmdKey === '!shop') {
      await this.handleShopCommand(steamId, trimmedParts);
      return;
    }

    // Vehicle teleport (машина)
    if (cmdKey === '!car') {
      if (!this.vehicleTeleportConfig.enabled) {
        await this.rconClient.sendCommand(`SendChat 4 "Система транспорта отключена" ${steamId}`);
        return;
      }
      const regs = this.vehicleRegistrations[steamId] || [];
      if (regs.length === 0) {
        await this.rconClient.sendCommand(`SendChat 4 "У вас нет привязанных машин. Используйте !привязать <имя>" ${steamId}`);
        return;
      }
      const idx = parseInt(trimmedParts[1]);
      const carIdx = (!isNaN(idx) && idx >= 1 && idx <= regs.length) ? idx - 1 : 0;
      const reg = regs[carIdx];

      // Cooldown check
      if (this.vehicleTeleportConfig.cooldownSeconds > 0) {
        const key = `!car_${steamId}`;
        const last = this.cooldowns[key] || 0;
        const elapsed = (Date.now() - last) / 1000;
        if (elapsed < this.vehicleTeleportConfig.cooldownSeconds) {
          const remaining = Math.ceil(this.vehicleTeleportConfig.cooldownSeconds - elapsed);
          await this.rconClient.sendCommand(`SendChat 4 "Подождите ${remaining}с до следующего вызова" ${steamId}`);
          return;
        }
      }

      // Get live vehicle coordinates (may have moved)
      const vehicles = await this.getListSpawnedVehiclesData();
      const live = vehicles.find(v => v.entityId === reg.entityId);
      if (!live || live.x == null || live.y == null) {
        await this.rconClient.sendCommand(`SendChat 4 "❌ Не удалось определить местоположение машины \"${reg.name}\"" ${steamId}`);
        return;
      }
      const vx = live.x, vy = live.y, vz = live.z != null ? live.z : 0;

      // No access -> show coordinates only
      if (!this.isVehicleTeleport(steamId)) {
        await this.rconClient.sendCommand(`SendChat 4 "Машина \"${reg.name}\": X=${Math.round(vx)} Y=${Math.round(vy)} Z=${Math.round(vz)}. Для телепорта приобретите доступ" ${steamId}`);
        return;
      }

      // Apply cooldown
      if (this.vehicleTeleportConfig.cooldownSeconds > 0) {
        this.cooldowns[`!car_${steamId}`] = Date.now();
        this.saveCooldowns();
      }

      const anyCost = this.vehicleTeleportConfig.teleportPrice > 0 || (this.vehicleTeleportConfig.teleportGoldPrice || 0) > 0 || (this.vehicleTeleportConfig.teleportFamePrice || 0) > 0;
      if (anyCost) {
        await this.rconClient.sendCommand(`SendChat 4 "⏳ Телепорт к машине (${reg.name}) через 15 секунд..." ${steamId}`);
        await new Promise(resolve => setTimeout(resolve, 15000));
        const costParts: string[] = [];
        if (this.vehicleTeleportConfig.teleportPrice > 0) {
          await this.rconClient!.sendCommand(`ChangeCurrencyBalance Normal -${this.vehicleTeleportConfig.teleportPrice} ${steamId}`);
          costParts.push(`$${this.vehicleTeleportConfig.teleportPrice}`);
        }
        if ((this.vehicleTeleportConfig.teleportGoldPrice || 0) > 0) {
          await this.rconClient!.sendCommand(`ChangeCurrencyBalance Gold -${this.vehicleTeleportConfig.teleportGoldPrice} ${steamId}`);
          costParts.push(`${this.vehicleTeleportConfig.teleportGoldPrice} золота`);
        }
        if ((this.vehicleTeleportConfig.teleportFamePrice || 0) > 0) {
          await this.rconClient!.sendCommand(`ChangeFamePoints -${this.vehicleTeleportConfig.teleportFamePrice} ${steamId}`);
          costParts.push(`${this.vehicleTeleportConfig.teleportFamePrice} славы`);
        }
        await this.rconClient!.sendCommand(`SendChat 4 "💸 Списано: ${costParts.join(', ')}" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "⏳ Телепорт к машине (${reg.name})..." ${steamId}`);
      }
      const cmd = `Teleport ${Math.round(vx)} ${Math.round(vy)} ${Math.round(vz)} ${steamId}`;
      const r = await this.rconClient.sendCommand(cmd);
      if (r.success) {
        await this.rconClient.sendCommand(`SendChat 4 "✅ Телепорт к машине (${reg.name}) выполнен" ${steamId}`);
      } else {
        await this.rconClient.sendCommand(`SendChat 4 "❌ Ошибка телепортации" ${steamId}`);
      }
      return;
    }

    // Check for commands
    for (const cmd of this.chatCommands) {
      if (cmdKey === cmd.trigger) {
        if (cmd.isHelp || !cmd.rconCommand) continue;
        console.log('[LogWatcher] Matched command:', cmd.trigger);
        
        let fullCommand = cmd.rconCommand;
        if (cmd.requiresArgs && trimmed.length > cmd.trigger.length) {
          const args = trimmed.slice(cmd.trigger.length).trim();
          fullCommand += ' ' + args;
        }
        
        try {
          const result = await this.rconClient.sendCommand(fullCommand);
          console.log('[LogWatcher] Command result:', result.success ? 'success' : 'fail');
          if (result.success && result.response) {
            const lines = result.response.split('\n').filter(l => l.trim());
            let reply = '';
            if (cmdKey === '!balance') {
              const plLine = lines.find(l => l.includes(`steam=${steamId}`));
              if (plLine) {
                const mm = plLine.match(/\bmoney=([\d.+-]+)/);
                const gm = plLine.match(/\bgold=([\d.+-]+)/);
                reply = `${playerName}: Account balance: ${mm ? parseFloat(mm[1]).toFixed(0) : 'N/A'} | Gold balance: ${gm ? parseFloat(gm[1]).toFixed(0) : 'N/A'}`;
              } else {
                const playerSection = this.extractPlayerSection(lines, steamId, playerName);
                const bal = playerSection.find(l => l.toLowerCase().includes('account balance')) || 'N/A';
                const gold = playerSection.find(l => l.toLowerCase().includes('gold balance')) || 'N/A';
                reply = `${playerName}: ${bal} | ${gold}`;
              }
            } else if (cmdKey === '!location') {
              const plLine = lines.find(l => l.includes(`steam=${steamId}`));
              if (plLine) {
                const pm = plLine.match(/\(([\d.+-]+),\s*([\d.+-]+),\s*([\d.+-]+)\)/);
                reply = pm ? `${playerName}: Location: X=${parseFloat(pm[1]).toFixed(0)} Y=${parseFloat(pm[2]).toFixed(0)} Z=${parseFloat(pm[3]).toFixed(0)}` : `${playerName}: Location: N/A`;
              } else {
                const playerSection = this.extractPlayerSection(lines, steamId, playerName);
                const loc = playerSection.find(l => l.toLowerCase().includes('location')) || 'N/A';
                reply = `${playerName}: ${loc}`;
              }
            } else if (cmdKey === '!online') {
              const playerListOld = lines.filter(l => /^\d+\.\s+\S/.test(l)).join(', ');
              const playerListNew = lines.filter(l => /^PLAYER\s*\|/i.test(l)).map(l => {
                const nm = l.match(/^PLAYER\s*\|\s*(.+?)\s*\|/i);
                return nm ? nm[1].trim() : l;
              }).join(', ');
              const playerCount = Math.max(
                lines.filter(l => /^\d+\.\s+\S/.test(l)).length,
                lines.filter(l => /^PLAYER\s*\|/i.test(l)).length
              );
              const playerList = playerListOld || playerListNew;
              reply = playerCount > 0 ? `Онлайн (${playerCount}): ${playerList}` : 'Нет игроков онлайн';
            } else {
              reply = result.response.slice(0, 200);
            }
            if (reply.length > 300) reply = reply.slice(0, 300) + '...';
            await this.rconClient.sendCommand(`SendChat 4 "${reply}" ${steamId}`);
          }
        } catch (e) {
          console.error('[LogWatcher] Chat command error:', e);
        }
        return;
      }
    }
  }

  private extractPlayerSection(lines: string[], steamId: string, playerName: string): string[] {
    const idx = lines.findIndex(l => l.includes(steamId) || l.includes(`. ${playerName}`));
    if (idx === -1) return lines;
    const section: string[] = [lines[idx]];
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^\d+\.\s+\S/.test(lines[i])) break;
      section.push(lines[i]);
    }
    return section;
  }

  // --- Shop (магазин) ---
  private async handleShopCommand(steamId: string, args: string[]): Promise<void> {
    if (!this.rconClient) return;
    if (!this.shopConfig.enabled) {
      await this.rconClient.sendCommand(`SendChat 4 "Магазин отключен" ${steamId}`);
      return;
    }
    const items = this.shopConfig.items || [];
    if (items.length === 0) {
      await this.rconClient.sendCommand(`SendChat 4 "Магазин пуст" ${steamId}`);
      return;
    }
    const pageArg = parseInt(args[1]);
    const qtyArg = parseInt(args[2]);
    if (args.length >= 3 && !isNaN(pageArg) && pageArg >= 1 && !isNaN(qtyArg) && qtyArg >= 1) {
      await this.shopPurchase(steamId, items, pageArg, qtyArg);
      return;
    }
    await this.shopShowCatalog(steamId, items, isNaN(pageArg) ? 1 : pageArg);
  }

  private async shopShowCatalog(steamId: string, items: ShopItem[], page: number): Promise<void> {
    if (!this.rconClient) return;
    const perPage = 10;
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const pageNum = Math.min(Math.max(1, page), totalPages);
    const start = (pageNum - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);
    const lines: string[] = [];
    pageItems.forEach((it, i) => {
      const num = start + i + 1;
      const name = it.itemName || '?';
      const qty = it.type === 'vehicle' ? '' : `x${it.amount}`;
      const costs: string[] = [];
      if (it.price > 0) costs.push(`$${it.price}`);
      if ((it.goldPrice || 0) > 0) costs.push(`${it.goldPrice} золота`);
      if ((it.famePrice || 0) > 0) costs.push(`${it.famePrice} славы`);
      const costStr = costs.length > 0 ? ` — ${costs.join(', ')}` : ' — бесплатно';
      lines.push(`${num}. ${name}${qty}${costStr}`);
    });
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += 5) {
      chunks.push(lines.slice(i, i + 5).join('. '));
    }
    for (const chunk of chunks) {
      await this.rconClient.sendCommand(`SendChat 4 "${chunk}" ${steamId}`);
    }
    if (totalPages > 1) {
      await this.rconClient.sendCommand(`SendChat 4 "Страница ${pageNum}/${totalPages}. Ещё: !купить ${pageNum + 1 > totalPages ? 1 : pageNum + 1}" ${steamId}`);
    }
    await this.rconClient.sendCommand(`SendChat 4 "Покупка: !купить N количество (например !купить ${start + 1} 1)" ${steamId}`);
  }

  private async shopPurchase(steamId: string, items: ShopItem[], idx: number, qty: number): Promise<void> {
    if (!this.rconClient) return;
    const item = items[idx - 1];
    if (!item || !item.enabled) {
      await this.rconClient.sendCommand(`SendChat 4 "Товар #${idx} не найден" ${steamId}`);
      return;
    }
    if (item.type === 'vehicle' && qty !== 1) {
      qty = 1;
    }
    if (qty > 100) {
      await this.rconClient.sendCommand(`SendChat 4 "Максимум 100 за покупку" ${steamId}`);
      return;
    }
    const needMoney = (item.price || 0) * qty;
    const needGold = (item.goldPrice || 0) * qty;
    const needFame = (item.famePrice || 0) * qty;
    const bal = await this.getPlayerBalances(steamId);
    if (bal) {
      if (needMoney > 0 && bal.money < needMoney) {
        await this.rconClient.sendCommand(`SendChat 4 "Недостаточно денег: нужно $${needMoney}, у вас $${bal.money.toFixed(0)}" ${steamId}`);
        return;
      }
      if (needGold > 0 && bal.gold < needGold) {
        await this.rconClient.sendCommand(`SendChat 4 "Недостаточно золота: нужно ${needGold}, у вас ${bal.gold.toFixed(0)}" ${steamId}`);
        return;
      }
      if (needFame > 0 && bal.fame !== null && bal.fame < needFame) {
        await this.rconClient.sendCommand(`SendChat 4 "Недостаточно славы: нужно ${needFame}, у вас ${bal.fame.toFixed(0)}" ${steamId}`);
        return;
      }
    }
    if (needMoney > 0) {
      await this.rconClient.sendCommand(`ChangeCurrencyBalance Normal -${needMoney} ${steamId}`);
    }
    if (needGold > 0) {
      await this.rconClient.sendCommand(`ChangeCurrencyBalance Gold -${needGold} ${steamId}`);
    }
    if (needFame > 0) {
      await this.rconClient.sendCommand(`ChangeFamePoints -${needFame} ${steamId}`);
    }
    const succeeded: string[] = [];
    const failed: string[] = [];
    if (item.type === 'item') {
      const r = await this.rconClient.sendCommand(`SpawnItem ${item.itemName} ${item.amount * qty} Location ${steamId}`);
      if (r.success) succeeded.push(`${item.itemName}x${item.amount * qty}`);
      else failed.push(`предмет ${item.itemName}: ${r.response || 'ОШИБКА'}`);
    } else {
      for (let k = 0; k < qty; k++) {
        const r = await this.rconClient.sendCommand(`SpawnVehicle ${item.itemName} 1 Location ${steamId}`);
        if (r.success) succeeded.push(item.itemName);
        else failed.push(`ТС ${item.itemName}: ${r.response || 'ОШИБКА'}`);
        if (qty > 1 && k < qty - 1) await new Promise(res => setTimeout(res, 500));
      }
    }
    if (succeeded.length > 0) {
      await this.rconClient.sendCommand(`SendChat 4 "✅ Куплено: ${succeeded.join(', ')}" ${steamId}`);
    }
    if (failed.length > 0) {
      const err = failed.slice(0, 3).join('; ');
      await this.rconClient.sendCommand(`SendChat 4 "❌ Ошибка: ${err}" ${steamId}`);
    }
  }

  private async getPlayerBalances(steamId: string): Promise<{ money: number; gold: number; fame: number | null } | null> {
    if (!this.rconClient) return null;
    try {
      const r = await this.rconClient.sendCommand('ListPlayers');
      if (!r.success || !r.response) return null;
      const lines = r.response.split('\n');
      let money = 0, gold = 0, fame: number | null = null;
      let found = false;
      for (const raw of lines) {
        const line = raw.trim();
        const pipeMatch = line.match(/^PLAYER\s*\|\s*.+?\s*\|\s*steam=(\d{17})\s*\|/i);
        if (pipeMatch && pipeMatch[1] === steamId) {
          found = true;
          const moneyM = line.match(/money=([\d.+-]+)/);
          const goldM = line.match(/gold=([\d.+-]+)/);
          const fameM = line.match(/fame=([\d.+-]+)/);
          if (moneyM) money = parseFloat(moneyM[1]);
          if (goldM) gold = parseFloat(goldM[1]);
          if (fameM) fame = parseFloat(fameM[1]);
        }
      }
      if (found) {
        // Fame is not present in the new pipe format; try the legacy block too
        const section = this.extractPlayerSection(lines, steamId, '');
        for (const l of section) {
          const fm = l.match(/^Fame:\s*([\d.+-]+)/) || l.match(/\bfame[:\s]\s*([\d.+-]+)/i);
          if (fm) fame = parseFloat(fm[1]);
          const bm = l.match(/^Account balance:\s*([\d.+-]+)/);
          if (bm) money = parseFloat(bm[1]);
          const gm = l.match(/^Gold balance:\s*([\d.+-]+)/);
          if (gm) gold = parseFloat(gm[1]);
        }
        return { money, gold, fame };
      }
      return null;
    } catch (e) {
      console.error('[LogWatcher] getPlayerBalances error:', e);
      return null;
    }
  }

  // --- v0.4.6 ListPlayers helpers ---
  private parseListPlayerLine(steamId: string, text: string): { money: number; gold: number; x: number; y: number; z: number } | null {
    if (!text.includes(`steam=${steamId}`)) return null;
    const mm = text.match(/\bmoney=([\d.+-]+)/);
    const gm = text.match(/\bgold=([\d.+-]+)/);
    const pm = text.match(/\(([\d.+-]+),\s*([\d.+-]+),\s*([\d.+-]+)\)/);
    return {
      money: mm ? parseFloat(mm[1]) : 0,
      gold: gm ? parseFloat(gm[1]) : 0,
      x: pm ? parseFloat(pm[1]) : 0,
      y: pm ? parseFloat(pm[2]) : 0,
      z: pm ? parseFloat(pm[3]) : 0,
    };
  }

  private async getListPlayerData(steamId: string): Promise<{ money: number; gold: number; x: number; y: number; z: number } | null> {
    if (!this.rconClient) return null;
    const r = await this.rconClient.sendCommand('ListPlayers');
    if (!r.success || !r.response) return null;
    const lines = r.response.split('\n');
    // Try new format first (v0.4.6+)
    for (const line of lines) {
      const d = this.parseListPlayerLine(steamId, line);
      if (d) return d;
    }
    // Fallback: old format — find player section by steamId
    const steamLine = lines.find(l => l.includes(`(${steamId})`));
    if (steamLine) {
      const idx = lines.indexOf(steamLine);
      const section = this.extractPlayerSection(lines, steamId, '');
      let money = 0, gold = 0;
      let x = 0, y = 0, z = 0;
      for (const l of section) {
        const bm = l.match(/^Account balance:\s*([\d.+-]+)/);
        if (bm) money = parseFloat(bm[1]);
        const gm = l.match(/^Gold balance:\s*([\d.+-]+)/);
        if (gm) gold = parseFloat(gm[1]);
        const lm = l.match(/Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
        if (lm) { x = parseFloat(lm[1]); y = parseFloat(lm[2]); z = parseFloat(lm[3]); }
      }
      return { money, gold, x, y, z };
    }
    return null;
  }

  private async getListSpawnedVehiclesData(): Promise<{ entityId: number | null; asset: string | null; customName: string | null; ownerDbId: number | null; ownerName: string | null; x: number | null; y: number | null; z: number | null }[]> {
    if (!this.rconClient) return [];
    const r = await this.rconClient.sendCommand('ListSpawnedVehicles');
    if (!r.success || !r.response) return [];
    const vehicles: any[] = [];
    for (const line of r.response.split('\n').map(l => l.trim()).filter(Boolean)) {
      let entityId: number | null = null;
      let asset: string | null = null;
      let ownerName: string | null = null;
      let ownerDbId: number | null = null;
      let x: number | null = null, y: number | null = null, z: number | null = null;
      let customName: string | null = null;
      const idM = line.match(/ID\s+(\d+)/i);
      if (idM) entityId = parseInt(idM[1]);
      const assetM = line.match(/\|\s+([A-Z][A-Za-z_0-9]+)\s+\|/);
      if (assetM) asset = assetM[1];
      const nameM = line.match(/\|\s*name:\s*([^|]+?)\s*\|/i);
      if (nameM) customName = nameM[1].trim();
      const posM = line.match(/\(([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)/);
      if (posM) { x = parseFloat(posM[1]); y = parseFloat(posM[2]); z = parseFloat(posM[3]); }
      const ownerM = line.match(/\|\s*owner:\s*(.+?)(?:\s*\(db id (\d+)\))?\s*$/i);
      if (ownerM) {
        const raw = ownerM[1].trim();
        ownerName = (raw === '-' || raw === 'None' || raw === '') ? null : raw;
        if (ownerM[2]) ownerDbId = parseInt(ownerM[2]);
      }
      if (!ownerM) {
        const o2 = line.match(/\|\s*(.+?)\s*\(db id (\d+)\)\s*$/i);
        if (o2) {
          const rr = o2[1].trim();
          ownerName = (rr === '-' || rr === 'None' || rr === '') ? null : rr;
          ownerDbId = parseInt(o2[2]);
        }
      }
      if (entityId || asset) {
        vehicles.push({ entityId, asset, customName, ownerDbId, ownerName, x, y, z });
      }
    }
    return vehicles;
  }

  private getPlayerDbIds(steamId: string): { pid: number | null; prisId: number | null; name: string } {
    if (this.scumDb) {
      try {
        const p = this.scumDb.getPlayerBySteamId(steamId);
        if (p) return { pid: p.profileId || p.id || null, prisId: p.prisonerId || null, name: p.name || '' };
      } catch {}
    }
    return { pid: null, prisId: null, name: '' };
  }

  private vehicleBelongsToPlayer(v: any, pid: number | null, prisId: number | null, name: string): boolean {
    if (v.ownerDbId != null && pid != null && (v.ownerDbId === pid || v.ownerDbId === prisId)) return true;
    if (v.ownerName && name && v.ownerName.toLowerCase() === name.toLowerCase()) return true;
    return false;
  }

  private startWatching(): void {
    const logsPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
    console.log('[LogWatcher] Watching logs path:', logsPath);
    if (fs.existsSync(logsPath)) {
      // Pre-load the tail of existing log files so the Logs tab shows history
      // on startup, then set offsets to EOF so chokidar/polling only sees new data.
      try {
        for (const f of fs.readdirSync(logsPath)) {
          if (f.endsWith('.log')) {
            const fp = path.join(logsPath, f);
            const stat = fs.statSync(fp);
            if (stat.size > 0) {
              this.offsets.set(fp, stat.size);
              const tailStart = Math.max(0, stat.size - 65536);
              this.readFromOffset(fp, tailStart, stat.size, true).catch(() => {});
            }
          }
        }
        console.log('[LogWatcher] Pre-populated offsets for', this.offsets.size, 'log files');
      } catch {}

      const watcher = watch(path.join(logsPath, '*.log'), {
        persistent: true, ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 300 },
      });
      watcher.on('add', (fp) => { console.log('[LogWatcher] File added:', fp); this.handleFileAdd(fp); });
      watcher.on('change', (fp) => { console.log('[LogWatcher] File changed:', fp); this.handleFileChange(fp); });
      this.watchers.push(watcher);
      console.log('[LogWatcher] Watcher started for:', logsPath);
    } else {
      console.log('[LogWatcher] Logs path does not exist:', logsPath);
    }

    console.log('[LogWatcher] Starting chat log poll every 2s');
    this.pollTimer = setInterval(() => this.pollChatLog(), 2000);

    const scumLog = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
    if (fs.existsSync(scumLog)) {
      this.scumLogOffset = fs.statSync(scumLog).size;
      this.readScumLogTail(Math.max(0, this.scumLogOffset - 65536), this.scumLogOffset).catch(() => {});
      const sw = watch(scumLog, { persistent: true, ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 200 } });
      sw.on('change', () => this.handleScumLogChange());
      sw.on('add', () => this.handleScumLogChange());
      this.watchers.push(sw);
    }
  }

  private handleFileAdd(filePath: string): void {
    try {
      if (this.offsets.has(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.size > 0) this.offsets.set(filePath, stat.size);
    } catch {}
  }

  private async handleFileChange(filePath: string): Promise<void> {
    try {
      const lastOffset = this.offsets.get(filePath) || 0;
      const stat = await fs.stat(filePath);
      if (stat.size <= lastOffset) return;
      await this.readFromOffset(filePath, lastOffset, stat.size);
    } catch {}
  }

  private async readFromOffset(filePath: string, start: number, end: number, skipActions = false): Promise<void> {
    const buf = Buffer.alloc(Math.min(end - start, 4));
    try {
      const fd = await fs.promises.open(filePath, 'r');
      await fd.read(buf, 0, buf.length, start);
      await fd.close();
    } catch {}
    const isUtf16 = buf.length >= 2 && buf[1] === 0x00;
    const encoding = isUtf16 ? 'utf16le' : 'utf-8';
    const stream = fs.createReadStream(filePath, { start, end: end - 1, encoding });
    let data = '';
    for await (const chunk of stream) { data += chunk; }
    this.offsets.set(filePath, end);
    const lines = data.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      await this.processLine(filePath, line, skipActions);
    }
  }

  private async handleScumLogChange(): Promise<void> {
    try {
      const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
      const stat = fs.statSync(logPath);
      if (stat.size <= this.scumLogOffset) return;
      await this.readScumLogTail(Math.max(0, stat.size - 65536), stat.size);
    } catch {}
  }

  private async readScumLogTail(start: number, end: number): Promise<void> {
    try {
      const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
      const readSize = Math.max(0, end - start);
      if (readSize <= 0) return;
      const buf = Buffer.alloc(readSize);
      const fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buf, 0, readSize, start);
      fs.closeSync(fd);
      this.scumLogOffset = Math.max(this.scumLogOffset, end);
      this.parseScumText(buf);
    } catch {}
  }

  private parseScumText(buf: Buffer): void {
    try {
      const encoding = buf[1] === 0 ? 'utf16le' : 'utf-8';
      const text = buf.toString(encoding);
      for (const line of text.split('\n').filter(Boolean)) {
        const pm = line.match(/HandlePossessedBy:\s*(\d+),\s*(\d+),\s*(\S+)/);
        if (pm) { this.discord.sendLoginEvent(pm[3], '', 'join').catch(() => {}); this.addEvent('login', `${pm[3]} connected`); continue; }
        const lm = line.match(/LogSCUM:.+'(\d+):([^(]+)\((\d+)\)'.+logged in/);
        if (lm) { this.discord.sendLoginEvent(lm[2].trim(), '', 'join').catch(() => {}); this.addEvent('login', `${lm[2].trim()} connected`); continue; }
        const llout = line.match(/LogSCUM:.+'(\d+):([^(]+)\(\d+\)'.+logged out/);
        if (llout) { this.discord.sendLoginEvent(llout[2].trim(), '', 'leave').catch(() => {}); this.addEvent('login', `${llout[2].trim()} disconnected`); continue; }
        const plout = line.match(/Prisoner logging out:\s*([^(]+)\s*\(\d+\)/);
        if (plout) { this.discord.sendLoginEvent(plout[1].trim(), '', 'leave').catch(() => {}); this.addEvent('login', `${plout[1].trim()} disconnected`); continue; }
        const gm = line.match(/Global Stats:.*?P:\s*(\d+)/);
        if (gm) this.lastPlayerCount = parseInt(gm[1], 10);
      }
    } catch {}
  }

  private addEvent(type: string, message: string): void {
    this.events.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), type: type as any, message });
    this.trimEvents();
  }

  private trimEvents(): void {
    if (this.events.length > 5000) this.events = this.events.slice(-3000);
  }

  private async processLine(filePath: string, line: string, skipActions = false): Promise<void> {
    const fileName = path.basename(filePath).toLowerCase();
    if (/^[\d.]+-[\d.]+:\s*Game version:/i.test(line)) return;
    const event: LogEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), type: 'system', message: line };
    if (fileName.startsWith('admin')) { event.type = 'admin'; if (!skipActions) this.discord.sendAdminLog(line); }
    else if (fileName.startsWith('chat')) { 
      event.type = 'chat'; 
      console.log('[LogWatcher] Chat line:', line);
      // Format: YYYY.MM.DD-HH.MM.SS: 'SteamID:PlayerName(CharID)' 'Channel: Message'
      const m = line.match(/'(\d+):([^(]+)\(\d+\)'[^']*'([^:]+):\s*([^']+)/); 
      if (m) { 
        const steamId = m[1];
        const playerName = m[2].trim();
        const channel = m[3].trim();
        const message = m[4].trim();
        console.log('[LogWatcher] Parsed chat:', { steamId, playerName, channel, message });
        if (!skipActions) {
          this.discord.sendChatMessage(playerName, message);
          await this.processChatCommand(steamId, playerName, message);
        }
      } else {
        console.log('[LogWatcher] Chat regex did not match for line:', line);
      }
    }
    else if (fileName.startsWith('login')) { event.type = 'login'; const m = line.match(/LoginComm: Login: (.+?)\((\d+)\)/); if (m && !skipActions) this.discord.sendLoginEvent(m[1].trim(), m[2], 'join'); }
    else if (fileName.includes('vehicle')) { event.type = 'vehicle'; if (!skipActions) this.discord.sendVehicleEvent(line); }
    this.events.push(event);
    this.trimEvents();
  }

  getEvents(): LogEvent[] {
    return [...this.events];
  }

  getEventsByType(type: string): LogEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  private pollChatLog(): void {
    try {
      const logsPath = path.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
      if (!fs.existsSync(logsPath)) return;
      const files = fs.readdirSync(logsPath).filter(f => f.toLowerCase().startsWith('chat') && f.endsWith('.log'));
      if (files.length === 0) return;
      const latest = files.map(f => ({ name: f, time: fs.statSync(path.join(logsPath, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time)[0].name;
      const fp = path.join(logsPath, latest);
      const stat = fs.statSync(fp);
      const lastOffset = this.offsets.get(fp) || 0;
      if (stat.size > lastOffset) {
        console.log('[LogWatcher] Poll: detected new content in', latest);
        this.readFromOffset(fp, lastOffset, stat.size);
      }
    } catch {}
  }

  destroy(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
    this.offsets.clear();
    this.scumLogOffset = 0;
  }
}
