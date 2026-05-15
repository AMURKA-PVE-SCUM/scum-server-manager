import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Grid, Switch, FormControlLabel, Snackbar, Alert,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from '../contexts/LanguageContext';

export function DiscordSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);

  const load = async () => { const cfg = await window.electronAPI.config.get(); setConfig(cfg.discord); };

  const update = (key: string, val: any) => setConfig((prev: any) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const cfg = await window.electronAPI.config.get();
      cfg.discord = config;
      await window.electronAPI.config.set(cfg);
      setSnack({ open: true, message: t('discord', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSaving(false);
  };

  const testWebhook = async (url: string) => {
    const ok = await window.electronAPI.discord.test(url);
    setSnack({ open: true, message: ok ? t('discord', 'testSuccess') : t('discord', 'testFailed'), severity: ok ? 'success' : 'error' });
  };

  const webhooks = [
    { key: 'loginWebhook', label: t('discord', 'loginWebhook') },
    { key: 'serverStatusWebhook', label: t('discord', 'serverStatusWebhook') },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('discord', 'title')}</Typography>
      {!config ? (
        <Typography color="text.secondary">{t('common', 'loading')}</Typography>
      ) : (
        <Card><CardContent>
          <FormControlLabel control={<Switch checked={config.enabled} onChange={(e) => update('enabled', e.target.checked)} />}
            label={t('discord', 'enable')} sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {webhooks.map((w) => (
              <Grid item xs={12} key={w.key}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField fullWidth label={w.label} value={config[w.key] || ''}
                    onChange={(e) => update(w.key, e.target.value)} size="small" disabled={!config.enabled} />
                  <Button variant="outlined" size="small" sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
                    onClick={() => testWebhook(config[w.key])} disabled={!config[w.key] || !config.enabled}>
                    {t('common', 'test')}
                  </Button>
                </Box>
              </Grid>
            ))}
          </Grid>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving} sx={{ mt: 2 }}>{t('common', 'save')}</Button>
        </CardContent></Card>
      )}
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
