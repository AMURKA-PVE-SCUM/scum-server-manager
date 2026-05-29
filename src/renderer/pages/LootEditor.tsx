import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, Snackbar, Alert, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function LootEditor() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const cfg = await window.electronAPI.config.get();
      setConfig(cfg);
      if (!cfg.server.serverPath) return;
      const lootDir = `${cfg.server.serverPath}/SCUM/Saved/Config/WindowsServer`;
      const e = await window.electronAPI.files.list(lootDir);
      setFiles(e.filter((x: any) => x.name.endsWith('.ini') || x.name.endsWith('.json')).map((x: any) => x.name));
    } catch {}
  };
  const handleSelect = async (name: string) => {
    setSelected(name);
    if (!config?.server.serverPath) return;
    try {
      const c = await window.electronAPI.files.read(`${config.server.serverPath}/SCUM/Saved/Config/WindowsServer/${name}`);
      setContent(c);
    } catch { setContent(''); }
  };
  const handleSave = async () => {
    if (!selected || !config?.server.serverPath) return;
    try {
      await window.electronAPI.files.write(`${config.server.serverPath}/SCUM/Saved/Config/WindowsServer/${selected}`, content);
      setSnack({ open: true, message: t('loot', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('loot', 'title')}</Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 300 }}>
          <InputLabel>{t('economy', 'configFile')}</InputLabel>
          <Select value={selected} label={t('economy', 'configFile')} onChange={(e) => handleSelect(e.target.value)}>
            {files.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>
      {selected && (
        <Card><CardContent>
          <Box component="textarea" value={content} onChange={(e) => setContent(e.target.value)}
            sx={{ width: '100%', minHeight: 500, fontFamily: 'monospace', fontSize: 13, p: 2, bgcolor: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 1, resize: 'vertical', '&:focus': { outline: 'none', borderColor: '#58a6ff' } }} />
          <Button variant="contained" onClick={handleSave} sx={{ mt: 2 }}>{t('common', 'save')}</Button>
        </CardContent></Card>
      )}
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
