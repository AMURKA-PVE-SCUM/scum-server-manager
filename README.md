# 🎯 SCUM Server Manager

<div align="center">

**Полноценное управление SCUM Dedicated Server под Windows**

[![Release](https://img.shields.io/github/v/release/tolyan28rus/scum-server-manager)](https://github.com/tolyan28rus/scum-server-manager/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/tolyan28rus/scum-server-manager/releases)
[![License](https://img.shields.io/github/license/tolyan28rus/scum-server-manager)]()

<img src="https://via.placeholder.com/900x450/0d1117/58a6ff?text=SCUM+Server+Manager" alt="preview" width="100%"/>

</div>

## 📋 Возможности

### 🚀 Управление сервером
- **Запуск/Остановка/Перезапуск** — одной кнопкой на панели управления
- **Интеллектуальная остановка**: Ctrl+C (graceful) → CloseWindow → taskkill /PID
- **Скрытие окна консоли** — серверный терминал не мозолит глаза
- **Мониторинг**: онлайн игроков, RAM, PID, аптайм
- **Список игроков** — парсинг BattlEye из SCUM.log (кто зашёл/вышел)

### 📥 SteamCMD
- **Установка и обновление** сервера (app 3792580)
- **Прогресс-бар** в реальном времени — видно что качается
- **Авто-проверка обновлений** каждые 10 минут + чип "Доступно обновление"
- **Валидация файлов** (`validate`) при каждом обновлении

### ⚙️ Конфигурация
- **Визуальный редактор INI** — ServerSettings, GameUserSettings (секции + ключи)
- **Редактор JSON** — EconomyOverride, RaidTimes, LootOverride
- **Сохранение с бэкапом** — перед записью файла создаётся резервная копия
- **File Manager** — встроенный файловый менеджер (Config/Saves/Logs)

### 🗓️ Расписание
- **Перезапуск сервера** по расписанию (конкретное время или каждые N часов)
- **Выбор дней недели** для каждого времени
- **Расписание роботов** — включение/выключение Sentry по дням и времени
- Редактирует `ServerSettings.ini`: `DisableSentrySpawning` / `EnableSentryRespawning`

### 💾 Бэкапы
- **Ручные** и **автоматические** по расписанию
- **Настраиваемый интервал** (по умолчанию 3 часа)
- **Retention + авто-очистка** — хранит только N последних копий
- **Кнопка "Обзор"** для выбора папки (создаётся автоматически)
- **Восстановление** из любого бэкапа

### 👥 Пользователи
- **Админы, Вайтлист, Баны** — редактирование AdminUsers.ini, WhitelistedUsers.ini, BannedUsers.ini
- **Флаги прав**: `[SetGodMode]`, `[RestartServer]` и другие
- **Подсказка** прямо в диалоге добавления

### 🔔 Discord
- **Уведомления о входе/выходе игроков** — ник + онлайн
- **Статус сервера** — Start (🟢), Stop (🔴), Restart (🔄)
- **Только нужные вебхуки** — логи входа и статус

### 🌐 FTP-доступ
- **Встроенный FTP-сервер** — поднимается прямо в приложении
- **Доступ к файлам сервера** — конфиги, сохранения, логи
- **Автостарт** вместе с приложением
- Подключайся любым FTP-клиентом (FileZilla и т.д.)

### 📝 Логи
- **Чтение логов в реальном времени** — административные, игровые, чат, транспорт
- **Авто-определение UTF-16LE** — SCUM пишет логи в Unicode
- **Фильтрация по типу** — вкладки All/Admin/Chat/Login/Vehicle/System

## 🖥️ Системные требования

| Компонент | Требование |
|-----------|-----------|
| **ОС** | Windows 10 / Windows Server 2019+ |
| **RAM** | 512 MB (без учёта самого сервера SCUM) |
| **Диск** | 200 MB (приложение) + ~20 GB (сервер SCUM) |
| **Node.js** | 20+ (только для сборки из исходников) |
| **SteamCMD** | Устанавливается автоматически |
| **VC++ Redistributable** | [Скачать](https://aka.ms/vs/17/release/vc_redist.x64.exe) (если не запускается) |

## 📦 Установка

### Вариант 1: Готовый EXE (рекомендуется)
1. Скачай последний релиз: [GitHub Releases](https://github.com/tolyan28rus/scum-server-manager/releases)
2. Распакуй ZIP в любую папку
3. Запусти `SCUM Server Manager.exe`
4. В настройках укажи путь к серверу SCUM

### Вариант 2: Из исходников
```bash
git clone https://github.com/tolyan28rus/scum-server-manager.git
cd scum-server-manager
npm install
npm run build
npx electron .
```

## 🚀 Быстрый старт

### Первый запуск
1. Открой приложение → Панель управления
2. Настройки → Укажи **Путь к SCUM серверу** (например `D:\SCUM_Server`)
3. Если нужно → Укажи **Путь к SteamCMD**
4. Нажми **Сохранить**

### Установка сервера (если ещё нет)
1. Перейди на вкладку **Установка**
2. Шаг 1: Укажи путь для SteamCMD → Установить
3. Шаг 2: Укажи путь для сервера → Установить SCUM Server
4. Жди завершения загрузки (~17 GB)

### Запуск сервера
1. Панель управления → **Старт**
2. Статус изменится на 🟢 **Онлайн**
3. В консоли сервера появится вывод

### Discord (опционально)
1. Discord → Включить уведомления
2. Вставь вебхуки: входы игроков, статус сервера
3. Сохрани → Проверь кнопкой **Тест**

### FTP (опционально)
1. FTP → Настрой порт, логин, пароль
2. Включи **Auto-start** если нужно
3. **Start** → подключайся любым FTP-клиентом

## 🛠️ Разработка

```bash
# Установка зависимостей
npm install

# Режим разработки (Vite hot-reload + Electron)
npm run dev:unified

# Сборка
npm run build

# Запуск собранной версии
npx electron .

# Сборка портативной версии
npx electron-packager . "SCUM Server Manager" --platform=win32 --arch=x64 --out=release --overwrite --icon="assets/icon.ico" --ignore="Server$" --prune
```

## 📁 Структура проекта

```
scum-server-manager/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # IPC handlers, schedulers
│   │   ├── serverManager.ts  # Server lifecycle
│   │   ├── steamCmd.ts    # SteamCMD operations
│   │   ├── logWatcher.ts  # Log monitoring
│   │   ├── backupManager.ts  # Backups
│   │   ├── discordWebhook.ts # Discord
│   │   ├── ftpServer.ts   # Built-in FTP
│   │   ├── fileManager.ts # File operations
│   │   └── preload.ts     # Renderer bridge
│   └── renderer/          # React UI
│       ├── pages/         # 15+ страниц
│       ├── components/    # UI компоненты
│       ├── locales/       # ru/en
│       └── contexts/      # LanguageContext
├── tools/                 # C# helpers
│   ├── SendCtrlC.exe      # Graceful shutdown
│   └── CloseSCUMWindow.exe # Window management
├── dist/                  # Сборка
└── release/               # Готовый EXE
```

## 📄 Лицензия

MIT
