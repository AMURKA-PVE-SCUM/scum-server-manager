import path from 'path';
import fs from 'fs-extra';
import { RconClient } from './rconClient';
import type { WargmSettings, WargmCard, WargmCardItem, WargmDelivery } from './types';

let SQL: any = null;
let initPromise: Promise<void> | null = null;

async function initSqlJsModule(): Promise<void> {
  if (SQL) return;
  const mod = require('sql.js');
  const candidates = [
    path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  for (const wasmPath of candidates) {
    if (fs.existsSync(wasmPath)) {
      SQL = await mod({ locateFile: () => wasmPath });
      return;
    }
  }
  throw new Error('sql-wasm.wasm not found');
}

function initSqlJs(): Promise<void> {
  if (!initPromise) initPromise = initSqlJsModule();
  return initPromise;
}

export class WargmManager {
  private db: any = null;
  private dbPath: string;
  private rconClient: RconClient | null = null;
  private vipAddCallback: ((steamId: string, days: number) => void) | null = null;
  private lastCommandTime = new Map<string, number>();

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'wargm.db');
    fs.ensureDirSync(path.dirname(this.dbPath));
  }

  setServerPath(serverPath: string): void {
    const newPath = path.join(serverPath, 'SCUM', 'Saved', 'SaveFiles', 'wargm.db');
    if (newPath !== this.dbPath) {
      // Save old db and close before switching
      if (this.db) this.save();
      this.db = null;
      // Migrate old db if exists
      if (fs.existsSync(this.dbPath) && !fs.existsSync(newPath)) {
        fs.ensureDirSync(path.dirname(newPath));
        fs.copyFileSync(this.dbPath, newPath);
        console.log(`[Wargm] Migrated DB to ${newPath}`);
      }
      this.dbPath = newPath;
      fs.ensureDirSync(path.dirname(this.dbPath));
    }
  }

  setRconClient(client: RconClient): void {
    this.rconClient = client;
  }

  setVipAddCallback(cb: (steamId: string, days: number) => void): void {
    this.vipAddCallback = cb;
  }

  async init(): Promise<boolean> {
    try {
      await initSqlJs();
      if (fs.existsSync(this.dbPath)) {
        const buf = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buf);
      } else {
        this.db = new SQL.Database();
      }
      this.createTables();
      this.insertDefaultSettings();
      return true;
    } catch (e: any) {
      console.error('[WargmDB] Init error:', e.message);
      return false;
    }
  }

  private createTables(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS wargm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS wargm_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      shop_item_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS wargm_card_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (card_id) REFERENCES wargm_cards(id) ON DELETE CASCADE
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS wargm_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id TEXT NOT NULL UNIQUE,
      steam_id TEXT NOT NULL,
      card_id INTEGER NOT NULL,
      delivered_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES wargm_cards(id)
    )`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_deliveries_steam ON wargm_deliveries(steam_id)`);
    this.save();
  }

  private insertDefaultSettings(): void {
    const existing = this.query(`SELECT COUNT(*) as cnt FROM wargm_settings`);
    if (existing[0]?.cnt > 0) return;
    const defaults: Record<string, string> = {
      apiUrl: 'https://api.wargm.ru/v1/',
      shopId: '',
      apiKey: '',
      timeout: '30',
      duplicateCheckMinutes: '5',
      commandCooldownSeconds: '30',
      maxItemsPerCard: '50',
    };
    for (const [k, v] of Object.entries(defaults)) {
      this.db.run(`INSERT INTO wargm_settings (key, value) VALUES (?, ?)`, [k, v]);
    }
    this.save();
  }

  private query(sql: string, params?: any[]): any[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(sql);
      if (params) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (e: any) {
      console.error('[WargmDB] query error:', e.message);
      return [];
    }
  }

  private run(sql: string, params?: any[]): boolean {
    if (!this.db) return false;
    try {
      this.db.run(sql, params);
      return true;
    } catch (e: any) {
      console.error('[WargmDB] run error:', e.message);
      return false;
    }
  }

  private save(): void {
    try {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (e: any) {
      console.error('[WargmDB] save error:', e.message);
    }
  }

  // Settings
  getSettings(): WargmSettings {
    const rows = this.query(`SELECT key, value FROM wargm_settings`);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      apiUrl: map.apiUrl || 'https://api.wargm.ru/v1/',
      shopId: map.shopId || '',
      apiKey: map.apiKey || '',
      timeout: parseInt(map.timeout) || 10,
      duplicateCheckMinutes: parseInt(map.duplicateCheckMinutes) || 5,
      commandCooldownSeconds: parseInt(map.commandCooldownSeconds) || 30,
      maxItemsPerCard: parseInt(map.maxItemsPerCard) || 50,
    };
  }

  saveSettings(s: WargmSettings): void {
    const entries: [string, string][] = [
      ['apiUrl', s.apiUrl],
      ['shopId', s.shopId],
      ['apiKey', s.apiKey],
      ['timeout', String(s.timeout || 10)],
      ['duplicateCheckMinutes', String(s.duplicateCheckMinutes || 5)],
      ['commandCooldownSeconds', String(s.commandCooldownSeconds || 30)],
      ['maxItemsPerCard', String(s.maxItemsPerCard || 50)],
    ];
    for (const [k, v] of entries) {
      this.run(`INSERT OR REPLACE INTO wargm_settings (key, value) VALUES (?, ?)`, [k, v]);
    }
    this.save();
  }

  // Cards
  getCards(): WargmCard[] {
    const cards = this.query(`SELECT * FROM wargm_cards ORDER BY id DESC`);
    const result: WargmCard[] = [];
    for (const c of cards) {
      const items = this.query(
        `SELECT * FROM wargm_card_items WHERE card_id = ? ORDER BY sort_order ASC, id ASC`,
        [c.id],
      );
      result.push({
        id: c.id,
        name: c.name,
        shopItemId: c.shop_item_id,
        enabled: !!c.enabled,
        items: items.map((i: any) => ({
          id: i.id,
          type: i.type,
          data: JSON.parse(i.data || '{}'),
          sortOrder: i.sort_order,
        })),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      });
    }
    return result;
  }

  getCard(id: number): WargmCard | null {
    const cards = this.query(`SELECT * FROM wargm_cards WHERE id = ?`, [id]);
    if (!cards.length) return null;
    const c = cards[0];
    const items = this.query(
      `SELECT * FROM wargm_card_items WHERE card_id = ? ORDER BY sort_order ASC, id ASC`,
      [id],
    );
    return {
      id: c.id,
      name: c.name,
      shopItemId: c.shop_item_id,
      enabled: !!c.enabled,
      items: items.map((i: any) => ({
        id: i.id,
        type: i.type,
        data: JSON.parse(i.data || '{}'),
        sortOrder: i.sort_order,
      })),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };
  }

  saveCard(card: WargmCard): number | null {
    if (!this.db) return null;
    this.db.exec('BEGIN');
    try {
      const now = new Date().toISOString();
      if (card.id) {
        this.run(
          `UPDATE wargm_cards SET name = ?, shop_item_id = ?, enabled = ?, updated_at = ? WHERE id = ?`,
          [card.name, card.shopItemId, card.enabled ? 1 : 0, now, card.id],
        );
        this.run(`DELETE FROM wargm_card_items WHERE card_id = ?`, [card.id]);
      } else {
        this.run(
          `INSERT INTO wargm_cards (name, shop_item_id, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          [card.name, card.shopItemId, card.enabled ? 1 : 0, now, now],
        );
      }
      let cardId = card.id;
      if (!cardId) {
        const rows = this.query(`SELECT last_insert_rowid() as id`);
        cardId = rows[0]?.id;
        if (!cardId) { this.db.exec('ROLLBACK'); this.save(); return null; }
      }
      for (let i = 0; i < card.items.length; i++) {
        const item = card.items[i];
        this.run(
          `INSERT INTO wargm_card_items (card_id, type, data, sort_order) VALUES (?, ?, ?, ?)`,
          [cardId, item.type, JSON.stringify(item.data), i],
        );
      }
      this.db.exec('COMMIT');
      this.save();
      return cardId;
    } catch (e: any) {
      this.db.exec('ROLLBACK');
      console.error('[WargmDB] saveCard error:', e.message);
      return null;
    }
  }

  deleteCard(id: number): boolean {
    this.run(`DELETE FROM wargm_card_items WHERE card_id = ?`, [id]);
    const ok = this.run(`DELETE FROM wargm_cards WHERE id = ?`, [id]);
    this.save();
    return ok;
  }

  duplicateCard(id: number): number | null {
    const card = this.getCard(id);
    if (!card) return null;
    const newCard: WargmCard = {
      name: card.name + ' (copy)',
      shopItemId: card.shopItemId,
      enabled: false,
      items: card.items.map(i => ({ ...i, id: undefined })),
    };
    return this.saveCard(newCard);
  }

  // Delivery tracking
  isDelivered(purchaseId: string): boolean {
    const rows = this.query(`SELECT COUNT(*) as cnt FROM wargm_deliveries WHERE purchase_id = ?`, [purchaseId]);
    return (rows[0]?.cnt || 0) > 0;
  }

  addDelivery(purchaseId: string, steamId: string, cardId: number): void {
    this.run(
      `INSERT OR IGNORE INTO wargm_deliveries (purchase_id, steam_id, card_id, delivered_at) VALUES (?, ?, ?, ?)`,
      [purchaseId, steamId, cardId, new Date().toISOString()],
    );
    this.save();
  }

  getDeliveriesBySteam(steamId: string, limit = 50): WargmDelivery[] {
    const rows = this.query(
      `SELECT d.*, c.name as card_name FROM wargm_deliveries d LEFT JOIN wargm_cards c ON d.card_id = c.id WHERE d.steam_id = ? ORDER BY d.delivered_at DESC LIMIT ?`,
      [steamId, limit],
    );
    return rows.map((r: any) => ({
      id: r.id,
      purchaseId: r.purchase_id,
      steamId: r.steam_id,
      cardId: r.card_id,
      cardName: r.card_name || '',
      deliveredAt: r.delivered_at,
    }));
  }

  // Rate limiting
  checkCommandCooldown(steamId: string, seconds: number): number {
    const last = this.lastCommandTime.get(steamId) || 0;
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed < seconds) return Math.ceil(seconds - elapsed);
    return 0;
  }

  setCommandCooldown(steamId: string): void {
    this.lastCommandTime.set(steamId, Date.now());
  }

  // WARGM API request — auth via query param client=shopId:apiKey
  private async apiRequest(
    settings: WargmSettings,
    endpoint: string,
    method = 'GET',
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const base = settings.apiUrl.replace(/\/+$/, '');
    const auth = `client=${encodeURIComponent(settings.shopId)}:${encodeURIComponent(settings.apiKey)}`;
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${base}/${endpoint.replace(/^\//, '')}${sep}${auth}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (settings.timeout || 10) * 1000);

    try {
      const opts: any = { method, signal: controller.signal };
      const res = await fetch(url, opts);
      const text = await res.text();
      this.logApiCall(endpoint, method, res.status, text);
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { success: true, data };
    } catch (e: any) {
      const msg = e.name === 'AbortError' ? `Timeout after ${settings.timeout || 30}s` : e.message;
      this.logApiCall(endpoint, method, 0, msg);
      return { success: false, error: msg };
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(settings: WargmSettings): Promise<{ ok: boolean; message: string }> {
    if (!settings.apiUrl || !settings.shopId || !settings.apiKey) {
      return { ok: false, message: 'Fill API URL, Shop ID and API Key' };
    }
    const result = await this.apiRequest(settings, 'shop/info');
    if (result.success) return { ok: true, message: 'Connection successful' };
    return { ok: false, message: result.error || 'Connection failed' };
  }

  async fetchPendingOperations(settings: WargmSettings, steamId: string): Promise<{
    operations: any[];
    error?: string;
    raw?: any;
  }> {
    // Try with status=pending first, then fallback to no filter
    for (const statusFilter of ['?status=pending&', '?']) {
      const result = await this.apiRequest(
        settings,
        `shop/operations${statusFilter}steam_id=${encodeURIComponent(steamId)}`,
      );
      if (!result.success) {
        console.log(`[Wargm] fetchPendingOperations failed: ${result.error}`);
        continue;
      }
      const ops = this.extractOperations(result.data);
      if (ops.length > 0) return { operations: ops, raw: result.data };
    }

    // Final attempt without any filter at all
    const last = await this.apiRequest(settings, `shop/operations`);
    if (last.success) {
      const ops = this.extractOperations(last.data);
      return { operations: ops, raw: last.data };
    }

    return { operations: [], raw: null };
  }

  private extractOperations(d: any): any[] {
    if (!d) return [];
    console.log('[Wargm] extractOperations RAW:', JSON.stringify(d).slice(0, 2000));

    // responce.data can be array or object (keyed by op id)
    if (d?.responce?.data) {
      const rd = d.responce.data;
      if (Array.isArray(rd)) return rd;
      if (typeof rd === 'object') return Object.values(rd);
    }

    // Direct array at root
    if (Array.isArray(d)) return d;

    // Common wrapper fields
    for (const key of ['data', 'operations', 'result', 'items', 'list']) {
      if (d?.[key] && Array.isArray(d[key])) return d[key];
    }

    // Nested under responce
    for (const key of ['data', 'operations', 'result', 'items', 'list']) {
      if (d?.responce?.[key] && Array.isArray(d.responce[key])) return d.responce[key];
    }

    // Fallback: find first array property
    for (const key of Object.keys(d || {})) {
      if (Array.isArray(d[key])) return d[key];
    }

    return [];
  }

  async fetchRawOperations(settings: WargmSettings, steamId: string): Promise<any> {
    const result = await this.apiRequest(
      settings,
      `shop/operations?status=pending&steam_id=${encodeURIComponent(steamId)}`,
    );
    return result;
  }

  async claimOperation(settings: WargmSettings, operationId: string | number): Promise<boolean> {
    const result = await this.apiRequest(
      settings,
      `shop/operation_claim?operation_id=${operationId}`,
    );
    if (!result.success) {
      console.error(`[Wargm] claimOperation failed for ${operationId}: ${result.error}`);
    }
    return result.success;
  }

  // Execute delivery
  async executeCard(card: WargmCard, steamId: string): Promise<{ success: boolean; results: string[] }> {
    if (!this.rconClient || !this.rconClient.isConnected()) {
      return { success: false, results: ['RCON не подключён'] };
    }

    const results: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < card.items.length; i++) {
      const item = card.items[i];
      if (i > 0) await this.delay(500);
      try {
        const r = await this.executeItem(item, steamId);
        if (r.success) results.push(r.message);
        else errors.push(r.message);
      } catch (e: any) {
        errors.push(`${item.type}: ${e.message}`);
      }
    }

    this.logDelivery(steamId, card.name || `ID:${card.id}`, results, errors);
    return {
      success: errors.length === 0,
      results: results.length > 0 ? results : errors,
    };
  }

  private async getPlayerLocation(steamId: string): Promise<{ x: number; y: number; z: number } | null> {
    if (!this.rconClient) return null;
    const r = await this.rconClient.sendCommand('ListPlayers');
    if (!r.success || !r.response) return null;
    const lines = r.response.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const steamMatch = trimmed.match(/Steam:\s*.+?\((\d{17})\)/);
      if (steamMatch && steamMatch[1] === steamId) {
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].trim();
          if (t.match(/^\d+\.\s+\S/)) break;
          const locMatch = t.match(/Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
          if (locMatch) return { x: parseFloat(locMatch[1]), y: parseFloat(locMatch[2]), z: parseFloat(locMatch[3]) };
        }
        return null;
      }
    }
    return null;
  }

  private async getPlayerBalance(steamId: string): Promise<{ normal: number; gold: number; fame: number; found: boolean }> {
    if (!this.rconClient) return { normal: 0, gold: 0, fame: 0, found: false };
    const r = await this.rconClient.sendCommand('ListPlayers');
    if (!r.success || !r.response) return { normal: 0, gold: 0, fame: 0, found: false };
    const lines = r.response.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const steamMatch = trimmed.match(/Steam:\s*.+?\((\d{17})\)/);
      if (steamMatch && steamMatch[1] === steamId) {
        let normal = 0, gold = 0, fame = 0;
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].trim();
          if (t.match(/^\d+\.\s+\S/)) break;
          const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
          if (bm) normal = parseFloat(bm[1]);
          const gm = t.match(/^Gold balance:\s*([\d.+-]+)/);
          if (gm) gold = parseFloat(gm[1]);
          const fm = t.match(/^Fame:\s*([\d.+-]+)/);
          if (fm) fame = parseFloat(fm[1]);
        }
        return { normal, gold, fame, found: true };
      }
    }
    return { normal: 0, gold: 0, fame: 0, found: false };
  }

  private async executeItem(item: WargmCardItem, steamId: string): Promise<{ success: boolean; message: string }> {
    if (!this.rconClient) return { success: false, message: 'RCON not available' };
    const d = item.data;

    switch (item.type) {
      case 'item': {
        const name = d.itemName || d.shortname || '';
        const amount = parseInt(d.amount) || 1;
        if (!name) return { success: false, message: 'Предмет: не указано название' };
        const cmd = `SpawnItem ${name} ${amount} Location ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Предмет ${name}x${amount}` : `Предмет ${name}: ${r.response || 'ОШИБКА'}` };
      }

      case 'vehicle': {
        const name = d.vehicleName || d.shortname || '';
        if (!name) return { success: false, message: 'ТС: не указано название' };
        const cmd = `SpawnVehicle ${name} 1 Location ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `ТС ${name}` : `ТС ${name}: ${r.response || 'ОШИБКА'}` };
      }

      case 'skill': {
        const skill = d.skillName || '';
        const level = d.level || 1;
        if (skill === 'ALL') {
          const allSkills = [
            'Archery', 'Aviation', 'Awareness', 'Brawling',
            'Camouflage', 'Cooking', 'Demolition', 'Driving',
            'Endurance', 'Engineering', 'Farming', 'Handgun',
            'Medical', 'Motorcycling', 'Resistance', 'Rifles',
            'Running', 'Sniping', 'Stealth', 'Survival',
            'Tactics', 'Thievery', '"Melee Weapons"',
          ];
          let ok = 0, fail = 0;
          for (const s of allSkills) {
            const r = await this.rconClient.sendCommand(`SetSkillLevel ${s} ${level} ${steamId}`);
            if (r.success) ok++; else fail++;
          }
          return { success: fail === 0, message: `Все навыки установлены на ${level} (${ok} успешно, ${fail} ошибок)` };
        }
        if (!skill) return { success: false, message: 'Навык: не указано название' };
        const cmd = `SetSkillLevel ${skill} ${level} ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Навык ${skill}→${level}` : `Навык ${skill}: ${r.response || 'ОШИБКА'}` };
      }

      case 'attributes': {
        const str = parseInt(d.strength) || 5;
        const dex = parseInt(d.dexterity) || 5;
        const sta = parseInt(d.stamina) || 5;
        const intl = parseInt(d.intellect) || 5;
        const cmd = `SetAttributes ${str} ${dex} ${sta} ${intl} ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Атрибуты ${str}/${dex}/${sta}/${intl}` : `Атрибуты: ${r.response || 'ОШИБКА'}` };
      }

      case 'money': {
        const amount = parseInt(d.amount) || 0;
        if (amount <= 0) return { success: false, message: 'Деньги: неверная сумма' };
        const bal = await this.getPlayerBalance(steamId);
        if (!bal.found) return { success: false, message: 'Игрок офлайн — деньги не начислены' };
        const newBalance = Math.round((bal.normal || 0) + amount);
        const cmd = `#SetCurrencyBalance Normal ${newBalance} ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Деньги +${amount} (${bal.normal}→${newBalance})` : `Деньги: ${r.response || 'ОШИБКА'}` };
      }

      case 'gold': {
        const amount = parseInt(d.amount) || 0;
        if (amount <= 0) return { success: false, message: 'Золото: неверное количество' };
        const bal = await this.getPlayerBalance(steamId);
        if (!bal.found) return { success: false, message: 'Игрок офлайн — золото не начислено' };
        const newGold = Math.round((bal.gold || 0) + amount);
        const cmd = `#SetCurrencyBalance Gold ${newGold} ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Золото +${amount} (${bal.gold}→${newGold})` : `Золото: ${r.response || 'ОШИБКА'}` };
      }

      case 'fame': {
        const amount = parseInt(d.amount) || 0;
        if (amount <= 0) return { success: false, message: 'Слава: неверное количество' };
        const bal = await this.getPlayerBalance(steamId);
        if (!bal.found) return { success: false, message: 'Игрок офлайн — слава не начислена' };
        const newFame = Math.round((bal.fame || 0) + amount);
        const cmd = `#SetFamePoints ${newFame} ${steamId}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Слава +${amount} (${bal.fame}→${newFame})` : `Слава: ${r.response || 'ОШИБКА'}` };
      }

      case 'cargo_drop': {
        const loc = await this.getPlayerLocation(steamId);
        if (!loc) {
          console.log(`[Wargm] CargoDrop failed: getPlayerLocation returned null for ${steamId}`);
          return { success: false, message: 'Дроп: не удалось определить координаты игрока' };
        }
        console.log(`[Wargm] CargoDrop at player ${steamId} location ${loc.x},${loc.y},${loc.z}`);
        const cmd = `ScheduleWorldEvent BP_CargoDropEvent ${loc.x} ${loc.y} ${loc.z}`;
        const r = await this.rconClient.sendCommand(cmd);
        return { success: r.success, message: r.success ? `Дроп в ${loc.x},${loc.y},${loc.z}` : `Дроп: ${r.response || 'ОШИБКА'}` };
      }

      case 'vip': {
        const days = parseInt(d.days) || 30;
        if (this.vipAddCallback) {
          this.vipAddCallback(steamId, days);
          return { success: true, message: `VIP на ${days} дн.` };
        }
        return { success: false, message: 'VIP: система не настроена' };
      }

      default:
        return { success: false, message: `Неизвестный тип: ${item.type}` };
    }
  }

  async processPlayer(settings: WargmSettings, steamId: string): Promise<{
    ok: boolean;
    results: string[];
    cards: { card: WargmCard; results: string[] }[];
  }> {
    const cards = this.getCards().filter(c => c.enabled);
    if (cards.length === 0) return { ok: false, results: ['Нет активных карточек'], cards: [] };

    const { operations, error } = await this.fetchPendingOperations(settings, steamId);
    if (error) return { ok: false, results: [`Ошибка API: ${error}`], cards: [] };
    if (!operations.length) return { ok: false, results: ['Покупок не найдено'], cards: [] };

    const processed: { card: WargmCard; results: string[] }[] = [];
    const allResults: string[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const opId = op.id ?? op.operation_id;
      if (!opId || this.isDelivered(String(opId))) continue;

      // Match offer_id from the operation to our card's shopItemId
      const offerId = String(op.offer_id ?? op.offerId ?? '');
      const matchCard = cards.find(c => c.shopItemId === offerId);
      if (!matchCard) {
        console.log(`[Wargm] No card matches offer_id=${offerId} for op ${opId}, available cards: ${cards.map(c => c.shopItemId).join(',')}`);
        continue;
      }

      if (i > 0) await this.delay(1000);

      const execResult = await this.executeCard(matchCard, steamId);

      // Claim on WARGM first, then mark local delivery only on success
      const claimed = await this.claimOperation(settings, opId);
      if (!claimed) {
        console.error(`[Wargm] Failed to claim operation ${opId} for card ${matchCard.name}, will retry`);
        continue;
      }

      this.addDelivery(String(opId), steamId, matchCard.id!);

      processed.push({ card: matchCard, results: execResult.results });
      allResults.push(`${matchCard.name}: ${execResult.results.join(', ')}`);
    }

    return {
      ok: processed.length > 0,
      results: allResults.length > 0 ? allResults : ['Новых покупок для выдачи нет'],
      cards: processed,
    };
  }

  // Export/Import
  exportCards(): string {
    const cards = this.getCards();
    const exportData = cards.map(c => ({
      name: c.name,
      shopItemId: c.shopItemId,
      enabled: c.enabled,
      items: c.items,
    }));
    return JSON.stringify(exportData, null, 2);
  }

  importCards(json: string): { imported: number; errors: string[] } {
    let data: any[];
    try { data = JSON.parse(json); } catch { return { imported: 0, errors: ['Invalid JSON'] }; }
    if (!Array.isArray(data)) return { imported: 0, errors: ['Expected array'] };

    let imported = 0;
    const errors: string[] = [];
    for (const item of data) {
      if (!item.name || !item.shopItemId) {
        errors.push(`Skipped: missing name or shopItemId`);
        continue;
      }
      const card: WargmCard = {
        name: item.name,
        shopItemId: item.shopItemId,
        enabled: item.enabled !== false,
        items: Array.isArray(item.items) ? item.items : [],
      };
      const id = this.saveCard(card);
      if (id) imported++;
      else errors.push(`Failed to save: ${item.name}`);
    }
    return { imported, errors };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Logging
  private logApiCall(endpoint: string, method: string, status: number, response: string): void {
    try {
      const logPath = path.join(process.cwd(), 'logs', `wargm_api_${new Date().toISOString().slice(0, 10)}.log`);
      fs.ensureDirSync(path.dirname(logPath));
      const line = `[${new Date().toISOString()}] [${method}] ${endpoint} → ${status}: ${response.slice(0, 500)}\n`;
      fs.appendFileSync(logPath, line);
    } catch {}
  }

  private logDelivery(steamId: string, cardName: string, results: string[], errors: string[]): void {
    try {
      const logPath = path.join(process.cwd(), 'logs', `wargm_deliveries_${new Date().toISOString().slice(0, 10)}.log`);
      fs.ensureDirSync(path.dirname(logPath));
      const ok = results.length > 0 ? `OK: ${results.join(', ')}` : '';
      const err = errors.length > 0 ? ` ERR: ${errors.join(', ')}` : '';
      const line = `[${new Date().toISOString()}] [${steamId}] Card: ${cardName} — ${ok}${err}\n`;
      fs.appendFileSync(logPath, line);
    } catch {}
  }

  close(): void {
    if (this.db) {
      this.save();
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }
}