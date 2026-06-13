import net from 'net';
import fs from 'fs-extra';
import path from 'path';

export interface RconConfig {
  enabled: boolean;
  host: string;
  port: number;
  password: string;
}

export interface RconCommandResult {
  success: boolean;
  response: string;
  error?: string;
}

// Source RCON packet types
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

export class RconClient {
  private socket: any = null;
  private config: RconConfig | null = null;
  private connected: boolean = false;
  private connecting: boolean = false;
  private logPath: string = '';
  private packetId: number = 1;
  private responseQueue: Map<number, { resolve: (value: string) => void; reject: (error: Error) => void; buffers?: string[] }> = new Map();
  private responseDebounceTimers: Map<number, NodeJS.Timeout> = new Map();
  private autoReconnect: boolean = false;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY = 5000;

  constructor() {
    this.logPath = path.join(process.cwd(), 'logs', 'rcon_commands.log');
    fs.ensureDirSync(path.dirname(this.logPath));
  }

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
    if (!enabled && this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  async connect(host: string, port: number, password: string): Promise<RconCommandResult> {
    if (this.connecting) {
      return { success: false, response: '', error: 'Connection already in progress' };
    }
    try {
      if (this.connected) {
        await this.disconnect();
      }
      this.connecting = true;

      this.config = { enabled: true, host, port, password };
      
      const address = host === 'localhost' ? '127.0.0.1' : host;
      console.log(`[RCON] Attempting to connect to ${address}:${port}...`);
      
      const result = await new Promise<RconCommandResult>((resolve, reject) => {
        this.socket = new net.Socket();
        
        const timeout = setTimeout(() => {
          this.socket.destroy();
          resolve({ success: false, response: '', error: 'Connection timeout' });
        }, 5000);

        this.socket.on('connect', () => {
          clearTimeout(timeout);
          console.log('[RCON] TCP connected, sending auth...');
          this.sendAuth(password).then(() => {
            if (!this.socket) {
              resolve({ success: false, response: '', error: 'Connection lost during auth' });
              return;
            }
            this.connected = true;
            this.connecting = false;
            console.log(`[RCON] Successfully connected to ${address}:${port}`);
            resolve({ success: true, response: 'Connected successfully' });
          }).catch((err: Error) => {
            if (this.socket) this.socket.destroy();
            this.connecting = false;
            resolve({ success: false, response: '', error: err.message });
          });
        });

        this.socket.on('data', (data: Buffer) => {
          this.handleResponse(data);
        });

        this.socket.on('error', (err: Error) => {
          clearTimeout(timeout);
          this.connecting = false;
          console.error('[RCON] Socket error:', err.message);
          resolve({ success: false, response: '', error: err.message });
        });

        this.socket.on('close', () => {
          this.connecting = false;
          this.connected = false;
          this.socket = null;
          console.log('[RCON] Connection closed');
          if (this.autoReconnect && this.config) {
            this.scheduleReconnect();
          }
        });

        this.socket.connect(port, address);
      });
      this.connecting = false;
      return result;
    } catch (error: any) {
      this.connected = false;
      let errorMsg = error.message || 'Connection failed';
      
      if (errorMsg.includes('ECONNREFUSED')) {
        errorMsg = `Connection refused - check if server is running and RCON port ${port} is open`;
      } else if (errorMsg.includes('ECONNRESET')) {
        errorMsg = 'Connection reset - wrong password or RCON not enabled on server';
      }
      
      console.error('[RCON] Connection error:', errorMsg);
      return { success: false, response: '', error: errorMsg };
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;
    console.log(`[RCON] Scheduling reconnect in ${this.RECONNECT_DELAY}ms...`);
    const attempt = () => {
      if (!this.autoReconnect) return;
      this.reconnectInterval = setTimeout(() => {
        if (!this.connected && this.config && this.autoReconnect) {
          console.log('[RCON] Attempting auto-reconnect...');
          this.connect(this.config.host, this.config.port, this.config.password).then(result => {
            if (result.success) {
              console.log('[RCON] Auto-reconnect successful');
              this.reconnectInterval = null;
            } else {
              attempt();
            }
          }).catch(() => attempt());
        } else {
          attempt();
        }
      }, this.RECONNECT_DELAY) as any;
    };
    attempt();
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false;
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.socket) {
      try {
        this.socket.destroy();
        console.log('[RCON] Disconnected');
      } catch (error: any) {
        console.error('[RCON] Disconnect error:', error.message);
      }
    }
    this.socket = null;
    this.connected = false;
    this.config = null;
    this.responseQueue.clear();
    for (const t of this.responseDebounceTimers.values()) clearTimeout(t);
    this.responseDebounceTimers.clear();
  }

  async sendCommand(command: string): Promise<RconCommandResult> {
    if (!this.connected || !this.socket) {
      return { success: false, response: '', error: 'Not connected to RCON server' };
    }

    try {
      const response = await this.execCommand(command);
      this.logCommand(command, response);
      return { success: true, response: response || 'Command executed (no response)' };
    } catch (error: any) {
      const errorMsg = error.message || 'Command execution failed';
      console.error('[RCON] Command error:', errorMsg);
      this.logCommand(command, '', errorMsg);
      return { success: false, response: '', error: errorMsg };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConfig(): RconConfig | null {
    return this.config;
  }

  private sendAuth(password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = this.packetId++;
      const packet = this.createPacket(id, SERVERDATA_AUTH, password);
      
      this.responseQueue.set(id, {
        resolve: () => resolve(),
        reject: (err) => reject(err),
      });

      this.socket.write(packet);
      
      setTimeout(() => {
        if (this.responseQueue.has(id)) {
          this.responseQueue.delete(id);
          reject(new Error('Auth timeout'));
        }
      }, 3000);
    });
  }

  private execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = this.packetId++;
      const packet = this.createPacket(id, SERVERDATA_EXECCOMMAND, command);
      
      this.responseQueue.set(id, {
        resolve: (resp) => resolve(resp),
        reject: (err) => reject(err),
      });

      this.socket.write(packet);
      
      setTimeout(() => {
        if (this.responseQueue.has(id)) {
          const handler = this.responseQueue.get(id)!;
          this.responseQueue.delete(id);
          if (handler.buffers && handler.buffers.length > 0) {
            resolve(handler.buffers.join(''));
          } else {
            reject(new Error('Command timeout'));
          }
        }
      }, 15000);
    });
  }

  private handleResponse(data: Buffer) {
    try {
      let offset = 0;
      while (offset < data.length) {
        const size = data.readInt32LE(offset);
        if (size < 10 || offset + 4 + size > data.length) break;
        
        const id = data.readInt32LE(offset + 4);
        const type = data.readInt32LE(offset + 8);
        const body = data.toString('utf8', offset + 12, offset + 4 + size - 2);
        
        if (type === SERVERDATA_AUTH_RESPONSE) {
          const handler = this.responseQueue.get(id);
          if (handler) {
            this.responseQueue.delete(id);
            if (id === -1) {
              handler.reject(new Error('Wrong rcon password'));
            } else {
              handler.resolve('');
            }
          }
        } else if (type === SERVERDATA_RESPONSE_VALUE) {
          const handler = this.responseQueue.get(id);
          if (handler) {
            if (body.length === 0) {
              // Empty body = terminator, resolve immediately
              const dt = this.responseDebounceTimers.get(id);
              if (dt) { clearTimeout(dt); this.responseDebounceTimers.delete(id); }
              this.responseQueue.delete(id);
              handler.resolve(handler.buffers ? handler.buffers.join('') : '');
            } else {
              if (!handler.buffers) handler.buffers = [];
              handler.buffers.push(body);
              // Debounce: resolve after 100ms of no further packets
              const dt = this.responseDebounceTimers.get(id);
              if (dt) clearTimeout(dt);
              this.responseDebounceTimers.set(id, setTimeout(() => {
                this.responseDebounceTimers.delete(id);
                if (this.responseQueue.has(id)) {
                  this.responseQueue.delete(id);
                  handler.resolve(handler.buffers!.join(''));
                }
              }, 100));
            }
          }
        }
        
        offset += 4 + size;
      }
    } catch (err) {
      console.error('[RCON] Error parsing response:', err);
    }
  }

  private createPacket(id: number, type: number, body: string): Buffer {
    const bodyBuffer = Buffer.from(body, 'utf8');
    const size = 4 + 4 + bodyBuffer.length + 2; // id + type + body + null terminators
    const packet = Buffer.alloc(4 + size);
    
    packet.writeInt32LE(size, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    bodyBuffer.copy(packet, 12);
    packet.writeInt16LE(0, 12 + bodyBuffer.length);
    
    return packet;
  }

  private logCommand(command: string, response: string, error?: string): void {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] COMMAND: ${command} | RESPONSE: ${response}${error ? ` | ERROR: ${error}` : ''}\n`;
      fs.appendFileSync(this.logPath, logEntry, 'utf-8');
    } catch (err) {
      console.error('[RCON] Failed to log command:', err);
    }
  }
}
