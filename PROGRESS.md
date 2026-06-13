# SCUM Server Manager — Progress

## Project Goal
Electron-based SCUM dedicated server manager with web panel for RCON administration.

## Stack
- **Main**: Node.js/Electron + TypeScript, compiles to `dist/main/`
- **Renderer**: React + MUI + Vite, bundles to `dist/renderer/`
- **Web panel**: Vanilla HTML/CSS/JS single file (`webPanelUnified.html`), served on port 8080
- **Config**: `electron-store` → `%APPDATA%/scum-server-manager/config.json`
- **DB**: SQLite via `sql.js` (WASM)
- **RCON**: Source RCON protocol via `srcds-rcon`

---

## Current Features

### Server Management
- Start/stop/restart SCUM server
- SteamCMD auto-install & update
- File manager (read/write server configs)
- Backup/restore system
- Scheduler (restart + sentry robots)

### RCON
- Source RCON protocol client with auto-reconnect (5s interval)
- Web panel shares main app's RCON connection (no separate auth)
- Auto-connect on startup from saved config
- Player list + player details (balance, fame, inventory, skills, attributes)
- Player actions (god mode, silence, knock, notify, give items/vehicles, set skills/attributes, give money/gold)
- Console output via SSE streaming
- Dashboard RCON status indicator

### Chat Commands (`src/main/logWatcher.ts`)
Players type in-game chat, server responds via `SendChat 4`:

| Command | Aliases | Description |
|---------|---------|-------------|
| `!help` | `!помощь` | Show available commands |
| `!balance` | `!баланс` | Show account + gold balance |
| `!location` | `!локация`, `!координаты` | Show player XYZ coordinates |
| `!online` | `!онлайн` | Show online player count + list |
| `!startpack` | `!стартпак` | Claim starter pack |
| `!dailypack` | `!дейлипак` | Claim daily pack |
| `!wargm` | — | Check WARGM purchases and deliver items |

### Loot Packs System
- Configured via web panel tab "📦 Наборы" (port 8080)
- Two pack types: Starter and Daily
- Per-pack enable/disable, add/remove items
- Configurable cooldown (hours) for both packs (0 = one-time)
- Cooldowns persisted to `logs/pack_cooldowns.json`
- Spawns items via `SpawnItem <name> <amount> Location <steamId>`

### WARGM — Store Integration
- API client for `https://api.wargm.ru/v1/` with `client=ID:KEY` auth
- Cards with 7 delivery rule types: items, vehicles, skills, attributes, money, gold, cargo drops
- CRUD for cards + export/import JSON
- `!wargm` command fetches `shop/operations?status=pending`, matches `offer_id` to cards, delivers via RCON, calls `operation_claim`
- Duplicate protection (purchase_id in SQLite)
- Rate-limiting (configurable cooldown per player)
- SQLite DB (`data/wargm.db`) with 4 tables
- Logging to `logs/wargm_api_*.log` and `logs/wargm_deliveries_*.log`
- Debug panel with raw API response viewer

### Web Panel Structure (`src/main/webPanelUnified.html`)

| Tab | Description |
|-----|-------------|
| 📊 Dashboard | Server status, RCON status, controls, console |
| 💻 RCON Console | Raw command input, history, quick buttons |
| 👥 Игроки | Online player table, modal with actions |
| 📦 Наборы | Pack config cards (starter + daily) |
| 🛒 WARGM | API settings, cards CRUD with multi-rule editor |

### Web Panel API Endpoints (`src/main/webPanel.ts`)

| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/packs` | Get/save pack configuration |
| POST | `/api/packs/give` | Manually give a pack to SteamID |
| GET/POST | `/api/wargm/settings` | WARGM API settings |
| GET/POST | `/api/wargm/cards` | List/save cards |
| DELETE | `/api/wargm/cards/:id` | Delete card |
| POST | `/api/wargm/cards/:id/duplicate` | Duplicate card |
| POST | `/api/wargm/test` | Test API connection |
| POST | `/api/wargm/check/:steamId` | Check and deliver purchases |
| GET | `/api/wargm/export` | Export cards as JSON |
| POST | `/api/wargm/import` | Import cards from JSON |
| GET | `/api/wargm/deliveries/:steamId` | Get delivery history |
| POST | `/api/wargm/debug/operations` | Raw API response for debugging |

---

## File Map

| File | Purpose |
|------|---------|
| `src/main/index.ts` | Electron main process, store, IPC handlers |
| `src/main/webPanel.ts` | HTTP server, API endpoints, RCON polling |
| `src/main/webPanelUnified.html` | Web panel frontend (all-in-one) |
| `src/main/logWatcher.ts` | File watcher, chat log parser, command processor |
| `src/main/rconClient.ts` | Source RCON socket client with auto-reconnect |
| `src/main/wargmManager.ts` | WARGM API client, SQLite DB, delivery logic |
| `src/main/types.ts` | TypeScript interfaces |
| `src/main/discordWebhook.ts` | Discord webhook notifications |
| `src/renderer/App.tsx` | Electron renderer navigation + routes |
| `dist/main/webPanelUnified.html` | Web panel served from dist |
| `data/wargm.db` | SQLite database (settings, cards, deliveries) |
| `logs/pack_cooldowns.json` | Pack cooldown storage |
| `logs/wargm_api_*.log` | WARGM API request logs |
| `logs/wargm_deliveries_*.log` | WARGM delivery logs |
| `start.bat` | Build + run |
| `start-run.bat` | Run only (after build) |

---

## Key Dependencies
- [herbie96x/SCUM-RCON](https://github.com/herbie96x/SCUM-RCON) — RCON mod for SCUM server
- `srcds-rcon` — Source RCON protocol client
- `sql.js` — SQLite WASM for WARGM DB
- `electron-store` — persistent config
- `chokidar` — file watching
- `fs-extra` — enhanced file operations

---

## Build & Run

```bash
npm run build          # full build (main + renderer + assets)
npx electron dist/main/index.js   # run
# or use start-run.bat
```

Web panel: `http://localhost:8080` (enable in Settings → Web Panel)
