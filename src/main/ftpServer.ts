const FtpSrv = require('ftp-srv');

export class FtpServer {
  private server: any = null;
  private rootPath = '';

  start(port: number, root: string, user: string, pass: string, pasvHost?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) { reject(new Error('FTP server already running')); return; }
      this.rootPath = root;
      this.server = new FtpSrv({
        url: `ftp://0.0.0.0:${port}`,
        pasv_url: pasvHost || '127.0.0.1',
        pasv_min: 50000,
        pasv_max: 50100,
        anonymous: false,
        greeting: 'Welcome to SCUM Server Manager FTP',
      });
      this.server.on('login', ({ username, password }: any, resolveLogin: any, rejectLogin: any) => {
        if (username !== user || password !== pass) { rejectLogin(new Error('Invalid credentials')); return; }
        resolveLogin({ root: this.rootPath, cwd: '/' });
      });
      this.server.on('error', (err: any) => { console.error('[ftp-server] error:', err.message); });
      this.server.listen().then(() => resolve()).catch(reject);
    });
  }

  stop(): void {
    if (this.server) { try { this.server.close(); } catch {} this.server = null; }
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}
