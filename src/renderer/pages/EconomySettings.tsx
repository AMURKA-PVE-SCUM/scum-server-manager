import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, Snackbar, Alert } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function EconomySettings() {
  const { t } = useTranslation();
  const [data, setData] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const cfg = await window.electronAPI.config.get();
      const p = cfg.server.serverPath;
      if (!p) return;
      const d = await window.electronAPI.files.read(`${p}/SCUM/Saved/Config/WindowsServer/ServerSettings.ini`);
      setData(d);
    } catch {}
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const cfg = await window.electronAPI.config.get();
      await window.electronAPI.files.write(`${cfg.server.serverPath}/SCUM/Saved/Config/WindowsServer/ServerSettings.ini`, data);
      setSnack({ open: true, message: t('economy', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setSaving(false);
  };
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('economy', 'title')}</Typography>
      <Card><CardContent>
        <Box component="textarea" value={data} onChange={(e) => setData(e.target.value)}
          sx={{ width: '100%', minHeight: 400, fontFamily: 'monospace', fontSize: 13, p: 2, bgcolor: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 1, resize: 'vertical', '&:focus': { outline: 'none', borderColor: '#58a6ff' } }} />
        <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ mt: 2 }}>{t('common', 'save')}</Button>
      </CardContent></Card>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
