# SCUM Server Manager

<div align="center">
  <img src="https://via.placeholder.com/800x450/0d1117/58a6ff?text=SCUM+Server+Manager" alt="SCUM Server Manager" width="800"/>
  <br/><br/>
  <p><strong>Управление, мониторинг и настройка SCUM Dedicated Server под Windows</strong></p>
  <p>
    <a href="https://github.com/tolyan28rus/scum-server-manager/releases"><img src="https://img.shields.io/github/v/release/tolyan28rus/scum-server-manager" alt="Release"/></a>
    <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform"/>
    <img src="https://img.shields.io/github/license/tolyan28rus/scum-server-manager" alt="License"/>
  </p>
</div>

## Возможности

| | |
|---|---|
| 🚀 **Управление сервером** | Запуск, остановка, перезапуск (Ctrl+C + taskkill) |
| 📥 **SteamCMD** | Установка и обновление сервера (app 3792580) |
| 📊 **Мониторинг** | Онлайн игроков, RAM, FPS, список игроков |
| ⚙️ **Конфигурация** | Визуальный редактор INI/JSON файлов |
| 🔔 **Discord** | Уведомления о входе/выходе игроков, старте/стопе сервера |
| 📅 **Расписание** | Автоматический перезапуск по времени или интервалу |
| 💾 **Бэкапы** | Создание и восстановление резервных копий |
| 📝 **Логи** | Чтение логов сервера в реальном времени |
| 👥 **Пользователи** | Управление админами, вайтлистом и банами |
| 🌙 **Тема** | Тёмная тема в стиле GitHub |

## Скриншоты

*(добавьте скриншот приложения здесь — откройте issue или PR)*

## Установка

### Из исходников
```bash
git clone https://github.com/tolyan28rus/scum-server-manager.git
cd scum-server-manager
npm install
npm run build
npx electron .
```

### Готовый EXE
Скачайте последний релиз:
- **https://github.com/tolyan28rus/scum-server-manager/releases**
- Распакуйте ZIP
- Запустите `SCUM Server Manager.exe`

### Требования
- Windows 10/11
- [Node.js 20+](https://nodejs.org/) (для сборки из исходников)
- [SteamCMD](https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip) (устанавливается автоматически)
- [Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)

## Разработка

```bash
# Установка зависимостей
npm install

# Режим разработки (Vite + Electron)
npm run dev:unified

# Сборка
npm run build

# Запуск
npx electron .

# Сборка портативной версии
npx electron-packager . "SCUM Server Manager" --platform=win32 --arch=x64 --out=release --ignore="Server|\.git" --prune
```

## Лицензия

MIT
