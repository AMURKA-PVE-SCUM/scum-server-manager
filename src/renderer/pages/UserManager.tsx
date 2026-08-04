import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Tabs, Tab, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useTranslation } from '../contexts/LanguageContext';

export function UserManager() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [admins, setAdmins] = useState<string[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [banned, setBanned] = useState<string[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [dialog, setDialog] = useState({ open: false, steamId: '' });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    if (!cfg.server.serverPath) return;
    for (const [f, setter] of [['AdminUsers.ini', setAdmins], ['WhitelistedUsers.ini', setWhitelist], ['BannedUsers.ini', setBanned]] as const) {
      try { const d = await window.electronAPI.files.read(`${cfg.server.serverPath}/SCUM/Saved/Config/WindowsServer/${f}`); setter(d.split('\n').map((l: string) => l.trim()).filter(Boolean)); } catch {}
    }
  };

  const saveList = async (file: string, list: string[]) => {
    await window.electronAPI.files.write(`${config.server.serverPath}/SCUM/Saved/Config/WindowsServer/${file}`, list.join('\n'));
  };

  const lists = [admins, whitelist, banned];
  const setters = [setAdmins, setWhitelist, setBanned];
  const files = ['AdminUsers.ini', 'WhitelistedUsers.ini', 'BannedUsers.ini'];
  const labels = [t('users', 'admins'), t('users', 'whitelist'), t('users', 'banned')];

  const addUser = async () => {
    try {
      const list = lists[tab]; const setter = setters[tab]; const file = files[tab];
      setter([...list, dialog.steamId]);
      await saveList(file, [...list, dialog.steamId]);
      setDialog({ open: false, steamId: '' });
      setSnack({ open: true, message: t('users', 'userAdded'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const removeUser = async (steamId: string) => {
    try {
      const list = lists[tab]; const setter = setters[tab]; const file = files[tab];
      setter(list.filter((u: string) => u !== steamId));
      await saveList(file, list.filter((u: string) => u !== steamId));
      setSnack({ open: true, message: t('users', 'userRemoved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('users', 'title')}</Typography>
      <Card><CardContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          {labels.map((l, i) => <Tab key={i} label={`${l} (${lists[i].length})`} />)}
        </Tabs>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ ...dialog, open: true })} sx={{ mb: 2 }}>
          {t('users', 'addUser')}
        </Button>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('users', 'steamId')}</TableCell>
                <TableCell align="right">{t('common', 'actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lists[tab].map((id: string) => (
                <TableRow key={id}>
                  <TableCell>{id}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="error" onClick={() => removeUser(id)}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {lists[tab].length === 0 && (
                <TableRow><TableCell colSpan={2} align="center">{t('users', 'noUsers')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent></Card>

      <Dialog open={dialog.open} onClose={() => setDialog({ ...dialog, open: false })}>
        <DialogTitle>{t('users', 'addUser')}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label={t('users', 'steamId')} value={dialog.steamId}
            onChange={(e) => setDialog({ ...dialog, steamId: e.target.value })} sx={{ mt: 1 }} />
          <Typography variant="caption" sx={{ color: '#8b949e', display: 'block', mt: 1 }} dangerouslySetInnerHTML={{ __html: t('users', 'flagInfo') }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog({ ...dialog, open: false })}>{t('common', 'cancel')}</Button>
          <Button onClick={addUser} variant="contained" disabled={!dialog.steamId}>{t('common', 'add')}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
