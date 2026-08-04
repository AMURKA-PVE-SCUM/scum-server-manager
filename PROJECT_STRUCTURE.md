# Project Structure

```
D:\SSM_RCON\
├── src/
│   ├── main/                          # Electron main process (Node.js backend)
│   │   ├── index.ts                   # App entry: Electron lifecycle, IPC handlers, service wiring
│   │   ├── types.ts                   # Shared TypeScript interfaces
│   │   ├── rconClient.ts              # Source RCON protocol client (TCP socket)
│   │   ├── webPanel.ts                # HTTP server (port 8080): API + frontend
│   │   ├── webPanelUnified.html       # Frontend UI (single-page, inline JS/CSS)
│   │   ├── logWatcher.ts              # Chat log file watcher + command processor
│   │   ├── wargmManager.ts            # WARGM shop integration (SQLite DB, API client)
│   │   ├── serverManager.ts           # SCUM server process manager
│   │   ├── steamCmd.ts                # SteamCMD wrapper for server updates
│   │   ├── backupManager.ts           # Backup/restore system
│   │   ├── discordWebhook.ts          # Discord webhook notifications
│   │   ├── fileManager.ts             # Server file management
│   │   ├── scumDatabase.ts            # SCUM.db reader (sql.js/WASM)
│   │   ├── ftpServer.ts               # FTP server for file access
│   │   ├── preload.ts                 # Electron preload (IPC bridge)
│   │   └── tsconfig.json
│   ├── renderer/                      # Electron renderer (React + MUI)
│   │   ├── App.tsx                    # React app with navigation/routing
│   │   ├── main.tsx                   # React entry point
│   │   ├── electron.d.ts             # IPC API type declarations
│   │   ├── contexts/
│   │   │   └── LanguageContext.tsx     # i18n context (RU/EN)
│   │   ├── pages/                     # Page components (~15 pages)
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ServerInstall.tsx
│   │   │   ├── RestartScheduler.tsx
│   │   │   ├── WebPanelPage.tsx
│   │   │   ├── ServerSettings.tsx
│   │   │   ├── GameSettings.tsx
│   │   │   ├── EconomySettings.tsx
│   │   │   ├── RaidSettings.tsx
│   │   │   ├── PlayersPage.tsx
│   │   │   ├── SquadsPage.tsx
│   │   │   ├── VehiclesPage.tsx
│   │   │   ├── LootEditor.tsx
│   │   │   ├── LogMonitor.tsx
│   │   │   ├── BackupManager.tsx
│   │   │   ├── DiscordSettings.tsx
│   │   │   ├── FTPSettings.tsx
│   │   │   ├── FileManager.tsx
│   │   │   └── AppSettings.tsx
│   │   ├── styles/
│   │   │   └── theme.ts               # MUI dark theme config
│   │   └── vite-env.d.ts
│   └── types/                         # Global type declarations
│       └── global.d.ts
├── dist/                              # Build output (gitignored)
│   ├── main/                          # Compiled main process JS
│   └── renderer/                      # Vite-bundled renderer
├── data/                              # Runtime data
│   └── wargm.db                       # WARGM SQLite database
├── logs/                              # Application logs
│   ├── rcon_commands.log              # RCON command history
│   ├── pack_cooldowns.json            # Player pack cooldowns
│   ├── wargm_api_YYYY-MM-DD.log       # WARGM API calls
│   └── wargm_deliveries_YYYY-MM-DD.log # WARGM delivery log
├── iditem.txt                         # SCUM item IDs (1134 items)
├── package.json
├── vite.config.ts
├── AGENTS.md                          # AI agent instructions
├── README.md                          # Full documentation v2.0.0
├── RCON_SETUP.md                      # RCON mod installation guide
├── PROGRESS.md                        # Development progress tracker
├── PROJECT_STRUCTURE.md               # This file
├── start.bat                          # Build + run
└── start-run.bat                      # Run only (skip build)
```

## Build Pipeline

```
npm run build
 ├── npm run build:main   → tsc -p src/main/tsconfig.json   → dist/main/
 ├── npm run build:renderer→ vite build                      → dist/renderer/
 └── npm run copy-assets  → copyfiles src/main/*.html        → dist/main/
```

## Key Architecture

- **Main process**: Node.js backend compiled with `tsc` to CommonJS. All server logic (RCON, HTTP, file watching, WARGM API) runs here.
- **Renderer**: React + MUI frontend bundled by Vite. Communicates with main process via Electron IPC (`window.electronAPI.*`).
- **Preload bridge** (`preload.ts`): Exposes `contextBridge` APIs for config, server control, RCON, backups, logs, DB.
- **Web panel** (`webPanel.ts` + `webPanelUnified.html`): HTTP server on port 8080. Provides a browser-accessible admin UI. Uses shared RCON connection from main process (no separate login required when RCON is connected).

## Service Dependencies

```
index.ts
 ├── serverManager      ← SCUM process lifecycle
 ├── steamCmd           ← Server updates via SteamCMD
 ├── logWatcher         ← Chat log parsing + command processing
 │    ├── rconClient    ← RCON commands
 │    ├── discordWebhook← Discord notifications
 │    └── wargmManager  ← WARGM purchase processing
 ├── webPanel           ← HTTP API + frontend
 │    ├── rconClient
 │    ├── serverManager
 │    ├── steamCmd
 │    ├── wargmManager
 │    └── logWatcher (cooldowns)
 ├── rconClient         ← RCON protocol (TCP, auto-reconnect)
 ├── wargmManager       ← WARGM API + SQLite
 ├── backupManager      ← Backup/restore
 ├── discordWebhook     ← Discord notifications
 ├── ftpServer          ← FTP file access
 └── scumDatabase       ← SCUM.db reader (sql.js)
```
