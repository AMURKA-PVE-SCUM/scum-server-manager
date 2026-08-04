import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Grid, Switch, FormControlLabel, Snackbar, Alert } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function FTPSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    try { const s = await window.electronAPI.ftp.status(); setRunning(s.running); } catch {}
  };
  const update = (key: string, val: any) => setConfig((prev: any) => { const c = { ...prev }; c.ftp[key] = val; return c; });
  const handleSave = async () => {
    setSaving(true);
    try { await window.electronAPI.ftp.saveConfig(config.ftp); setSnack({ open: true, message: t('ftp', 'configSaved'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSaving(false);
  };
  const handleStart = async () => {
    try { const f = config.ftp; await window.electronAPI.ftp.start(f.port, f.username, f.password, f.pasvHost || undefined); setRunning(true); setSnack({ open: true, message: t('ftp', 'started').replace('{port}', f.port), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };
  const handleStop = async () => {
    try { await window.electronAPI.ftp.stop(); setRunning(false); setSnack({ open: true, message: t('ftp', 'stopped'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  if (!config) return null;
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('ftp', 'title')}</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card><CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('ftp', 'status')}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: running ? '#3fb950' : '#f85149' }} />
              <Typography>{running ? t('common', 'running') : t('common', 'stopped')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" color="success" onClick={handleStart} disabled={running}>{t('ftp', 'start')}</Button>
              <Button variant="contained" color="error" onClick={handleStop} disabled={!running}>{t('ftp', 'stop')}</Button>
            </Box>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card><CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('ftp', 'configuration')}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel control={<Switch checked={config.ftp.enabled} onChange={(e) => update('enabled', e.target.checked)} />} label={t('ftp', 'autoStart')} />
              <TextField fullWidth label={t('ftp', 'port')} type="number" value={config.ftp.port} size="small" onChange={(e) => update('port', parseInt(e.target.value) || 21)} />
              <TextField fullWidth label={t('ftp', 'username')} value={config.ftp.username} size="small" onChange={(e) => update('username', e.target.value)} />
              <TextField fullWidth label={t('ftp', 'password')} type="password" value={config.ftp.password} size="small" onChange={(e) => update('password', e.target.value)} />
              <TextField fullWidth label={t('ftp', 'pasvHost')} value={config.ftp.pasvHost || ''} size="small" onChange={(e) => update('pasvHost', e.target.value)} />
              <Button variant="contained" onClick={handleSave} disabled={saving}>{t('common', 'save')}</Button>
            </Box>
          </CardContent></Card>
        </Grid>
      </Grid>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
