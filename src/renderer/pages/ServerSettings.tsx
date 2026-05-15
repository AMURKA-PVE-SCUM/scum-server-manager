import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Grid, Snackbar, Alert,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from '../contexts/LanguageContext';

export function ServerSettings() {
  const { t } = useTranslation();
  const [iniData, setIniData] = useState<Record<string, any>>({});
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    if (!cfg.server.serverPath) return;
    try {
      const d = await window.electronAPI.files.read(`${cfg.server.serverPath}/SCUM/Saved/Config/WindowsServer/ServerSettings.ini`);
      const r: Record<string, any> = {};
      let s = '';
      d.split('\n').forEach((l: string) => {
        const t = l.trim();
        if (t.startsWith('[') && t.endsWith(']')) { s = t.slice(1, -1); r[s] = {}; }
        else if (s && t.includes('=')) { const [k, ...v] = t.split('='); r[s][k.trim()] = v.join('=').trim(); }
      });
      setIniData(r);
    } catch {}
  };

  const stringify = (d: Record<string, any>) => {
    let r = '';
    for (const [s, keys] of Object.entries(d)) { r += `[${s}]\n`; for (const [k, v] of Object.entries(keys as Record<string, string>)) r += `${k}=${v}\n`; r += '\n'; }
    return r;
  };

  const handleSave = async () => {
    if (!config?.server.serverPath) return;
    setSaving(true);
    try {
      await window.electronAPI.files.write(`${config.server.serverPath}/SCUM/Saved/Config/WindowsServer/ServerSettings.ini`, stringify(iniData));
      setSnack({ open: true, message: t('serverSettings', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSaving(false);
  };

  const update = (section: string, key: string, val: string) => {
    setIniData((prev: any) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('serverSettings', 'title')}</Typography>
      {config && !config.server.serverPath && (
        <Alert severity="warning" sx={{ mb: 2 }}>{t('install', 'serverPathNotConfigured')}</Alert>
      )}
      {Object.entries(iniData).map(([section, keys]) => (
        <Card key={section} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>{section}</Typography>
            <Grid container spacing={2}>
              {Object.entries(keys as Record<string, string>).map(([k, v]) => (
                <Grid item xs={12} sm={6} md={4} key={k}>
                  <TextField fullWidth label={k} value={v} onChange={(e) => update(section, k, e.target.value)} size="small" />
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      ))}
      <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving || !config?.server.serverPath}>
        {t('serverSettings', 'save')}
      </Button>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
