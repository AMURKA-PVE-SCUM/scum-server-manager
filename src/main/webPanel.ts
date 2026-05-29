import http from 'http';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { watch, FSWatcher } from 'chokidar';

export interface WebPanelConfig {
  enabled: boolean;
  port: number;
  username: string;
  password: string;
}

interface SSEClient {
  id: number;
  res: http.ServerResponse;
}

export class WebPanel {
  private server: http.Server | null = null;
  private config: WebPanelConfig;
  private sseClients: SSEClient[] = [];
  private sseId = 0;
  private consoleWatcher: FSWatcher | null = null;
  private consoleOffset = 0;
  private tokens = new Set<string>();
  private serverManager: any = null;
  private steamCmd: any = null;
  private serverPath = '';

  constructor(config: WebPanelConfig) {
    this.config = config;
  }

  setServices(sm: any, sc: any, sp: string): void {
    this.serverManager = sm;
    this.steamCmd = sc;
    this.serverPath = sp;
  }

  updateConfig(cfg: WebPanelConfig): void {
    const wasRunning = this.server !== null;
    if (wasRunning) this.stop();
    this.config = cfg;
    if (wasRunning && cfg.enabled) this.start().catch((e) => console.error('[WebPanel]', e.message));
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve();
    this.tokens.clear();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '/';
        const method = req.method || 'GET';

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        if (url === '/' && method === 'GET') {
          this.serveIndex(res);
        } else if (url === '/api/login' && method === 'POST') {
          this.handleLogin(req, res);
        } else if (url.startsWith('/api/console') && method === 'GET') {
          this.handleConsoleSSE(req, res);
        } else if (!this.authenticated(req)) {
          this.sendJson(res, { error: 'Unauthorized' }, 401);
        } else if (url === '/api/status' && method === 'GET') {
          this.handleStatus(res);
        } else if (url === '/api/start' && method === 'POST') {
          this.handleStart(res);
        } else if (url === '/api/stop' && method === 'POST') {
          this.handleStop(res);
        } else if (url === '/api/restart' && method === 'POST') {
          this.handleRestart(res);
        } else if (url === '/api/update' && method === 'POST') {
          this.handleUpdate(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.server.on('error', (err: any) => {
        this.server = null;
        reject(new Error(`Web Panel: ${err.message}`));
      });

      this.server.listen(this.config.port, '0.0.0.0', () => {
        console.log(`[WebPanel] Listening on http://0.0.0.0:${this.config.port}`);
        this.startConsoleWatcher();
        resolve();
      });
    });
  }

  stop(): void {
    this.stopConsoleWatcher();
    this.sseClients.forEach((c) => c.res.end());
    this.sseClients = [];
    this.tokens.clear();
    if (this.server) {
      try { this.server.close(); } catch {}
      this.server = null;
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private authenticated(req: http.IncomingMessage): boolean {
    if (!this.config.username && !this.config.password) return true;
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return false;
    return this.tokens.has(auth.slice(7));
  }

  private async handleLogin(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { username, password } = JSON.parse(body);
      if (username === this.config.username && password === this.config.password) {
        const token = crypto.randomBytes(32).toString('hex');
        this.tokens.add(token);
        this.sendJson(res, { token });
      } else {
        this.sendJson(res, { error: 'Invalid credentials' }, 401);
      }
    } catch {
      this.sendJson(res, { error: 'Bad request' }, 400);
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk: Buffer) => data += chunk.toString());
      req.on('end', () => resolve(data));
    });
  }

  private sendJson(res: http.ServerResponse, data: any, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private handleStatus(res: http.ServerResponse): void {
    try {
      const s = this.serverManager?.getStatus() || {
        running: false, pid: null, uptime: 0,
        players: 0, maxPlayers: 50, memoryUsage: 0,
      };
      this.sendJson(res, s);
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleStart(res: http.ServerResponse): Promise<void> {
    try {
      await this.serverManager?.start();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleStop(res: http.ServerResponse): Promise<void> {
    try {
      await this.serverManager?.stop();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleRestart(res: http.ServerResponse): Promise<void> {
    try {
      await this.serverManager?.restart();
      this.sendJson(res, { ok: true });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private async handleUpdate(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.steamCmd) {
        this.sendJson(res, { error: 'SteamCMD not initialized' }, 500);
        return;
      }
      if (this.serverPath) this.steamCmd.setServerPath(this.serverPath);
      const result = await this.steamCmd.updateServer();
      this.sendJson(res, { ok: true, result });
    } catch (e: any) {
      this.sendJson(res, { error: e.message }, 500);
    }
  }

  private handleConsoleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.config.username && this.config.password) {
      const qIdx = (req.url || '').indexOf('?');
      const params = new URLSearchParams(
        qIdx >= 0 ? (req.url || '').slice(qIdx + 1) : '',
      );
      const queryToken = params.get('token');
      if (!queryToken || !this.tokens.has(queryToken)) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    this.sendSSE(res, 'connected', 'Console stream connected');

    if (this.serverPath) {
      const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
      if (fs.existsSync(logPath)) {
        const stat = fs.statSync(logPath);
        if (stat.size > 0) {
          const readSize = Math.min(stat.size, 65536);
          const buf = Buffer.alloc(readSize);
          const fd = fs.openSync(logPath, 'r');
          fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
          fs.closeSync(fd);
          const encoding = buf[1] === 0 ? 'utf16le' : 'utf-8';
          const text = buf.toString(encoding);
          text.split('\n').filter(Boolean).forEach((line) => this.sendSSE(res, 'line', line));
        }
      }
    }

    const client: SSEClient = { id: ++this.sseId, res };
    this.sseClients.push(client);

    req.on('close', () => {
      this.sseClients = this.sseClients.filter((c) => c.id !== client.id);
    });
  }

  private sendSSE(res: http.ServerResponse, event: string, data: string): void {
    try {
      res.write(`event: ${event}\ndata: ${data.replace(/\n/g, '\\n')}\n\n`);
    } catch {}
  }

  private startConsoleWatcher(): void {
    if (!this.serverPath) return;
    const logPath = path.join(this.serverPath, 'SCUM', 'Saved', 'Logs', 'SCUM.log');
    if (!fs.existsSync(logPath)) return;

    this.consoleOffset = fs.statSync(logPath).size;
    this.consoleWatcher = watch(logPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    this.consoleWatcher.on('change', () => {
      try {
        const stat = fs.statSync(logPath);
        if (stat.size <= this.consoleOffset) return;
        const buf = Buffer.alloc(stat.size - this.consoleOffset);
        const fd = fs.openSync(logPath, 'r');
        fs.readSync(fd, buf, 0, buf.length, this.consoleOffset);
        fs.closeSync(fd);
        const enc = buf[1] === 0 ? 'utf16le' : 'utf-8';
        const text = buf.toString(enc);
        this.consoleOffset = stat.size;
        text.split('\n').filter(Boolean).forEach((line) => this.broadcastLine(line));
      } catch {}
    });
  }

  private stopConsoleWatcher(): void {
    if (this.consoleWatcher) {
      this.consoleWatcher.close();
      this.consoleWatcher = null;
    }
  }

  private broadcastLine(line: string): void {
    for (const client of this.sseClients) this.sendSSE(client.res, 'line', line);
  }

  private serveIndex(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SCUM Server Manager</title>
<style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;background:var(--bg);color:var(--text);overflow:hidden;height:100vh;font-size:14px}
.login-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;background:var(--bg)}
.login-box{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:32px;width:360px;text-align:center}
.login-box h1{font-size:20px;font-weight:700;margin-bottom:24px}
.login-box input{width:100%;padding:10px 12px;margin-bottom:12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:14px;outline:none}
.login-box input:focus{border-color:var(--accent)}
.login-box button{width:100%;padding:10px;background:#238636;border:none;border-radius:6px;color:#fff;font-size:14px;font-weight:500;cursor:pointer}
.login-box button:hover{background:#2ea043}
.login-box .error{color:var(--red);font-size:13px;margin-top:10px;display:none}
#dashboard{display:none;height:100vh;padding:24px}
.page-title{font-size:24px;font-weight:700;margin-bottom:24px;display:flex;align-items:center;gap:12px}
.badge{font-size:12px;padding:2px 10px;border-radius:12px;font-weight:600}
.badge.online{background:rgba(63,185,80,.15);color:var(--green);border:1px solid var(--green)}
.badge.offline{background:rgba(248,81,73,.15);color:var(--red);border:1px solid var(--red)}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:16px}
.stat-label{font-size:12px;color:var(--muted);font-weight:500}
.stat-value{font-size:28px;font-weight:600;line-height:1.2}
.stat-sub{font-size:12px;color:var(--muted);margin-top:2px}
.actions{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.btn{padding:8px 16px;border-radius:6px;border:1px solid var(--border);font-size:13px;font-weight:500;cursor:pointer;background:transparent;color:var(--text);display:inline-flex;align-items:center;gap:6px;font-family:inherit}
.btn:hover{background:rgba(255,255,255,.04)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-success{background:#238636;border-color:#238636;color:#fff}
.btn-success:hover{background:#2ea043}
.btn-danger{background:#da3633;border-color:#da3633;color:#fff}
.btn-danger:hover{background:#f85149}
.btn-warning{background:#9e6a03;border-color:#9e6a03;color:#fff}
.console-section{background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden}
.console-header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)}
.console-header .title{font-size:12px;font-weight:600;text-transform:uppercase;color:var(--muted)}
.console-header .status{font-size:11px;color:var(--green);display:flex;align-items:center;gap:4px}
.console-header .status .dot{width:6px;height:6px;border-radius:50%;background:var(--green)}
.console-box{height:300px;overflow:auto;padding:12px 16px;font-family:Consolas,monospace;font-size:12px;line-height:1.5}
.console-box .line{color:#c9d1d9;white-space:pre-wrap;word-break:break-all;padding:1px 0}
.console-box .line.connect{color:var(--green)}
.snack{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#238636;color:#fff;padding:10px 20px;border-radius:6px;font-size:13px;display:none;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.snack.error{background:#da3633}
</style>
</head>
<body>
<div id="loginPage" class="login-overlay">
  <div class="login-box">
    <h1>SCUM Server Manager</h1>
    <input type="text" id="loginUser" placeholder="Логин" autocomplete="username">
    <input type="password" id="loginPass" placeholder="Пароль" autocomplete="current-password">
    <button id="loginBtn" onclick="login()">Войти</button>
    <div class="error" id="loginError">Неверный логин или пароль</div>
  </div>
</div>
<div id="dashboard">
  <div class="page-title">
    <span>Дашборд</span>
    <span id="statusBadge" class="badge offline">ОФЛАЙН</span>
  </div>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Игроки</div>
      <div class="stat-value" id="statPlayers">0</div>
      <div class="stat-sub" id="statMax">макс 0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">ОЗУ</div>
      <div class="stat-value" id="statRam">0 <span style="font-size:14px;font-weight:400;color:var(--muted)">МБ</span></div>
      <div class="stat-sub">Использование памяти</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Время работы</div>
      <div class="stat-value" id="statUptime">-</div>
      <div class="stat-sub" id="statUptimeSub">Сервер остановлен</div>
    </div>
  </div>
  <div class="actions">
    <button class="btn btn-success" id="btnStart" onclick="action('start')">&#9654; Запустить</button>
    <button class="btn btn-danger" id="btnStop" onclick="action('stop')">&#9644; Остановить</button>
    <button class="btn btn-warning" id="btnRestart" onclick="action('restart')">&#8635; Перезапустить</button>
    <button class="btn" id="btnUpdate" onclick="update()">&#8681; Обновить</button>
  </div>
  <div class="console-section">
    <div class="console-header">
      <div class="title">Консоль сервера</div>
      <div class="status"><span class="dot"></span>В эфире</div>
    </div>
    <div class="console-box" id="console"></div>
  </div>
</div>
<div class="snack" id="snack"></div>
<script>
let updating=false;
let token=localStorage.getItem('wp_token');

function gid(id){return document.getElementById(id)}

function showLogin(){gid('loginPage').style.display='flex';gid('dashboard').style.display='none'}
function showDash(){gid('loginPage').style.display='none';gid('dashboard').style.display='block'}

async function login(){
  const user=gid('loginUser').value;
  const pass=gid('loginPass').value;
  const btn=gid('loginBtn');
  const err=gid('loginError');
  btn.disabled=true;btn.textContent='Вход...';err.style.display='none';
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user,password:pass})});
    const d=await r.json();
    if(d.token){token=d.token;localStorage.setItem('wp_token',token);showDash();initDashboard()}
    else{err.style.display='block';btn.disabled=false;btn.textContent='Войти'}
  }catch(e){err.textContent=e.message;err.style.display='block';btn.disabled=false;btn.textContent='Войти'}
}

function logout(){localStorage.removeItem('wp_token');token=null;showLogin()}

function authHeaders(){return token?{Authorization:'Bearer '+token}:{}}

async function fetchWithAuth(url,opts){
  opts=opts||{};opts.headers={...opts.headers,...authHeaders()};
  const r=await fetch(url,opts);if(r.status===401){logout();throw new Error('Сессия истекла')}
  return r;
}

function snack(msg,err){
  const el=gid('snack');
  el.textContent=msg;el.className='snack'+(err?' error':'');el.style.display='block';
  setTimeout(()=>el.style.display='none',3000);
}

function fmtUptime(ms){
  if(!ms)return'-';const s=Math.floor(ms/1000);const d=Math.floor(s/86400);
  const h=Math.floor((s%86400)/3600);const m=Math.floor((s%3600)/60);
  if(d>0)return d+'д '+h+'ч';return h+'ч '+m+'м';
}

async function action(type){
  document.querySelectorAll('.actions .btn').forEach(b=>b.disabled=true);
  try{
    const r=await fetchWithAuth('/api/'+type,{method:'POST'});
    const d=await r.json();
    if(d.error){snack(d.error,true)}else{snack('ОК')}
  }catch(e){snack(e.message,true)}
  document.querySelectorAll('.actions .btn').forEach(b=>b.disabled=false);fetchStatus();
}

async function update(){
  if(updating)return;updating=true;
  const btn=gid('btnUpdate');btn.disabled=true;btn.innerHTML='&#8635; Обновление...';
  try{
    const r=await fetchWithAuth('/api/update',{method:'POST'});
    const d=await r.json();
    if(d.error){snack(d.error,true)}else{snack('Обновление: '+d.result)}
  }catch(e){snack(e.message,true)}
  btn.innerHTML='&#8681; Обновить';btn.disabled=false;updating=false;
}

async function fetchStatus(){
  try{
    const r=await fetchWithAuth('/api/status');
    const s=await r.json();
    const badge=gid('statusBadge');
    badge.textContent=s.running?'ОНЛАЙН':'ОФЛАЙН';
    badge.className='badge '+(s.running?'online':'offline');
    gid('statPlayers').textContent=s.players||0;
    gid('statMax').textContent='макс '+(s.maxPlayers||0);
    gid('statRam').innerHTML=(s.memoryUsage||0)+' <span style="font-size:14px;font-weight:400;color:var(--muted)">МБ</span>';
    gid('statUptime').textContent=fmtUptime(s.uptime);
    gid('statUptimeSub').textContent=s.running?'Работает':'Сервер остановлен';
    gid('btnStart').disabled=s.running;
    gid('btnStop').disabled=!s.running;
    gid('btnRestart').disabled=false;
  }catch(e){}
}

function appendConsole(boxId, text, cls){
  const box=gid(boxId);
  if(!box)return;
  const line=document.createElement('div');
  line.className='line'+(cls?' '+cls:'');
  line.textContent=text;
  box.appendChild(line);
  box.scrollTop=box.scrollHeight;
  if(box.children.length>500)box.removeChild(box.firstChild);
}

function initDashboard(){
  const evtSource=new EventSource('/api/console?token='+token);
  evtSource.addEventListener('line',(e)=>{appendConsole('console',e.data)});
  evtSource.addEventListener('connected',()=>{appendConsole('console','[Веб-панель подключена]','connect')});
  setInterval(fetchStatus,5000);fetchStatus();
}

(function(){
  if(!token||token.length<10){showLogin();return}
  fetchWithAuth('/api/status').then(r=>{showDash();initDashboard()}).catch(()=>showLogin());
})();
</script>
</body>
</html>`;
