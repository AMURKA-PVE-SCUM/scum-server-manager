import React, { useState, useEffect, useCallback } from 'react';
import { Box, Card, CardContent, Typography, Button, TextField, Grid, Snackbar, Alert, Chip, Switch, FormControlLabel } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from '../contexts/LanguageContext';

export function WebPanelPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const checkStatus = useCallback(async () => {
    try { const s = await window.electronAPI.webPanel.status(); setRunning(s.running); } catch {}
  }, []);

  useEffect(() => { load(); checkStatus(); }, [checkStatus]);

  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg.webPanel);
  };

  const update = (key: string, val: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    try {
      await window.electronAPI.webPanel.saveConfig(config);
      setSnack({ open: true, message: 'Web Panel saved', severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleStart = async () => {
    try {
      await window.electronAPI.webPanel.saveConfig(config);
      await window.electronAPI.webPanel.start();
      setRunning(true);
      setSnack({ open: true, message: `Web Panel started on port ${config.port}`, severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleStop = async () => {
    try { await window.electronAPI.webPanel.stop(); setRunning(false); setSnack({ open: true, message: 'Web Panel stopped', severity: 'success' }); }
    catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('nav', 'webPanel')}</Typography>
      {config && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Typography variant="h6">{t('nav', 'webPanel')}</Typography>
              <Chip label={running ? t('common', 'running') : t('common', 'stopped')} color={running ? 'success' : 'error'} size="small" />
            </Box>
            {running && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#161b22', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ color: '#8b949e' }}>{t('common', 'status')}:</Typography>
                <Button size="small" variant="outlined" endIcon={<OpenInNewIcon />}
                  onClick={() => window.open(`http://localhost:${config.port}`, '_blank')}>
                  http://localhost:{config.port}
                </Button>
              </Box>
            )}
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={4}>
                <TextField fullWidth label={t('ftp', 'port')} type="number" value={config.port}
                  onChange={(e) => update('port', parseInt(e.target.value) || 8080)} size="small" disabled={running} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth label={t('ftp', 'username')} value={config.username}
                  onChange={(e) => update('username', e.target.value)} size="small" disabled={running} />
              </Grid>
              <Grid item xs={4}>
                <TextField fullWidth label={t('ftp', 'password')} type="password" value={config.password}
                  onChange={(e) => update('password', e.target.value)} size="small" disabled={running} />
              </Grid>
              <Grid item xs={4}>
                <FormControlLabel control={<Switch checked={config.enabled}
                  onChange={(e) => update('enabled', e.target.checked)} />} label={t('ftp', 'autoStart')} />
              </Grid>
              <Grid item xs={8} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button variant="contained" color="success" startIcon={<PlayArrowIcon />}
                  onClick={handleStart} disabled={running}>{t('dashboard', 'start')}</Button>
                <Button variant="contained" color="error" startIcon={<StopIcon />}
                  onClick={handleStop} disabled={!running}>{t('dashboard', 'stop')}</Button>
                <Button variant="outlined" startIcon={<SaveIcon />} onClick={handleSave}>{t('common', 'save')}</Button>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" sx={{ color: '#8b949e' }}>
                  Web interface for server management. Access via browser at <code>http://YOUR_IP:{config.port}</code>
                  {config.username && <> with credentials <code>{config.username}:****</code></>}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
