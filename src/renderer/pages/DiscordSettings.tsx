import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Switch, FormControlLabel, Snackbar, Alert } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function DiscordSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);
  const load = async () => { setConfig(await window.electronAPI.config.get()); };
  const update = (key: string, val: any) => setConfig((prev: any) => { const c = { ...prev }; c.discord[key] = val; return c; });
  const handleSave = async () => {
    setSaving(true);
    try { await window.electronAPI.config.set(config); setSnack({ open: true, message: t('discord', 'saved'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSaving(false);
  };
  const handleTest = async (key: string) => {
    try { await window.electronAPI.discord.test(config.discord[key]); setSnack({ open: true, message: t('discord', 'testSent'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  if (!config) return null;
  const fields = [
    { key: 'adminLogWebhook', label: t('discord', 'adminLogWebhook') },
    { key: 'chatWebhook', label: t('discord', 'chatWebhook') },
    { key: 'vehicleWebhook', label: t('discord', 'vehicleWebhook') },
    { key: 'loginWebhook', label: t('discord', 'loginWebhook') },
    { key: 'serverStatusWebhook', label: t('discord', 'serverStatusWebhook') },
  ];
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('discord', 'title')}</Typography>
      <Card><CardContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 600 }}>
          <FormControlLabel control={<Switch checked={config.discord.enabled} onChange={(e) => update('enabled', e.target.checked)} />} label={t('discord', 'enable')} />
          {fields.map((f) => (
            <Box key={f.key} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField fullWidth label={f.label} value={config.discord[f.key]} size="small" onChange={(e) => update(f.key, e.target.value)} />
              <Button variant="outlined" size="small" onClick={() => handleTest(f.key)}>{t('common', 'test')}</Button>
            </Box>
          ))}
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ alignSelf: 'flex-start' }}>{t('common', 'save')}</Button>
        </Box>
      </CardContent></Card>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
