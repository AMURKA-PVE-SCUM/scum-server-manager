# SCUM Server Manager - Agent Guide

## Build & Run
- Build: `npm run build` (runs build:main + build:renderer)
- Build main only: `npx tsc -p src/main/tsconfig.json`
- Build renderer only: `npx vite build`
- Run: `npx electron dist/main/index.js`
- Dev renderer: `npx vite` (serves at localhost:5173)
- Lint: N/A

## Architecture
- **Main process** (`src/main/`): Node.js/Electron backend, compiles with `tsc` to `dist/main/`
- **Renderer** (`src/renderer/`): React + MUI frontend, bundled by Vite to `dist/renderer/`
- **Navigation**: All pages registered in `src/renderer/App.tsx` navItems array + Routes
- **IPC bridge**: Preload (`src/main/preload.ts`) exposes APIs via `window.electronAPI.*`; types in `src/renderer/electron.d.ts`
- **Translation**: `src/renderer/contexts/LanguageContext.tsx` provides `useTranslation()` with `t(ns, key)`

## Convention
- Use `sx` prop for MUI styling (dark theme, `#0d1117` background, `#58a6ff` accent, `#30363d` borders, `#e6edf3` text)
- Monospace font for code/textareas: `'Consolas, monospace'`
- Show loading states as null returns (no spinner)
- Base pages: Dashboard, ServerInstall, Scheduler (RestartScheduler), WebPanelPage, ServerSettings, GameSettings, EconomySettings, RaidSettings, PlayersPage, SquadsPage, VehiclesPage, LootEditor, LogMonitor, BackupManager, DiscordSettings, FTPSettings, FileManager, AppSettings
