import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Snackbar, Alert } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslation } from '../contexts/LanguageContext';

interface JsonEditorProps {
  titleKey: string;
  filename: string;
  section?: string;
  rows?: number;
}

export function JsonEditor({ titleKey, filename, section = 'common', rows = 20 }: JsonEditorProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [filePath, setFilePath] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    if (!cfg.server.serverPath) return;
    const p = `${cfg.server.serverPath}/SCUM/Saved/Config/WindowsServer/${filename}`;
    setFilePath(p);
    try {
      const content = await window.electronAPI.files.read(p);
      setData(JSON.parse(content));
    } catch {
      setData(null);
    }
  };

  const handleSave = async () => {
    if (!data || !filePath) return;
    setSaving(true);
    try {
      await window.electronAPI.files.write(filePath, JSON.stringify(data, null, 2));
      setSnack({ open: true, message: t(section, 'saved'), severity: 'success' });
    } catch (e: any) {
      setSnack({ open: true, message: e.message, severity: 'error' });
    }
    setSaving(false);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{t(section, 'title')}</Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>{t('common', 'refresh')}</Button>
      </Box>
      <Card>
        <CardContent>
          {!filePath ? (
            <Typography color="text.secondary">{t('common', 'noData')}</Typography>
          ) : (
            <TextField
              fullWidth multiline rows={rows}
              value={data !== null ? JSON.stringify(data, null, 2) : t('common', 'noData')}
              onChange={(e) => {
                try { setData(JSON.parse(e.target.value)); } catch {}
              }}
              sx={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          )}
        </CardContent>
      </Card>
      <Button
        variant="contained" startIcon={<SaveIcon />}
        onClick={handleSave} disabled={saving || !data || !filePath}
        sx={{ mt: 2 }}
      >
        {t('common', 'save')}
      </Button>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}