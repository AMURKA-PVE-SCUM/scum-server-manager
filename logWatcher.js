"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogWatcher = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const chokidar_1 = require("chokidar");
class LogWatcher {
    events = [];
    watchers = [];
    discord;
    serverPath;
    offsets = new Map();
    scumLogOffset = 0;
    lastPlayerCount = 0;
    rconClient = null;
    pollTimer = null;
    packsConfig = {
        starter: { enabled: true, items: [], cooldownHours: 0 },
        daily: { enabled: true, items: [], cooldownHours: 24 },
    };
    cooldowns = {};
    teleportLocations = [];
    vipConfig = {
        enabled: true, players: [],
        starterBonus: { items: [], money: 0, gold: 0, fame: 0 },
        dailyBonus: { items: [], money: 0, gold: 0, fame: 0 },
    };
    wargmManager = null;
    cooldownPath = '';
    saveHomeConfig = { enabled: true, maxLocations: 1, vipMaxLocations: 3, teleportPrice: 0 };
    homeLocations = {};
    homeDataPath = '';
    chatCommands = [
        { trigger: '!balance', rconCommand: 'ListPlayers', description: 'Check your balance', hideFromHelp: true },
        { trigger: '!location', rconCommand: 'ListPlayers', description: 'Show your location', hideFromHelp: true },
        { trigger: '!online', rconCommand: 'ListPlayers', description: 'Show online players', hideFromHelp: true },
        { trigger: '!startpack', rconCommand: '', description: '', helpTrigger: '!стартпак' },
        { trigger: '!dailypack', rconCommand: '', description: '', helpTrigger: '!дейлипак' },
        { trigger: '!wargm', rconCommand: '', description: '', helpTrigger: '!варгм' },
        { trigger: '!teleport', rconCommand: '', description: '', helpTrigger: '!телепорт' },
        { trigger: '!vip', rconCommand: '', description: '', helpTrigger: '!вип' },
        { trigger: '!nameplates', rconCommand: '', description: '', helpTrigger: '!ники' },
        { trigger: '!savedom', rconCommand: '', description: '', helpTrigger: '!сохранитьдом' },
        { trigger: '!home', rconCommand: '', description: '', helpTrigger: '!дом' },
        { trigger: '!homes', rconCommand: '', description: '', helpTrigger: '!дома' },
        { trigger: '!help', rconCommand: '', description: '', isHelp: true },
    ];
    commandAliases = {
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
        '!ники': '!nameplates',
        '!сохранитьдом': '!savedom',
        '!дом': '!home',
        '!дома': '!homes',
    };
    constructor(serverPath, discord) {
        this.serverPath = serverPath;
        this.discord = discord;
        this.cooldownPath = path_1.default.join(process.cwd(), 'logs', 'pack_cooldowns.json');
        fs_extra_1.default.ensureDirSync(path_1.default.dirname(this.cooldownPath));
        this.loadCooldowns();
        this.homeDataPath = path_1.default.join(process.cwd(), 'data', 'home_locations.json');
        fs_extra_1.default.ensureDirSync(path_1.default.dirname(this.homeDataPath));
        this.loadHomeLocations();
        if (serverPath)
            this.startWatching();
    }
    setPacksConfig(cfg) {
        this.packsConfig = cfg;
    }
    setTeleportLocations(locations) {
        this.teleportLocations = locations;
    }
    setVipConfig(cfg) {
        this.vipConfig = cfg;
    }
    setSaveHomeConfig(cfg) {
        this.saveHomeConfig = cfg;
    }
    loadHomeLocations() {
        try {
            if (fs_extra_1.default.existsSync(this.homeDataPath)) {
                this.homeLocations = JSON.parse(fs_extra_1.default.readFileSync(this.homeDataPath, 'utf-8'));
            }
        }
        catch { }
    }
    saveHomeLocations() {
        try {
            fs_extra_1.default.writeFileSync(this.homeDataPath, JSON.stringify(this.homeLocations, null, 2));
        }
        catch { }
    }
    isVip(steamId) {
        if (!this.vipConfig.enabled)
            return false;
        const p = this.vipConfig.players.find(x => x.steamId === steamId);
        if (!p)
            return false;
        if (p.expiresAt > 0 && Date.now() > p.expiresAt)
            return false;
        return true;
    }
    setWargmManager(mgr) {
        this.wargmManager = mgr;
    }
    loadCooldowns() {
        try {
            if (fs_extra_1.default.existsSync(this.cooldownPath)) {
                this.cooldowns = JSON.parse(fs_extra_1.default.readFileSync(this.cooldownPath, 'utf-8'));
            }
        }
        catch { }
    }
    saveCooldowns() {
        try {
            fs_extra_1.default.writeFileSync(this.cooldownPath, JSON.stringify(this.cooldowns, null, 2));
        }
        catch { }
    }
    getCooldowns() {
        return { ...this.cooldowns };
    }
    resetPlayerCooldown(steamId, packType) {
        if (packType) {
            const key = packType === 'starter' ? `!startpack_${steamId}` : `!dailypack_${steamId}`;
            delete this.cooldowns[key];
        }
        else {
            delete this.cooldowns[`!startpack_${steamId}`];
            delete this.cooldowns[`!dailypack_${steamId}`];
        }
        this.saveCooldowns();
    }
    setRconClient(client) {
        this.rconClient = client;
    }
    addChatCommand(trigger, rconCommand, description, requiresArgs = false) {
        this.chatCommands.push({ trigger, rconCommand, requiresArgs, description });
    }
    async processChatCommand(steamId, playerName, message) {
        if (!this.rconClient || !this.rconClient.isConnected()) {
            console.log('[LogWatcher] RCON not connected, skipping command');
            return;
        }
        const trimmed = message.trim();
        console.log('[LogWatcher] processChatCommand:', { steamId, playerName, trimmed, rconConnected: this.rconClient.isConnected() });
        if (!trimmed.startsWith('!'))
            return;
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
            }
            else if (pack.cooldownHours < 0) {
                const key = `${cmdKey}_${steamId}`;
                if (this.cooldowns[key]) {
                    const name = isDaily ? 'Ежедневный' : 'Стартовый';
                    await this.rconClient.sendCommand(`SendChat 4 "${name} набор уже получен" ${steamId}`);
                    return;
                }
            }
            const succeeded = [];
            const failed = [];
            for (const item of pack.items) {
                const r = await this.rconClient.sendCommand(`SpawnItem ${item.itemId} ${item.amount} Location ${steamId}`);
                if (r.success)
                    succeeded.push(`${item.itemId}x${item.amount}`);
                else
                    failed.push(`${item.itemId}x${item.amount}`);
            }
            // VIP bonuses
            if (this.isVip(steamId)) {
                const bonus = isDaily ? this.vipConfig.dailyBonus : this.vipConfig.starterBonus;
                for (const item of bonus.items) {
                    const r = await this.rconClient.sendCommand(`SpawnItem ${item.itemId} ${item.amount} Location ${steamId}`);
                    if (r.success)
                        succeeded.push(`${item.itemId}x${item.amount} (VIP)`);
                }
                const needsBalance = bonus.money > 0 || bonus.gold > 0 || bonus.fame > 0;
                if (needsBalance) {
                    const balR = await this.rconClient.sendCommand('ListPlayers');
                    let norm = 0, gold = 0, fame = 0;
                    if (balR.success && balR.response) {
                        const lines = balR.response.split('\n');
                        let inSection = false;
                        for (const line of lines) {
                            const t = line.trim();
                            if (t.match(/^\d+\.\s+\S/))
                                inSection = false;
                            if (t.includes(steamId)) {
                                inSection = true;
                                continue;
                            }
                            if (inSection) {
                                const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
                                if (bm)
                                    norm = parseFloat(bm[1]);
                                const gm = t.match(/^Gold balance:\s*([\d.+-]+)/);
                                if (gm)
                                    gold = parseFloat(gm[1]);
                                const fm = t.match(/^Fame:\s*([\d.+-]+)/);
                                if (fm)
                                    fame = parseFloat(fm[1]);
                            }
                        }
                    }
                    if (bonus.money > 0) {
                        await this.rconClient.sendCommand(`#SetCurrencyBalance Normal ${Math.round(norm + bonus.money)} ${steamId}`);
                        succeeded.push(`Деньги +${bonus.money} (VIP)`);
                    }
                    if (bonus.gold > 0) {
                        await this.rconClient.sendCommand(`#SetCurrencyBalance Gold ${Math.round(gold + bonus.gold)} ${steamId}`);
                        succeeded.push(`Золото +${bonus.gold} (VIP)`);
                    }
                    if (bonus.fame > 0) {
                        await this.rconClient.sendCommand(`#SetFamePoints ${Math.round(fame + bonus.fame)} ${steamId}`);
                        succeeded.push(`Слава +${bonus.fame} (VIP)`);
                    }
                }
            }
            this.cooldowns[`${cmdKey}_${steamId}`] = Date.now();
            this.saveCooldowns();
            const reply = succeeded.length > 0 ? `Получено: ${succeeded.join(', ')}` : 'Не удалось выдать предметы';
            await this.rconClient.sendCommand(`SendChat 4 "${reply}" ${steamId}`);
            return;
        }
        // Nameplates command
        if (cmdKey === '!nameplates') {
            await this.rconClient.sendCommand(`ShowNamePlates true ${steamId}`);
            await this.rconClient.sendCommand(`SendChat 4 "Ники игроков включены" ${steamId}`);
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
                const list = this.teleportLocations.map((loc, i) => `${i + 1}. ${loc.name} ($${loc.price})`).join(', ');
                await this.rconClient.sendCommand(`SendChat 4 "Список мест телепорта: ${list}" ${steamId}`);
                await this.rconClient.sendCommand(`SendChat 4 "Для телепорта укажите команду !телепорт с нужным номером локации" ${steamId}`);
                return;
            }
            const loc = this.teleportLocations[idx - 1];
            if (loc.price > 0) {
                const balRes = await this.rconClient.sendCommand('ListPlayers');
                let balance = 0;
                if (balRes.success && balRes.response) {
                    const balLines = balRes.response.split('\n');
                    let inSection = false;
                    for (const line of balLines) {
                        const t = line.trim();
                        if (t.match(/^\d+\.\s+\S/))
                            inSection = false;
                        if (t.includes(steamId)) {
                            inSection = true;
                            continue;
                        }
                        if (inSection) {
                            const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
                            if (bm)
                                balance = parseFloat(bm[1]);
                        }
                    }
                }
                if (balance < loc.price) {
                    await this.rconClient.sendCommand(`SendChat 4 "Недостаточно средств: нужно $${loc.price}, у вас $${Math.round(balance)}" ${steamId}`);
                    return;
                }
            }
            await this.rconClient.sendCommand(`SendChat 4 "⏳ Не двигайтесь! Телепорт в ${loc.name} через 15 секунд..." ${steamId}`);
            await new Promise(resolve => setTimeout(resolve, 15000));
            if (loc.price > 0) {
                const balRes2 = await this.rconClient.sendCommand('ListPlayers');
                let balance2 = 0;
                if (balRes2.success && balRes2.response) {
                    const balLines = balRes2.response.split('\n');
                    let inSection = false;
                    for (const line of balLines) {
                        const t = line.trim();
                        if (t.match(/^\d+\.\s+\S/))
                            inSection = false;
                        if (t.includes(steamId)) {
                            inSection = true;
                            continue;
                        }
                        if (inSection) {
                            const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
                            if (bm)
                                balance2 = parseFloat(bm[1]);
                        }
                    }
                }
                if (balance2 < loc.price) {
                    await this.rconClient.sendCommand(`SendChat 4 "Недостаточно средств: нужно $${loc.price}, у вас $${Math.round(balance2)}" ${steamId}`);
                    return;
                }
                const newBalance = Math.round(balance2 - loc.price);
                await this.rconClient.sendCommand(`#SetCurrencyBalance Normal ${newBalance} ${steamId}`);
            }
            const cmd = `Teleport ${Math.round(loc.x)} ${Math.round(loc.y)} ${Math.round(loc.z)} ${steamId}`;
            const r = await this.rconClient.sendCommand(cmd);
            if (r.success) {
                await this.rconClient.sendCommand(`SendChat 4 "✅ Телепортация в ${loc.name} выполнена" ${steamId}`);
            }
            else {
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
            }
            else {
                msg += ' Бессрочно';
            }
            if (p.note)
                msg += ` (${p.note})`;
            await this.rconClient.sendCommand(`SendChat 4 "${msg}" ${steamId}`);
            return;
        }
        // Save Home commands
        if (cmdKey === '!savedom') {
            if (!this.saveHomeConfig.enabled) {
                await this.rconClient.sendCommand(`SendChat 4 "Сохранение дома отключено" ${steamId}`);
                return;
            }
            if (!this.homeLocations[steamId])
                this.homeLocations[steamId] = [];
            const maxLocs = this.isVip(steamId) ? this.saveHomeConfig.vipMaxLocations : this.saveHomeConfig.maxLocations;
            if (this.homeLocations[steamId].length >= maxLocs) {
                await this.rconClient.sendCommand(`SendChat 4 "Достигнут лимит сохранений (${maxLocs}). Используйте !дома для просмотра" ${steamId}`);
                return;
            }
            const balRes = await this.rconClient.sendCommand('ListPlayers');
            if (!balRes.success || !balRes.response) {
                await this.rconClient.sendCommand(`SendChat 4 "Не удалось получить данные о локации" ${steamId}`);
                return;
            }
            const lines = balRes.response.split('\n');
            let inSection = false;
            let locX = 0, locY = 0, locZ = 0;
            for (const line of lines) {
                const t = line.trim();
                if (t.match(/^\d+\.\s+\S/))
                    inSection = false;
                if (t.includes(steamId)) {
                    inSection = true;
                    continue;
                }
                if (inSection) {
                    const lm = t.match(/^Location:\s*X=([\d.+-]+)\s+Y=([\d.+-]+)\s+Z=([\d.+-]+)/);
                    if (lm) {
                        locX = parseFloat(lm[1]);
                        locY = parseFloat(lm[2]);
                        locZ = parseFloat(lm[3]);
                    }
                }
            }
            if (locX === 0 && locY === 0 && locZ === 0) {
                await this.rconClient.sendCommand(`SendChat 4 "Не удалось определить вашу локацию" ${steamId}`);
                return;
            }
            const homeName = trimmedParts.length > 1 ? trimmed.slice(trimmedParts[0].length).trim() : `Дом ${this.homeLocations[steamId].length + 1}`;
            this.homeLocations[steamId].push({ name: homeName, x: locX, y: locY, z: locZ });
            this.saveHomeLocations();
            await this.rconClient.sendCommand(`SendChat 4 "✅ Локация сохранена: ${homeName} (X=${Math.round(locX)} Y=${Math.round(locY)} Z=${Math.round(locZ)})" ${steamId}`);
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
            await this.rconClient.sendCommand(`SendChat 4 "Ваши сохранения: ${list}. Телепорт: !дом N" ${steamId}`);
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
            if (this.saveHomeConfig.teleportPrice > 0) {
                const balRes = await this.rconClient.sendCommand('ListPlayers');
                let balance = 0;
                if (balRes.success && balRes.response) {
                    const balLines = balRes.response.split('\n');
                    let inSection = false;
                    for (const line of balLines) {
                        const t = line.trim();
                        if (t.match(/^\d+\.\s+\S/))
                            inSection = false;
                        if (t.includes(steamId)) {
                            inSection = true;
                            continue;
                        }
                        if (inSection) {
                            const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
                            if (bm)
                                balance = parseFloat(bm[1]);
                        }
                    }
                }
                const price = this.saveHomeConfig.teleportPrice;
                if (balance < price) {
                    await this.rconClient.sendCommand(`SendChat 4 "Недостаточно средств: нужно $${price}, у вас $${Math.round(balance)}" ${steamId}`);
                    return;
                }
                await this.rconClient.sendCommand(`SendChat 4 "⏳ Телепорт домой (${home.name}) через 15 секунд..." ${steamId}`);
                await new Promise(resolve => setTimeout(resolve, 15000));
                const balRes2 = await this.rconClient.sendCommand('ListPlayers');
                let balance2 = 0;
                if (balRes2.success && balRes2.response) {
                    const balLines = balRes2.response.split('\n');
                    let inSection = false;
                    for (const line of balLines) {
                        const t = line.trim();
                        if (t.match(/^\d+\.\s+\S/))
                            inSection = false;
                        if (t.includes(steamId)) {
                            inSection = true;
                            continue;
                        }
                        if (inSection) {
                            const bm = t.match(/^Account balance:\s*([\d.+-]+)/);
                            if (bm)
                                balance2 = parseFloat(bm[1]);
                        }
                    }
                }
                if (balance2 < price) {
                    await this.rconClient.sendCommand(`SendChat 4 "Недостаточно средств: нужно $${price}, у вас $${Math.round(balance2)}" ${steamId}`);
                    return;
                }
                const newBalance = Math.round(balance2 - price);
                await this.rconClient.sendCommand(`#SetCurrencyBalance Normal ${newBalance} ${steamId}`);
            }
            else {
                await this.rconClient.sendCommand(`SendChat 4 "⏳ Телепорт домой (${home.name})..." ${steamId}`);
            }
            const cmd = `Teleport ${Math.round(home.x)} ${Math.round(home.y)} ${Math.round(home.z)} ${steamId}`;
            const r = await this.rconClient.sendCommand(cmd);
            if (r.success) {
                await this.rconClient.sendCommand(`SendChat 4 "✅ Телепортация домой (${home.name}) выполнена" ${steamId}`);
            }
            else {
                await this.rconClient.sendCommand(`SendChat 4 "❌ Ошибка телепортации" ${steamId}`);
            }
            return;
        }
        // Check for commands
        for (const cmd of this.chatCommands) {
            if (cmdKey === cmd.trigger) {
                if (cmd.isHelp || !cmd.rconCommand)
                    continue;
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
                        const playerSection = this.extractPlayerSection(lines, steamId, playerName);
                        let reply = '';
                        if (cmdKey === '!balance') {
                            const bal = playerSection.find(l => l.toLowerCase().includes('account balance')) || 'N/A';
                            const gold = playerSection.find(l => l.toLowerCase().includes('gold balance')) || 'N/A';
                            reply = `${playerName}: ${bal} | ${gold}`;
                        }
                        else if (cmdKey === '!location') {
                            const loc = playerSection.find(l => l.toLowerCase().includes('location')) || 'N/A';
                            reply = `${playerName}: ${loc}`;
                        }
                        else if (cmdKey === '!online') {
                            const playerCount = lines.filter(l => /^\d+\.\s+\S/.test(l)).length;
                            const playerList = lines.filter(l => /^\d+\.\s+\S/.test(l)).join(', ');
                            reply = playerCount > 0 ? `Онлайн (${playerCount}): ${playerList}` : 'Нет игроков онлайн';
                        }
                        else {
                            reply = result.response.slice(0, 200);
                        }
                        if (reply.length > 300)
                            reply = reply.slice(0, 300) + '...';
                        await this.rconClient.sendCommand(`SendChat 4 "${reply}" ${steamId}`);
                    }
                }
                catch (e) {
                    console.error('[LogWatcher] Chat command error:', e);
                }
                return;
            }
        }
    }
    extractPlayerSection(lines, steamId, playerName) {
        const idx = lines.findIndex(l => l.includes(steamId) || l.includes(`. ${playerName}`));
        if (idx === -1)
            return lines;
        const section = [lines[idx]];
        for (let i = idx + 1; i < lines.length; i++) {
            if (/^\d+\.\s+\S/.test(lines[i]))
                break;
            section.push(lines[i]);
        }
        return section;
    }
    startWatching() {
        const logsPath = path_1.default.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
        console.log('[LogWatcher] Watching logs path:', logsPath);
        if (fs_extra_1.default.existsSync(logsPath)) {
            // Pre-populate offsets for all existing log files synchronously
            // so polling doesn't re-read old content before chokidar fires 'add'
            try {
                for (const f of fs_extra_1.default.readdirSync(logsPath)) {
                    if (f.endsWith('.log')) {
                        const fp = path_1.default.join(logsPath, f);
                        const stat = fs_extra_1.default.statSync(fp);
                        if (stat.size > 0)
                            this.offsets.set(fp, stat.size);
                    }
                }
                console.log('[LogWatcher] Pre-populated offsets for', this.offsets.size, 'log files');
            }
            catch { }
            const watcher = (0, chokidar_1.watch)(path_1.default.join(logsPath, '*.log'), {
                persistent: true, ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 300 },
            });
            watcher.on('add', (fp) => { console.log('[LogWatcher] File added:', fp); this.handleFileAdd(fp); });
            watcher.on('change', (fp) => { console.log('[LogWatcher] File changed:', fp); this.handleFileChange(fp); });
            this.watchers.push(watcher);
            console.log('[LogWatcher] Watcher started for:', logsPath);
        }
        else {
            console.log('[LogWatcher] Logs path does not exist:', logsPath);
        }
        console.log('[LogWatcher] Starting chat log poll every 2s');
        this.pollTimer = setInterval(() => this.pollChatLog(), 2000);
        const scumLog = path_1.default.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
        if (fs_extra_1.default.existsSync(scumLog)) {
            this.scumLogOffset = fs_extra_1.default.statSync(scumLog).size;
            const sw = (0, chokidar_1.watch)(scumLog, { persistent: true, ignoreInitial: false, awaitWriteFinish: { stabilityThreshold: 200 } });
            sw.on('change', () => this.handleScumLogChange());
            sw.on('add', () => this.handleScumLogChange());
            this.watchers.push(sw);
        }
    }
    handleFileAdd(filePath) {
        try {
            if (this.offsets.has(filePath))
                return;
            const stat = fs_extra_1.default.statSync(filePath);
            if (stat.size > 0)
                this.offsets.set(filePath, stat.size);
        }
        catch { }
    }
    async handleFileChange(filePath) {
        try {
            const lastOffset = this.offsets.get(filePath) || 0;
            const stat = await fs_extra_1.default.stat(filePath);
            if (stat.size <= lastOffset)
                return;
            await this.readFromOffset(filePath, lastOffset, stat.size);
        }
        catch { }
    }
    async readFromOffset(filePath, start, end) {
        const buf = Buffer.alloc(Math.min(end - start, 4));
        try {
            const fd = await fs_extra_1.default.promises.open(filePath, 'r');
            await fd.read(buf, 0, buf.length, start);
            await fd.close();
        }
        catch { }
        const isUtf16 = buf.length >= 2 && buf[1] === 0x00;
        const encoding = isUtf16 ? 'utf16le' : 'utf-8';
        const stream = fs_extra_1.default.createReadStream(filePath, { start, end: end - 1, encoding });
        let data = '';
        for await (const chunk of stream) {
            data += chunk;
        }
        this.offsets.set(filePath, end);
        const lines = data.split('\n').filter((l) => l.trim());
        for (const line of lines) {
            await this.processLine(filePath, line);
        }
    }
    async handleScumLogChange() {
        try {
            const logPath = path_1.default.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
            const stat = fs_extra_1.default.statSync(logPath);
            if (stat.size <= this.scumLogOffset)
                return;
            const readSize = Math.min(stat.size - this.scumLogOffset, 65536);
            const buf = Buffer.alloc(readSize);
            const fd = fs_extra_1.default.openSync(logPath, 'r');
            fs_extra_1.default.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
            fs_extra_1.default.closeSync(fd);
            const encoding = buf[1] === 0 ? 'utf16le' : 'utf-8';
            const text = buf.toString(encoding);
            this.scumLogOffset = stat.size;
            for (const line of text.split('\n').filter(Boolean)) {
                const pm = line.match(/HandlePossessedBy:\s*(\d+),\s*(\d+),\s*(\S+)/);
                if (pm) {
                    this.discord.sendLoginEvent(pm[3], '').catch(() => { });
                    this.addEvent('login', `${pm[3]} connected`);
                    continue;
                }
                const lm = line.match(/LogSCUM:.+'(\d+):([^(]+)\((\d+)\)'.+logged in/);
                if (lm) {
                    this.discord.sendLoginEvent(lm[2].trim(), '').catch(() => { });
                    this.addEvent('login', `${lm[2].trim()} connected`);
                    continue;
                }
                const llout = line.match(/LogSCUM:.+'(\d+):([^(]+)\(\d+\)'.+logged out/);
                if (llout) {
                    this.discord.sendLoginEvent(llout[2].trim(), '').catch(() => { });
                    this.addEvent('login', `${llout[2].trim()} disconnected`);
                    continue;
                }
                const plout = line.match(/Prisoner logging out:\s*([^(]+)\s*\(\d+\)/);
                if (plout) {
                    this.discord.sendLoginEvent(plout[1].trim(), '').catch(() => { });
                    this.addEvent('login', `${plout[1].trim()} disconnected`);
                    continue;
                }
                const gm = line.match(/Global Stats:.*?P:\s*(\d+)/);
                if (gm)
                    this.lastPlayerCount = parseInt(gm[1], 10);
            }
        }
        catch { }
    }
    addEvent(type, message) {
        this.events.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), type: type, message });
        if (this.events.length > 2000)
            this.events = this.events.slice(-1000);
    }
    async processLine(filePath, line) {
        const fileName = path_1.default.basename(filePath).toLowerCase();
        const event = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString(), type: 'system', message: line };
        if (fileName.startsWith('admin')) {
            event.type = 'admin';
            this.discord.sendAdminLog(line);
        }
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
                this.discord.sendChatMessage(playerName, message);
                await this.processChatCommand(steamId, playerName, message);
            }
            else {
                console.log('[LogWatcher] Chat regex did not match for line:', line);
            }
        }
        else if (fileName.startsWith('login')) {
            event.type = 'login';
            const m = line.match(/LoginComm: Login: (.+?)\((\d+)\)/);
            if (m)
                this.discord.sendLoginEvent(m[1].trim(), m[2]);
        }
        else if (fileName.includes('vehicle')) {
            event.type = 'vehicle';
            this.discord.sendVehicleEvent(line);
        }
        this.events.push(event);
        if (this.events.length > 2000)
            this.events = this.events.slice(-1000);
    }
    getEvents() {
        return [...this.events];
    }
    getEventsByType(type) {
        return this.events.filter((e) => e.type === type);
    }
    pollChatLog() {
        try {
            const logsPath = path_1.default.join(this.serverPath, 'SCUM', 'Saved', 'SaveFiles', 'Logs');
            if (!fs_extra_1.default.existsSync(logsPath))
                return;
            const files = fs_extra_1.default.readdirSync(logsPath).filter(f => f.toLowerCase().startsWith('chat') && f.endsWith('.log'));
            if (files.length === 0)
                return;
            const latest = files.map(f => ({ name: f, time: fs_extra_1.default.statSync(path_1.default.join(logsPath, f)).mtimeMs }))
                .sort((a, b) => b.time - a.time)[0].name;
            const fp = path_1.default.join(logsPath, latest);
            const stat = fs_extra_1.default.statSync(fp);
            const lastOffset = this.offsets.get(fp) || 0;
            if (stat.size > lastOffset) {
                console.log('[LogWatcher] Poll: detected new content in', latest);
                this.readFromOffset(fp, lastOffset, stat.size);
            }
        }
        catch { }
    }
    destroy() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.watchers.forEach((w) => w.close());
        this.watchers = [];
        this.offsets.clear();
        this.scumLogOffset = 0;
    }
}
exports.LogWatcher = LogWatcher;
