import path from 'path';
import fs from 'fs-extra';

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

export function initSqlJs(): Promise<void> {
  if (!initPromise) initPromise = initSqlJsModule();
  return initPromise;
}

export class ScumDatabaseReader {
  private dbPath = '';
  private db: any = null;

  constructor(serverPath: string) {
    if (serverPath) this.setServerPath(serverPath);
  }

  setServerPath(serverPath: string): void {
    const p = path.join(serverPath, 'SCUM', 'Saved', 'SaveFiles', 'SCUM.db');
    if (p !== this.dbPath) { this.close(); this.dbPath = p; }
  }

  isAvailable(): boolean {
    return !!this.dbPath && fs.existsSync(this.dbPath);
  }

  open(): void {
    if (this.db) return;
    if (!this.dbPath || !fs.existsSync(this.dbPath)) throw new Error(`SCUM.db not found at ${this.dbPath}`);
    if (!SQL) throw new Error('sql.js not initialized. Call initSqlJs() first.');
    const buf = fs.readFileSync(this.dbPath);
    this.db = new SQL.Database(buf);
  }

  close(): void {
    if (this.db) { try { this.db.close(); } catch {} this.db = null; }
  }

  private ensureOpen(): void {
    if (!this.db) this.open();
  }

  private query(sql: string, params?: any[]): any[] {
    try { this.ensureOpen(); } catch (e: any) { console.error('[SCUMdb] open error:', e.message); return []; }
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(sql);
      if (params) stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (e: any) { console.error('[SCUMdb] query error:', e.message); return []; }
  }

  private run(sql: string, params?: any[]): boolean {
    try { this.ensureOpen(); } catch { return false; }
    if (!this.db) return false;
    try { this.db.run(sql, params); return true; } catch (e: any) { console.error('[SCUMdb] run error:', e.message); return false; }
  }

  private save(): void {
    try { const data = this.db.export(); fs.writeFileSync(this.dbPath, Buffer.from(data)); } catch {}
  }

  getTables(): string[] {
    return this.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r: any) => r.name);
  }

  getPlayers(limit = 500): any[] {
    try { this.ensureOpen(); } catch { return []; }
    if (!this.db) return [];
    try {
      const cols = this.query("PRAGMA table_info(user_profile)").map((c: any) => c.name);
      const nameCol = cols.includes('name') ? 'name' : 'Name';
      const steamCol = cols.includes('user_id') ? 'user_id' : (cols.includes('steam_id') ? 'steam_id' : (cols.includes('SteamId') ? 'SteamId' : 'user_id'));
      const moneyCol = cols.includes('money_balance') ? 'money_balance' : 'money_balance';
      const fameCol = cols.includes('fame_points') ? 'fame_points' : 'fame_points';
      const loginCol = cols.includes('last_login_time') ? 'last_login_time' : 'last_login_time';
      const logoutCol = cols.includes('last_logout_time') ? 'last_logout_time' : 'last_logout_time';
      const prisonerCol = cols.includes('prisoner_id') ? 'prisoner_id' : 'prisoner_id';
      const sql = `SELECT id AS profileId, ${steamCol} AS steamId, ${nameCol} AS name, ${prisonerCol} AS prisonerId, COALESCE(${moneyCol}, 0) AS walletBalance, COALESCE(${fameCol}, 0) AS famePoints, COALESCE(${loginCol}, 0) AS lastLogin, COALESCE(${logoutCol}, 0) AS lastLogout FROM user_profile ORDER BY COALESCE(${loginCol}, 0) DESC LIMIT ?`;
      const stmt = this.db.prepare(sql);
      stmt.bind([limit]);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (e: any) { console.error('[SCUMdb] getPlayers error:', e.message); return []; }
  }

  getPlayerBySteamId(steamId: string): any {
    const rows = this.query(`SELECT id AS profileId, user_id AS steamId, name, prisoner_id AS prisonerId, money_balance AS walletBalance, fame_points AS famePoints, last_login_time AS lastLogin, last_logout_time AS lastLogout FROM user_profile WHERE user_id = ? LIMIT 1`, [steamId]);
    return rows[0] || null;
  }

  getPlayerByName(name: string): any {
    const rows = this.query(`SELECT id AS profileId, user_id AS steamId, name, prisoner_id AS prisonerId, money_balance AS walletBalance, fame_points AS famePoints, last_login_time AS lastLogin, last_logout_time AS lastLogout FROM user_profile WHERE lower(name) = lower(?) LIMIT 1`, [name]);
    return rows[0] || null;
  }

  getWallet(steamId: string): any {
    console.log('[SCUMdb] Querying wallet for SteamID:', steamId);
    const sql = `SELECT up.id AS profileId, up.user_id AS steamId, up.name AS name, up.money_balance AS walletBalance, up.fame_points AS famePoints, COALESCE((SELECT MAX(c.account_balance) FROM bank_account_registry r JOIN bank_account_registry_currencies c ON c.bank_account_id = r.id WHERE (r.user_profile_id = up.id OR r.account_owner_user_profile_id = up.id) AND c.currency_type = 1), up.money_balance, 0) AS normalBalance, COALESCE((SELECT MAX(c.account_balance) FROM bank_account_registry r JOIN bank_account_registry_currencies c ON c.bank_account_id = r.id WHERE (r.user_profile_id = up.id OR r.account_owner_user_profile_id = up.id) AND c.currency_type = 2), 0) AS goldBalance FROM user_profile up WHERE up.user_id = ? LIMIT 1`;
    console.log('[SCUMdb] Executing wallet query');
    const result = this.query(sql, [steamId])[0] || null;
    console.log('[SCUMdb] Wallet query result:', JSON.stringify(result, null, 2));
    
    // Also check bank accounts directly
    const bankAccounts = this.query(`SELECT r.id, r.user_profile_id, c.currency_type, c.account_balance FROM bank_account_registry r LEFT JOIN bank_account_registry_currencies c ON c.bank_account_id = r.id WHERE r.user_profile_id IN (SELECT id FROM user_profile WHERE user_id = ?)`, [steamId]);
    console.log('[SCUMdb] Bank accounts found:', JSON.stringify(bankAccounts, null, 2));
    
    return result;
  }

  getAttributes(steamId: string): any {
    const rows = this.query(`SELECT p.id AS prisonerId, up.user_id AS steamId, up.name AS playerName, hex(p.body_simulation) AS bodyHex, up.prisoner_id AS prisonerId2 FROM user_profile up JOIN prisoner p ON p.id = up.prisoner_id WHERE up.user_id = ? LIMIT 1`, [steamId]);
    if (!rows[0]) return null;
    return this.parseAttributes(rows[0]);
  }

  private parseAttributes(row: any): any {
    const hex = row.bodyHex || '';
    if (hex.length < 200) return { error: 'body_simulation too short', hex };
    const attrs: any = { prisonerId: row.prisonerId, steamId: row.steamId, playerName: row.playerName };
    const buf = Buffer.from(hex, 'hex');
    attrs.strength = buf.readFloatLE(116) || 0;
    attrs.constitution = buf.readFloatLE(120) || 0;
    attrs.dexterity = buf.readFloatLE(124) || 0;
    attrs.intelligence = buf.readFloatLE(128) || 0;
    attrs.weight = buf.readFloatLE(144) || 0;
    attrs.height = buf.readFloatLE(148) || 0;
    attrs.age = buf.readInt32LE(152) || 0;
    return attrs;
  }

  getSkills(steamId: string): any[] {
    return this.query(`SELECT up.user_id AS steamId, up.name AS playerName, ps.name AS skillName, ps.level AS skillLevel, ps.experience AS skillExperience FROM user_profile up JOIN prisoner_skill ps ON ps.prisoner_id = up.prisoner_id WHERE up.user_id = ? ORDER BY ps.name`, [steamId]);
  }

  getInventory(steamId: string): any[] {
    return this.query(`WITH RECURSIVE latest_prisoner_entity AS (SELECT prisoner_id, MAX(entity_id) AS entity_id FROM prisoner_entity GROUP BY prisoner_id), player_roots AS (SELECT up.user_id AS steam_id, up.name AS player_name, pe.entity_id AS player_entity_id, ec.id AS inventory_component_id FROM user_profile up JOIN latest_prisoner_entity lpe ON lpe.prisoner_id = up.prisoner_id JOIN prisoner_entity pe ON pe.prisoner_id = lpe.prisoner_id AND pe.entity_id = lpe.entity_id JOIN entity_component ec ON ec.entity_id = pe.entity_id WHERE up.user_id = ? AND ec.name = 'Inventory'), inventory_tree AS (SELECT pr.steam_id, pr.player_name, pr.player_entity_id, pr.player_entity_id AS container_entity_id, eice.entity_id, 0 AS depth, eice.data AS slot, printf('%08d:%08d', eice.data, eice.entity_id) AS path FROM player_roots pr JOIN entity_inventory_component_entry eice ON eice.entity_component_id = pr.inventory_component_id UNION ALL SELECT it.steam_id, it.player_name, it.player_entity_id, it.entity_id AS container_entity_id, child.entity_id, it.depth + 1, child.data AS slot, it.path || '>' || printf('%08d:%08d', child.data, child.entity_id) AS path FROM inventory_tree it JOIN entity_component ec ON ec.entity_id = it.entity_id AND ec.name = 'Inventory' JOIN entity_inventory_component_entry child ON child.entity_component_id = ec.id WHERE it.depth < 6) SELECT it.steam_id AS steamId, it.player_name AS playerName, it.player_entity_id AS playerEntityId, it.container_entity_id AS containerEntityId, it.entity_id AS entityId, it.depth AS depth, it.slot AS slot, it.path AS path, COALESCE(e.class, '') AS itemClass, CASE WHEN COALESCE(e.class, '') LIKE '%.%' THEN replace(substr(COALESCE(e.class, ''), instr(COALESCE(e.class, ''), '.') + 1), '_C', '') ELSE replace(COALESCE(e.class, ''), '_C', '') END AS itemId, CASE WHEN it.depth = 0 AND it.slot = 2 THEN 'hands' WHEN it.depth = 0 AND it.slot = 5 THEN 'equipped' WHEN it.depth = 0 THEN 'root' ELSE 'container' END AS slotKind, CASE WHEN EXISTS (SELECT 1 FROM entity_component c WHERE c.entity_id = it.entity_id AND c.name = 'Inventory') THEN 1 ELSE 0 END AS hasInventory FROM inventory_tree it JOIN entity e ON e.id = it.entity_id ORDER BY it.steam_id, it.path`, [steamId]);
  }

  getQuickSlots(steamId: string): any[] {
    return this.query(`WITH latest_prisoner_entity AS (SELECT prisoner_id, MAX(entity_id) AS entity_id FROM prisoner_entity GROUP BY prisoner_id) SELECT up.user_id AS steamId, q.slot_index AS slotIndex, COALESCE(e.class, q.item_entity_setup, '') AS itemClass, CASE WHEN COALESCE(e.class, '') LIKE '%.%' THEN replace(substr(COALESCE(e.class, ''), instr(COALESCE(e.class, ''), '.') + 1), '_C', '') ELSE replace(COALESCE(e.class, ''), '_C', '') END AS itemId FROM user_profile up JOIN latest_prisoner_entity lpe ON lpe.prisoner_id = up.prisoner_id JOIN prisoner_inventory_quick_access_slot q ON q.prisoner_entity_id = lpe.entity_id LEFT JOIN entity e ON e.id = q.item_entity_id WHERE up.user_id = ? ORDER BY q.slot_index`, [steamId]);
  }

  getSquads(): any[] {
    return this.query(`SELECT s.id AS squadId, s.name AS squadName, s.message AS message, s.information AS information, s.score AS score, s.member_limit AS memberLimit, s.last_member_login_time AS lastMemberLogin, s.last_member_logout_time AS lastMemberLogout, m.id AS memberId, m.rank AS memberRank, m.unique_net_id AS memberSteamId, up.name AS memberName, up.fame_points AS famePoints, up.money_balance AS moneyBalance FROM squad s LEFT JOIN squad_member m ON m.squad_id = s.id LEFT JOIN user_profile up ON up.id = m.user_profile_id ORDER BY s.score DESC, s.id, m.rank DESC`);
  }

  getVehicles(): any[] {
    return this.query(`SELECT vehicle_entity_id AS entityId, replace(vehicle_asset_id, 'Vehicle:', '') AS asset, vehicle_asset_id AS assetId, vehicle_alias AS alias, datetime(vehicle_last_access_time, 'unixepoch') AS lastAccess, is_vehicle_automatically_created AS automatic, is_vehicle_functional AS functional, time_spent_in_forbidden_zone AS forbiddenZoneSeconds FROM vehicle_spawner ORDER BY vehicle_entity_id DESC`);
  }

  getFlags(): any[] {
    return this.query(`SELECT f.element_id AS elementId, b.id AS baseId, b.name AS baseName, b.location_x AS x, b.location_y AS y, up.name AS ownerName, up.user_id AS ownerSteamId, f.overtake_end_time AS overtakeEndTime, f.overtaker_user_profile_id AS overtakerProfileId FROM base_element_flag f LEFT JOIN base_element e ON e.element_id = f.element_id LEFT JOIN base b ON b.id = e.base_id LEFT JOIN user_profile up ON up.id = COALESCE(b.owner_user_profile_id, b.user_profile_id, e.owner_profile_id) ORDER BY f.element_id DESC`);
  }

  getBankAccounts(): any[] {
    return this.query(`SELECT r.id AS accountId, r.user_profile_id AS profileId, up.name AS ownerName, up.user_id AS ownerSteamId, r.bank_account_number AS accountNumber, r.save_timestamp AS saveTimestamp, c.currency_type AS currencyType, c.account_balance AS accountBalance FROM bank_account_registry r LEFT JOIN bank_account_registry_currencies c ON c.bank_account_id = r.id LEFT JOIN user_profile up ON up.id = r.user_profile_id ORDER BY c.account_balance DESC, r.id LIMIT 300`);
  }

  getEconomyLeaderboard(limit = 50): any[] {
    return this.query(`SELECT id AS profileId, name, user_id AS steamId, fame_points AS famePoints, money_balance AS walletBalance, last_login_time AS lastLogin FROM user_profile ORDER BY money_balance DESC, fame_points DESC LIMIT ?`, [limit]);
  }

  getInventoryWithDetails(steamId: string): any[] {
    const items = this.getInventory(steamId);
    if (!items.length) return items;
    const entityIds = items.map(i => i.entityId);
    if (!entityIds.length) return items;
    const comps = this.query(`SELECT ec.entity_id AS entityId, ec.name AS compName, hex(ec.data) AS dataHex, length(ec.data) AS dataLen FROM entity_component ec WHERE ec.entity_id IN (${entityIds.join(',')}) ORDER BY ec.entity_id, ec.name`);
    const compMap: any = {};
    for (const c of comps) {
      if (!compMap[c.entityId]) compMap[c.entityId] = [];
      compMap[c.entityId].push(c);
    }
    for (const item of items) {
      const comps = compMap[item.entityId] || [];
      item.components = comps.map((c: any) => {
        const buf = c.dataHex ? Buffer.from(c.dataHex, 'hex') : null;
        let val = null;
        if (buf && c.dataLen >= 4) {
          if (c.compName === 'Count' || c.compName === 'AmmunitionSlot') val = buf.readInt32LE(0);
          else if (c.compName === 'Durability' || c.compName === 'Weight' || c.compName === 'MaxDurability') val = parseFloat(buf.readFloatLE(0).toFixed(2));
        }
        return { name: c.compName, value: val, raw: c.dataHex };
      });
    }
    return items;
  }

  updateWallet(steamId: string, walletBalance: number, goldBalance?: number): { ok: boolean; error?: string } {
    const profile = this.getPlayerBySteamId(steamId);
    if (!profile) return { ok: false, error: 'Player not found' };
    if (!this.run('UPDATE user_profile SET money_balance = ? WHERE user_id = ?', [walletBalance, steamId])) return { ok: false, error: 'Failed to update wallet' };
    if (goldBalance !== undefined) {
      const bankRows = this.query(`SELECT c.id AS currencyId FROM bank_account_registry r JOIN bank_account_registry_currencies c ON c.bank_account_id = r.id WHERE (r.user_profile_id = ? OR r.account_owner_user_profile_id = ?) AND c.currency_type = 2 LIMIT 1`, [profile.profileId, profile.profileId]);
      if (bankRows[0]) this.run('UPDATE bank_account_registry_currencies SET account_balance = ? WHERE id = ?', [goldBalance, bankRows[0].currencyId]);
    }
    this.save();
    return { ok: true };
  }

  updateFame(steamId: string, famePoints: number): { ok: boolean; error?: string } {
    if (!this.run('UPDATE user_profile SET fame_points = ? WHERE user_id = ?', [famePoints, steamId])) return { ok: false, error: 'Failed to update fame' };
    this.save();
    return { ok: true };
  }

  updateSkill(steamId: string, skillName: string, level: number, experience?: number): { ok: boolean; error?: string } {
    if (experience !== undefined) {
      if (!this.run('UPDATE prisoner_skill SET level = ?, experience = ? WHERE prisoner_id = (SELECT prisoner_id FROM user_profile WHERE user_id = ?) AND name = ?', [level, experience, steamId, skillName])) return { ok: false, error: 'Skill not found' };
    } else {
      if (!this.run('UPDATE prisoner_skill SET level = ? WHERE prisoner_id = (SELECT prisoner_id FROM user_profile WHERE user_id = ?) AND name = ?', [level, steamId, skillName])) return { ok: false, error: 'Skill not found' };
    }
    this.save();
    return { ok: true };
  }

  updateAttributes(steamId: string, attrs: Record<string, number>): { ok: boolean; error?: string } {
    const rows = this.query(`SELECT hex(p.body_simulation) AS bodyHex FROM user_profile up JOIN prisoner p ON p.id = up.prisoner_id WHERE up.user_id = ? LIMIT 1`, [steamId]);
    if (!rows[0]) return { ok: false, error: 'Player not found' };
    const hex = rows[0].bodyHex || '';
    if (hex.length < 200) return { ok: false, error: 'body_simulation too short' };
    const buf = Buffer.from(hex, 'hex');
    const off: any = { strength: 116, constitution: 120, dexterity: 124, intelligence: 128 };
    for (const [key, val] of Object.entries(attrs)) { if (val !== undefined && off[key]) buf.writeFloatLE(val, off[key]); }
    if (!this.run('UPDATE prisoner SET body_simulation = ? WHERE id = (SELECT prisoner_id FROM user_profile WHERE user_id = ?)', [buf, steamId])) return { ok: false, error: 'Failed to update attributes' };
    this.save();
    return { ok: true };
  }
}
