import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Chip,
  LinearProgress, TextField, Switch, FormControlLabel, Snackbar, Alert,
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const fetchStatus = useCallback(async () => {
    try { const s = await window.electronAPI.server.status(); setStatus(s); } catch {}
  }, []);

  const fetchConfig = useCallback(async () => {
    try { setConfig(await window.electronAPI.config.get()); } catch {}
  }, []);

  useEffect(() => {
    fetchStatus(); fetchConfig();
    const i = setInterval(fetchStatus, 5000);
    return () => clearInterval(i);
  }, [fetchStatus, fetchConfig]);

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

  const fmtUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}${t('common', 'hoursShort')} ${m}${t('common', 'minutesShort')} ${sec}${t('common', 'secondsShort')}`;
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('dashboard', 'title')}</Typography>
      <Grid container spacing={3}>
        {/* Server Control */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="h6">{t('dashboard', 'serverControl')}</Typography>
                <Chip label={status.running ? t('common', 'online') : t('common', 'offline')}
                  color={status.running ? 'success' : 'error'} size="small" />
                <Box sx={{ flex: 1 }} />

              </Box>
              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Button variant="contained" color="success" startIcon={<PlayArrowIcon />}
                  onClick={handleStart} disabled={status.running || loading}>{t('dashboard', 'start')}</Button>
                <Button variant="contained" color="error" startIcon={<StopIcon />}
                  onClick={handleStop} disabled={!status.running || loading}>{t('dashboard', 'stop')}</Button>
                <Button variant="outlined" startIcon={<RestartAltIcon />}
                  onClick={handleRestart} disabled={loading}>{t('dashboard', 'restart')}</Button>
              </Box>
              {loading && <LinearProgress sx={{ mb: 2 }} />}
              <Grid container spacing={2}>
                <Grid item xs={3}>
                  <Typography variant="caption" color="text.secondary">{t('common', 'status')}</Typography>
                  <Typography variant="body1">{status.running ? t('common', 'running') : t('common', 'stopped')}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="caption" color="text.secondary">{t('dashboard', 'uptime')}</Typography>
                  <Typography variant="body1">{status.running ? fmtUptime(status.uptime) : '-'}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="caption" color="text.secondary">{t('dashboard', 'players')}</Typography>
                  <Typography variant="body1">{status.players || 0}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="caption" color="text.secondary">{t('dashboard', 'ram')}</Typography>
                  <Typography variant="body1">{status.memoryUsage || 0} {t('dashboard', 'mb')}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions + Launch Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                {t('dashboard', 'quickActions')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button variant="outlined" size="small"
                  disabled={updating}
                  onClick={async () => {
                    setUpdating(true);
                    setUpdateLines([]);
                    setUpdateProgress({ state: 'connecting', percent: 0, detail: 'Starting update...' });
                    window.electronAPI.server.removeUpdateListeners();
                    window.electronAPI.server.onUpdateProgress((progress) => {
                      setUpdateProgress(progress);
                    });
                    window.electronAPI.server.onUpdateLine((line) => {
                      setUpdateLines((prev) => [...prev, line]);
                    });
                    try {
                      const result = await window.electronAPI.server.updateStream();
                      window.electronAPI.server.removeUpdateListeners();
                      if (result === 'already_up_to_date') {
                        setSnack({ open: true, message: t('dashboard', 'alreadyUpToDate'), severity: 'success' });
                      } else {
                        setSnack({ open: true, message: t('dashboard', 'updateStarted'), severity: 'success' });
                      }
                    } catch (e: any) {
                      window.electronAPI.server.removeUpdateListeners();
                      setSnack({ open: true, message: e.message || t('common', 'error'), severity: 'error' });
                    }
                    setUpdating(false);
                  }}>
                  {updating ? t('common', 'loading') : t('dashboard', 'updateServer')}
                </Button>

              </Box>
              {updating && updateProgress && (
                <Card variant="outlined" sx={{ mt: 2, bgcolor: '#0d1117' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: updateProgress.state === 'error' ? '#f85149' : '#58a6ff', fontWeight: 'bold' }}>
                          {updateProgress.detail || STATE_LABELS[updateProgress.state] || updateProgress.state}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#e6edf3', fontWeight: 'bold' }}>
                          {updateProgress.percent.toFixed(1)}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={updateProgress.percent}
                        color={updateProgress.state === 'error' ? 'error' : updateProgress.state === 'done' ? 'success' : 'primary'}
                        sx={{ height: 8, borderRadius: 1, bgcolor: '#21262d' }}
                      />
                      {(updateProgress.bytesDownloaded != null && updateProgress.bytesTotal != null && updateProgress.bytesTotal > 0) && (
                        <Typography variant="caption" sx={{ color: '#8b949e', mt: 0.5, display: 'block' }}>
                          {formatBytes(updateProgress.bytesDownloaded)} / {formatBytes(updateProgress.bytesTotal)}
                          {updateProgress.speed && ` (${updateProgress.speed})`}
                        </Typography>
                      )}
                    </Box>
                    {updateLines.length > 0 && (
                      <Box sx={{ maxHeight: 150, overflow: 'auto', fontFamily: 'monospace', fontSize: 11, borderTop: '1px solid #21262d', pt: 1 }}>
                        {updateLines.slice(-20).map((l, i) => (
                          <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.5, color: l.includes('ERROR') || l.includes('error') ? '#f85149' : l.includes('Success') ? '#3fb950' : '#8b949e' }}>
                            {l}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          {config && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>{t('dashboard', 'launchSettings')}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField fullWidth label={t('settings', 'serverPort')} type="number"
                    value={config.server.serverPort} size="small"
                    onChange={(e) => updateLaunch('serverPort', parseInt(e.target.value) || 2302)} />
                  <TextField fullWidth label={t('settings', 'maxPlayers')} type="number"
                    value={config.server.maxPlayers} size="small"
                    onChange={(e) => updateLaunch('maxPlayers', parseInt(e.target.value) || 50)} />
                  <FormControlLabel control={<Switch checked={config.server.fileOpenLog}
                    onChange={(e) => updateLaunch('fileOpenLog', e.target.checked)} />}
                    label={t('settings', 'fileOpenLog')} />
                  <FormControlLabel control={<Switch checked={config.server.noBattlEye}
                    onChange={(e) => updateLaunch('noBattlEye', e.target.checked)} />}
                    label={t('settings', 'noBattlEye')} />
                  <Button variant="contained" size="small" onClick={handleSaveLaunch} disabled={savingLaunch}>
                    {t('common', 'save')}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}