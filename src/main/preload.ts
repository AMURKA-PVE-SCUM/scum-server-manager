import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config: any) => ipcRenderer.invoke('config:set', config),
  },
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    restart: () => ipcRenderer.invoke('server:restart'),
    status: () => ipcRenderer.invoke('server:status'),
    checkUpdate: () => ipcRenderer.invoke('server:check-update'),
    update: () => ipcRenderer.invoke('server:update'),
    updateStream: () => ipcRenderer.invoke('server:update-stream'),
    onUpdateLine: (cb: (line: string) => void) => {
      ipcRenderer.on('server:update-line', (_e, line) => cb(line));
    },
    onUpdateDone: (cb: (result: string) => void) => {
      ipcRenderer.on('server:update-done', (_e, result) => cb(result));
    },
    removeUpdateListeners: () => {
      ipcRenderer.removeAllListeners('server:update-line');
      ipcRenderer.removeAllListeners('server:update-done');
    },
    consoleStart: () => ipcRenderer.invoke('server:console-start'),
    consoleStop: () => ipcRenderer.invoke('server:console-stop'),
    onConsoleLines: (cb: (lines: string[]) => void) => {
      ipcRenderer.on('server:console-lines', (_e, lines) => cb(lines));
    },
    removeConsoleListeners: () => {
      ipcRenderer.removeAllListeners('server:console-lines');
    },
  },
  steamcmd: {
    install: () => ipcRenderer.invoke('steamcmd:install'),
  },
  files: {
    read: (filePath: string) => ipcRenderer.invoke('files:read', filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke('files:write', filePath, content),
    list: (dirPath: string) => ipcRenderer.invoke('files:list', dirPath),
  },
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    create: (name?: string) => ipcRenderer.invoke('backup:create', name),
    restore: (id: string) => ipcRenderer.invoke('backup:restore', id),
    delete: (id: string) => ipcRenderer.invoke('backup:delete', id),
  },
  logs: {
    get: () => ipcRenderer.invoke('logs:get'),
    getByType: (type: string) => ipcRenderer.invoke('logs:get-by-type', type),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
  discord: {
    test: (webhookUrl: string) => ipcRenderer.invoke('discord:test', webhookUrl),
  },
});
