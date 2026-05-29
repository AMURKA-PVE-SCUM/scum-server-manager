import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Grid, Switch, FormControlLabel, Snackbar, Alert, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from '../contexts/LanguageContext';

export function AppSettings() {
  const { t, lang, setLang } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);

  const load = async () => { setConfig(await window.electronAPI.config.get()); };

  const update = (section: string, key: string, val: any) => {
    setConfig((prev: any) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.config.set(config);
      setSnack({ open: true, message: t('settings', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSaving(false);
  };

  const selectFolder = async (section: string, key: string) => {
    const p = await window.electronAPI.dialog.selectFolder();
    if (p) update(section, key, p);
  };

  if (!config) return <Typography color="text.secondary">{t('common', 'loading')}</Typography>;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('settings', 'title')}</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>{t('settings', 'serverPaths')}</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField fullWidth label={t('settings', 'serverPath')} value={config.server.serverPath}
                  onChange={(e) => update('server', 'serverPath', e.target.value)} size="small" />
                <Button variant="outlined" onClick={() => selectFolder('server', 'serverPath')}>{t('common', 'browse')}</Button>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField fullWidth label={t('settings', 'steamCmdPath')} value={config.server.steamCmdPath}
                  onChange={(e) => update('server', 'steamCmdPath', e.target.value)} size="small" />
                <Button variant="outlined" onClick={() => selectFolder('server', 'steamCmdPath')}>{t('common', 'browse')}</Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>{t('settings', 'serverConfig')}</Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField fullWidth label={t('settings', 'serverPort')} type="number" value={config.server.serverPort}
                onChange={(e) => update('server', 'serverPort', parseInt(e.target.value))} size="small" />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label={t('settings', 'queryPort')} type="number" value={config.server.queryPort}
                onChange={(e) => update('server', 'queryPort', parseInt(e.target.value))} size="small" />
            </Grid>
            <Grid item xs={4}>
              <TextField fullWidth label={t('settings', 'maxPlayers')} type="number" value={config.server.maxPlayers}
                onChange={(e) => update('server', 'maxPlayers', parseInt(e.target.value) || 50)} size="small" />
            </Grid>
            <Grid item xs={4}>
              <FormControlLabel control={<Switch checked={config.server.fileOpenLog}
                onChange={(e) => update('server', 'fileOpenLog', e.target.checked)} />} label={t('settings', 'fileOpenLog')} />
            </Grid>
            <Grid item xs={4}>
              <FormControlLabel control={<Switch checked={config.server.autoStart}
                onChange={(e) => update('server', 'autoStart', e.target.checked)} />} label={t('settings', 'autoStart')} />
            </Grid>
            <Grid item xs={4}>
              <FormControlLabel control={<Switch checked={config.server.autoRestart}
                onChange={(e) => update('server', 'autoRestart', e.target.checked)} />} label={t('settings', 'autoRestart')} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>{t('settings', 'language')}</Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select value={lang} onChange={(e) => setLang(e.target.value as 'ru' | 'en')}>
              <MenuItem value="ru">{t('settings', 'langRu')}</MenuItem>
              <MenuItem value="en">{t('settings', 'langEn')}</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>
        {t('settings', 'saveAll')}
      </Button>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
