# RCON Setup Guide

## Overview

This guide explains how to set up and use the RCON (Remote Console) feature in SCUM Server Manager. RCON allows you to send commands to your SCUM server remotely, manage players, and perform administrative actions.

---

## Prerequisites

Before using RCON, you need to install the RCON mod on your SCUM server:

1. **UE4SS** - Unreal Engine 4 Scripting System
2. **scum_rcon** - RCON plugin for SCUM

### Installation Steps

1. Download UE4SS from the official repository
2. Download scum_rcon mod
3. Install both mods to your SCUM server directory:
   ```
   SCUM/
   └── SCUM/
       └── Binaries/
           └── Win64/
               ├── ue4ss.dll
               └── Mods/
                   └── scum_rcon/
                       └── ...
   ```

4. Configure the RCON mod by editing the config file (usually `Mods/scum_rcon/config.ini`):
   ```ini
   [RCON]
   RCON_Port=28015
   RCON_Password=your_secure_password_here
   RCON_Enabled=true
   ```

5. Restart your SCUM server

---

## Configuring RCON in SCUM Server Manager

### Method 1: Using the RCON Console Page

1. Open SCUM Server Manager
2. Navigate to **"RCON Консоль"** (RCON Console) in the sidebar
3. Enter connection details:
   - **Host**: Server IP address (use `localhost` or `127.0.0.1` if running on the same machine)
   - **Port**: RCON port (default: `28015`)
   - **Password**: Your RCON password from the mod config
4. Click **"Подключиться"** (Connect)
5. Test the connection by sending the `ServerInfo` command

### Method 2: Configuration Persistence

The connection settings are automatically saved when you successfully connect. Next time you open the application, it will remember your configuration.

---

## Using RCON Console

### Basic Commands

Once connected, you can send any RCON command supported by the scum_rcon mod:

- **ListPlayers** - List all online players
- **ServerInfo** - Display server information
- **SaveWorld** - Save the current world state
- **SetAttributes** - Set player attributes
- **SetGodMode** - Enable/disable god mode for a player
- And many more...

### Command History

- Use **↑ (Arrow Up)** to navigate through previously sent commands
- Use **↓ (Arrow Down)** to navigate forward in history
- All commands and responses are logged with timestamps

### Quick Commands

Pre-configured buttons for common actions:
- **List Players** - Shows all connected players
- **Server Info** - Displays server status and statistics
- **Save World** - Saves the game world

---

## Online Players Management

Navigate to **"Онлайн Игроки"** (Online Players) to manage connected players in real-time.

### Features

- **Auto-refresh**: Player list updates every 5 seconds
- **Real-time tracking**: Shows connection duration for each player
- **Quick Actions**: Perform administrative actions with one click

### Available Actions

#### 1. Set Attributes (⚡ Выдать атрибуты)
Opens a dialog to set player attributes:
- Strength (Сила)
- Dexterity (Ловкость)
- Stamina (Выносливость)
- Intellect (Интеллект)

Command: `SetAttributes <strength> <dexterity> <stamina> <intellect> <steamid>`

#### 2. God Mode (🛡)
Makes a player invincible.

Command: `SetGodMode true <steamid>`

#### 3. Kill (💀)
Kills the selected player.

Command: `Suicide <steamid>`

#### 4. Silence/Unsilence (🔇/🔊)
Mutes or unmutes a player's voice chat.

Commands:
- `Silence <steamid>`
- `Unsilence <steamid>`

#### 5. Knockout (😴)
Temporarily knocks out a player for specified seconds.

Command: `Knockout <seconds> <steamid>`

#### 6. Announce (📢)
Sends a global announcement to all players.

Command: `Announce <message>`

#### 7. Notify (🔔)
Sends a notification to a specific player with different types:
- Info (0)
- Warning (1)
- Error (2)
- Success (3)

Command: `SendNotification <type> 0 "<message>" <steamid>`

#### 8. Chat (💬)
Sends a private chat message to a player with custom color.

Available colors: White, Red, Green, Blue, Yellow, Cyan, Magenta

Command: `SendChat <color> "<message>" <steamid>`

---

## Security Best Practices

### Password Security

1. **Use strong passwords**: Minimum 12 characters with mixed case, numbers, and symbols
2. **Never share your RCON password**: Treat it like any other sensitive credential
3. **Change passwords regularly**: Update your RCON password periodically
4. **Don't hardcode passwords**: Never commit passwords to version control

### Network Security

1. **Firewall configuration**: Only allow RCON access from trusted IPs
   ```bash
   # Example: Allow only localhost
   iptables -A INPUT -p tcp --dport 28015 -s 127.0.0.1 -j ACCEPT
   iptables -A INPUT -p tcp --dport 28015 -j DROP
   ```

2. **Use VPN**: If accessing remotely, use a VPN connection
3. **Port forwarding**: Only forward RCON port if absolutely necessary
4. **Monitor logs**: Regularly check `logs/rcon_commands.log` for unauthorized access

### Access Control

1. **Limit admin access**: Only grant RCON access to trusted administrators
2. **Audit commands**: Review command logs regularly
3. **Disable when not needed**: Turn off RCON when not actively using it

---

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to RCON server

**Solutions**:
1. Verify the SCUM server is running
2. Check that the RCON mod is installed correctly
3. Confirm the RCON port matches your config (default: 28015)
4. Verify the password is correct
5. Check firewall settings
6. Ensure the server has finished loading before connecting

**Check server logs**:
```
SCUM/Saved/Logs/SCUM.log
```

Look for messages about RCON initialization.

### Command Failures

**Problem**: Commands return errors or no response

**Solutions**:
1. Verify command syntax is correct
2. Check that the player SteamID is valid (17 digits)
3. Ensure the player is currently online
4. Review `logs/rcon_commands.log` for detailed error messages
5. Try reconnecting to RCON

### Player Tracking Issues

**Problem**: Online players list is empty or outdated

**Solutions**:
1. Verify SCUM.log exists and is being written to
2. Check log parsing patterns match your server's log format
3. Restart the web panel if needed
4. Ensure the server path is configured correctly

---

## Command Reference

### Player Management

| Command | Description | Example |
|---------|-------------|---------|
| `ListPlayers` | List all online players | `ListPlayers` |
| `SetAttributes` | Set player attributes | `SetAttributes 8 5 5 5 76561198000000000` |
| `SetGodMode` | Toggle god mode | `SetGodMode true 76561198000000000` |
| `Suicide` | Kill a player | `Suicide 76561198000000000` |
| `Silence` | Mute player | `Silence 76561198000000000` |
| `Unsilence` | Unmute player | `Unsilence 76561198000000000` |
| `Knockout` | Knock out player | `Knockout 30 76561198000000000` |

### Communication

| Command | Description | Example |
|---------|-------------|---------|
| `Announce` | Global announcement | `Announce Server restart in 5 minutes` |
| `SendNotification` | Send notification | `SendNotification 0 0 "Welcome!" 76561198000000000` |
| `SendChat` | Private chat message | `SendChat Red "Hello!" 76561198000000000` |

### Server Management

| Command | Description | Example |
|---------|-------------|---------|
| `ServerInfo` | Server information | `ServerInfo` |
| `SaveWorld` | Save world state | `SaveWorld` |
| `RestartServer` | Restart server | `RestartServer` |

---

## Log Files

### RCON Command Log

All RCON commands and responses are logged to:
```
logs/rcon_commands.log
```

Format:
```
[TIMESTAMP] COMMAND: <command> | RESPONSE: <response> | ERROR: <error_if_any>
```

Example:
```
[2024-01-15T10:30:45.123Z] COMMAND: ListPlayers | RESPONSE: Player1 (76561198000000000), Player2 (76561198000000001)
[2024-01-15T10:31:00.456Z] COMMAND: SetGodMode true 76561198000000000 | RESPONSE: God mode enabled
```

### Server Log

SCUM server logs are located at:
```
SCUM/Saved/Logs/SCUM.log
```

This file is used for tracking player connections and disconnections.

---

## Support

For issues or questions:

1. Check this documentation first
2. Review log files for error messages
3. Verify your RCON mod installation
4. Check the SCUM Server Manager GitHub issues
5. Contact the server administrator

---

## Additional Resources

- **[SCUM-RCON Mod](https://github.com/herbie96x/SCUM-RCON)** — RCON мод для SCUM от herbie96x
- **[UE4SS](https://github.com/UE4SS-RE/RE-UE4SS)** — Unreal Engine 4 Scripting System
- **SCUM Dedicated Server Guide**: Official SCUM server documentation

---

## Version Information

- **SCUM Server Manager**: 1.3.0+
- **RCON Protocol**: Source RCON
- **Default Port**: 28015
- **Supported Commands**: All scum_rcon commands

---

*Last updated: 2024*
