import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, Switch, FormControlLabel,
  LinearProgress, Snackbar, Alert,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useTranslation } from '../contexts/LanguageContext';

interface UpdateProgress {
  state: string;
  percent: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  speed?: string;
  detail?: string;
}

const STATE_LABELS: Record<string, string> = {
  connecting: 'Connecting to Steam...',
  preallocating: 'Preallocating...',
  downloading: 'Downloading...',
  verifying: 'Verifying...',
  committing: 'Committing...',
  finalizing: 'Finalizing...',
  done: 'Complete',
  error: 'Error',
};

const CHART_COLORS = {
  online: '#22c55e',
  ram: '#3b82f6',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusDot({ running }: { running: boolean }) {
  const color = running ? '#22c55e' : '#ef4444';
  return (
    <span
      style={{
        width: 10, height: 10, borderRadius: '50%', background: color,
        boxShadow: `0 0 8px ${color}`, display: 'inline-block', flexShrink: 0,
      }}
    />
  );
}

function StatCard({
  label, value, color, delta, icon, index,
}: {
  label: string; value: React.ReactNode; color?: string; delta?: React.ReactNode; icon?: React.ReactNode; index: number;
}) {
  return (
    <Box
      sx={{
        background: '#0a0a0c', border: '1px solid #21262d', borderRadius: 2,
        p: 2, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0,
        transition: 'border-color .15s ease, transform .15s ease',
        animation: `fadeUp .3s ease ${index * 0.05}s both`,
        '&:hover': { transform: 'translateY(-2px)', borderColor: '#30363d' },
        '@keyframes fadeUp': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, fontWeight: 500, color: '#8b949e' }}>
        {icon && <span style={{ color: color ?? '#8b949e', display: 'inline-flex' }}>{icon}</span>}
        {label}
      </Box>
      <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: color ?? '#e6edf3', whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
      {delta && <Box sx={{ fontSize: 12, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 0.5 }}>{delta}</Box>}
    </Box>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [status, setStatus] = useState<any>({ running: false, players: 0, uptime: 0 });
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateLines, setUpdateLines] = useState<string[]>([]);
  const [savingLaunch, setSavingLaunch] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<any[]>([]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const lineColor = (line: string) => {
    if (/error|failed|fatal|exception/i.test(line)) return '#f85149';
    if (/success|logged in|up to date/i.test(line)) return '#3fb950';
    return '#8b949e';
  };

  const fetchStatus = useCallback(async () => {
    try {
      const s = await window.electronAPI.server.status();
      setStatus(s);
    } catch {}
  }, []);

  const fetchConfig = useCallback(async () => {
    try { setConfig(await window.electronAPI.config.get()); } catch {}
  }, []);

  const fetchOnlinePlayers = useCallback(async () => {
    try {
      if (!config || !config.webPanel?.port) return;
      const r = await fetch(`http://localhost:${config.webPanel.port}/api/players/online`);
      const data = await r.json();
      if (data.players) setOnlinePlayers(data.players);
    } catch {}
  }, [config]);

  useEffect(() => {
    fetchStatus(); fetchConfig();
    const i = setInterval(fetchStatus, 5000);
    return () => clearInterval(i);
  }, [fetchStatus, fetchConfig]);

  useEffect(() => {
    const i = setInterval(fetchOnlinePlayers, 10000);
    fetchOnlinePlayers();
    return () => clearInterval(i);
  }, [fetchOnlinePlayers]);

  const handleStart = async () => {
    setLoading(true);
    try { await window.electronAPI.server.start(); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    await fetchStatus(); setLoading(false);
  };
  const handleStop = async () => {
    setLoading(true);
    try { await window.electronAPI.server.stop(); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    await fetchStatus(); setLoading(false);
  };
  const handleRestart = async () => {
    setLoading(true);
    try { await window.electronAPI.server.restart(); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    await fetchStatus(); setLoading(false);
  };

  const updateLaunch = (key: string, val: any) => {
    setConfig((prev: any) => ({ ...prev, server: { ...prev.server, [key]: val } }));
  };

  const handleSaveLaunch = async () => {
    setSavingLaunch(true);
    try {
      await window.electronAPI.config.set(config);
      setSnack({ open: true, message: t('settings', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSavingLaunch(false);
  };

  const startUpdate = async () => {
    setUpdating(true);
    setUpdateLines([]);
    setUpdateProgress({ state: 'connecting', percent: 0, detail: 'Starting update...' });
    window.electronAPI.server.removeUpdateListeners();
    window.electronAPI.server.onUpdateProgress((progress) => setUpdateProgress(progress));
    window.electronAPI.server.onUpdateLine((line) => setUpdateLines((prev) => [...prev, line]));
    try {
      const result = await window.electronAPI.server.updateStream();
      window.electronAPI.server.removeUpdateListeners();
      if (result === 'already_up_to_date') setSnack({ open: true, message: t('dashboard', 'alreadyUpToDate'), severity: 'success' });
      else setSnack({ open: true, message: t('dashboard', 'updateStarted'), severity: 'success' });
    } catch (e: any) {
      window.electronAPI.server.removeUpdateListeners();
      setSnack({ open: true, message: e.message || t('common', 'error'), severity: 'error' });
    }
    setUpdating(false);
  };

  const fmtUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}${t('common', 'hoursShort')} ${m}${t('common', 'minutesShort')} ${sec}${t('common', 'secondsShort')}`;
  };

  const running = status.running;

  const launchArgs = useMemo(() => {
    if (!config?.server) return [];
    const s = config.server;
    return [
      { key: 'Name', val: s.serverName || '—' },
      { key: 'Port', val: s.serverPort },
      { key: 'QueryPort', val: s.queryPort },
      { key: 'MaxPlayers', val: s.maxPlayers },
      { key: '-NoBattlEye', val: s.noBattlEye ? 'ON' : 'OFF' },
      { key: '-fileopenlog', val: s.fileOpenLog ? 'ON' : 'OFF' },
    ];
  }, [config]);

  return (
    <Box>
      {/* Server Control — top */}
      <Box sx={{ background: '#0a0a0c', border: '1px solid #21262d', borderRadius: 2, p: 2, mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{config?.server?.serverName || t('dashboard', 'title')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: '#8b949e' }}>
            <StatusDot running={running} />
            <span>{running ? t('common', 'online') : t('common', 'offline')}</span>
            {running && <span>· {t('dashboard', 'uptimeShort')}: {fmtUptime(status.uptime)}</span>}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button variant="contained" color="success" startIcon={<PlayArrowIcon />}
            onClick={handleStart} disabled={running || loading}>{t('dashboard', 'start')}</Button>
          <Button variant="contained" color="error" startIcon={<StopIcon />}
            onClick={handleStop} disabled={!running || loading}>{t('dashboard', 'stop')}</Button>
          <Button variant="outlined" startIcon={<RestartAltIcon />}
            onClick={handleRestart} disabled={loading}>{t('dashboard', 'restart')}</Button>
        </Box>
        {loading && <LinearProgress sx={{ mt: 1.5, height: 4, borderRadius: 1 }} />}
      </Box>

      {/* Stat row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 1.5 }}>
        <StatCard
          index={0}
          label={t('dashboard', 'players')}
          color={CHART_COLORS.online}
          value={`${status.players || 0} / ${status.maxPlayers || config?.server?.maxPlayers || 0}`}
          delta={<span>{t('dashboard', 'onlinePlayers')}</span>}
        />
        <StatCard index={1} label={t('dashboard', 'ram')} color={CHART_COLORS.ram}
          value={`${Math.round(status.memoryUsage ?? 0)}`} delta={<span>{t('dashboard', 'mb')}</span>} />
        <StatCard index={2} label={t('dashboard', 'cpu')} color="#ec4899"
          value={`${status.cpuUsage?.toFixed ? status.cpuUsage.toFixed(0) : status.cpuUsage ?? 0}`}
          delta={<span>%</span>} />
        <StatCard index={3} label={t('dashboard', 'fps')} color="#f59e0b"
          value={`${Math.round(status.fps ?? 0)}`} delta={<span>FPS</span>} />
      </Box>

      {/* Main 3-col grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, alignItems: 'start' }}>
        {/* Update */}
        <Box sx={{ background: '#0a0a0c', border: '1px solid #21262d', borderRadius: 2, p: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1 }}>{t('dashboard', 'updateServer')}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12, mb: 1.5 }}>
            {launchArgs.map((a) => (
              <Box key={a.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: '#8b949e' }}>{a.key}</span>
                <span style={{ fontWeight: 600, fontFamily: "'Consolas', monospace", fontSize: 11 }}>{a.val}</span>
              </Box>
            ))}
          </Box>
          <Button size="small" variant="outlined" onClick={startUpdate} disabled={updating}>
            {updating ? t('common', 'loading') : t('dashboard', 'updateServer')}
          </Button>
          {updating && updateProgress && (
            <Box sx={{ mt: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: updateProgress.state === 'error' ? '#f85149' : '#58a6ff', fontWeight: 'bold' }}>
                  {updateProgress.detail || STATE_LABELS[updateProgress.state] || updateProgress.state}
                </Typography>
                <Typography variant="caption" sx={{ color: '#e6edf3', fontWeight: 'bold' }}>{updateProgress.percent.toFixed(1)}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={updateProgress.percent}
                color={updateProgress.state === 'error' ? 'error' : updateProgress.state === 'done' ? 'success' : 'primary'}
                sx={{ height: 6, borderRadius: 1, bgcolor: '#21262d' }} />
              {updateProgress.bytesDownloaded != null && updateProgress.bytesTotal != null && updateProgress.bytesTotal > 0 && (
                <Typography variant="caption" sx={{ color: '#8b949e', mt: 0.5, display: 'block' }}>
                  {formatBytes(updateProgress.bytesDownloaded)} / {formatBytes(updateProgress.bytesTotal)}
                  {updateProgress.speed && ` (${updateProgress.speed})`}
                </Typography>
              )}
              {updateLines.length > 0 && (
                <Box sx={{ maxHeight: 90, overflow: 'auto', fontFamily: "'Consolas', monospace", fontSize: 11, borderTop: '1px solid #21262d', mt: 1, pt: 1 }}>
                  {updateLines.slice(-20).map((l, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.5, color: lineColor(l) }}>{l}</Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Launch settings (editable) */}
        {config && (
          <Box sx={{ background: '#0a0a0c', border: '1px solid #21262d', borderRadius: 2, p: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5 }}>{t('dashboard', 'launchSettings')}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField size="small" label={t('settings', 'serverName')} fullWidth
                value={config.server.serverName} onChange={(e) => updateLaunch('serverName', e.target.value)} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextField size="small" label={t('settings', 'serverPort')} type="number"
                  value={config.server.serverPort} onChange={(e) => updateLaunch('serverPort', parseInt(e.target.value) || 2302)} />
                <TextField size="small" label={t('settings', 'queryPort')} type="number"
                  value={config.server.queryPort} onChange={(e) => updateLaunch('queryPort', parseInt(e.target.value) || 2502)} />
              </Box>
              <TextField size="small" label={t('settings', 'maxPlayers')} type="number"
                value={config.server.maxPlayers} onChange={(e) => updateLaunch('maxPlayers', parseInt(e.target.value) || 50)} />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControlLabel control={<Switch size="small" checked={config.server.fileOpenLog} onChange={(e) => updateLaunch('fileOpenLog', e.target.checked)} />} label={t('settings', 'fileOpenLog')} />
                <FormControlLabel control={<Switch size="small" checked={config.server.noBattlEye} onChange={(e) => updateLaunch('noBattlEye', e.target.checked)} />} label={t('settings', 'noBattlEye')} />
              </Box>
              <Button size="small" variant="contained" onClick={handleSaveLaunch} disabled={savingLaunch}>{t('common', 'save')}</Button>
            </Box>
          </Box>
        )}

        {/* Online players */}
        <Box sx={{ background: '#0a0a0c', border: '1px solid #21262d', borderRadius: 2, p: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1 }}>{t('dashboard', 'onlinePlayers')} ({onlinePlayers.length})</Typography>
          {onlinePlayers.length === 0 && <Typography sx={{ color: '#8b949e', fontSize: 12, p: 1 }}>{t('common', 'noData')}</Typography>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {onlinePlayers.slice(0, 7).map((p, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '6px 8px', borderRadius: 1.5, transition: 'background .15s', '&:hover': { background: '#161b22' } }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0, background: p.avatarColor || '#58a6ff' }}>
                  {(p.name || '?').slice(0, 1)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</Box>
                  <Box sx={{ fontSize: 11, color: '#8b949e' }}>Lvl {p.level ?? '—'} · {p.ping ?? '—'}ms</Box>
                </Box>
                {p.gold != null && <Box sx={{ color: '#58a6ff', fontSize: 12, fontWeight: 600 }}>{p.gold} ◎</Box>}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}