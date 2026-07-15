import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, TextField, Table, TableHead, TableRow, TableCell, TableBody, Snackbar, Alert, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Select, MenuItem, OutlinedInput, FormControl, InputLabel } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

const ADMIN_FLAGS = ['SetGodMode', 'RestartServer'];

export function PlayersPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [adminLines, setAdminLines] = useState<{steamId: string; flags: string[]}[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [editFlags, setEditFlags] = useState<string[]>([]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' });

  useEffect(() => { loadAll(); }, []);

  const getAdminPath = async () => {
    if (config) return `${config.server.serverPath}/SCUM/Saved/Config/WindowsServer/AdminUsers.ini`;
    const cfg = await window.electronAPI.config.get(); setConfig(cfg);
    return `${cfg.server.serverPath}/SCUM/Saved/Config/WindowsServer/AdminUsers.ini`;
  };

  const loadAll = async () => {
    try {
      const initRes = await window.electronAPI.db.init();
      if (initRes && initRes.error) { setSnack({ open: true, message: initRes.error, severity: 'error' }); return; }
      const p = await window.electronAPI.db.getPlayers();
      setPlayers(p || []);
      if (!p || p.length === 0) setSnack({ open: true, message: t('players', 'noPlayers'), severity: 'warning' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    try { await loadAdmins(); } catch {}
  };

  const loadAdmins = async () => {
    try {
      const p = await getAdminPath(); const c = await window.electronAPI.files.read(p);
      const lines: {steamId: string; flags: string[]}[] = [];
      c.split('\n').filter(Boolean).forEach((line: string) => {
        const m = line.match(/^(\d+)(?:\[([^\]]+)\])?$/);
        if (m) lines.push({ steamId: m[1], flags: m[2] ? m[2].split(',').map((s: string) => s.trim()).filter(Boolean) : [] });
      });
      setAdminLines(lines);
    } catch { setAdminLines([]); }
  };

  const getAdminSteamIds = () => adminLines.map((a) => a.steamId);
  const isAdmin = (sid: string) => getAdminSteamIds().includes(sid);

  const handleAddAdmin = async (sid: string, name: string, flags: string[]) => {
    try {
      if (isAdmin(sid)) { setSnack({ open: true, message: t('players', 'alreadyAdmin').replace('{name}', name), severity: 'warning' }); return; }
      const p = await getAdminPath(); let c = '';
      try { c = await window.electronAPI.files.read(p); } catch {}
      const line = flags.length > 0 ? `${sid}[${flags.join(',')}]` : sid;
      if (c.trim()) c += '\n'; c += line;
      await window.electronAPI.files.write(p, c);
      setAdminLines([...adminLines, { steamId: sid, flags }]);
      setSnack({ open: true, message: t('players', 'adminAdded').replace('{name}', name), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleRemoveAdmin = async (sid: string, name: string) => {
    try {
      const p = await getAdminPath();
      let c = '';
      try { c = await window.electronAPI.files.read(p); } catch {}
      const lines = c.split('\n').filter((l: string) => !l.match(/^(\d+)(?:\[[^\]]+\])?$/) || !l.startsWith(sid));
      await window.electronAPI.files.write(p, lines.join('\n'));
      setAdminLines(adminLines.filter((a) => a.steamId !== sid));
      setSnack({ open: true, message: t('players', 'adminRemoved').replace('{name}', name), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const filtered = players.filter((p: any) => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.steamId?.includes(search));
  const handleSelect = async (p: any) => {
    setSelected(p);
    const existing = adminLines.find((a) => a.steamId === p.steamId);
    setEditFlags(existing?.flags || []);
    try {
      const w = await window.electronAPI.db.getWallet(p.steamId);
      const a = await window.electronAPI.db.getAttributes(p.steamId);
      const s = await window.electronAPI.db.getSkills(p.steamId);
      setDetails({ wallet: w, attributes: a, skills: s });
    } catch {}
  };

  const handleDialogAdminAction = () => {
    if (!selected) return;
    if (isAdmin(selected.steamId)) handleRemoveAdmin(selected.steamId, selected.name);
    else handleAddAdmin(selected.steamId, selected.name, editFlags);
    setSelected(null); setDetails(null);
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('players', 'title')}</Typography>
      <TextField fullWidth placeholder={`${t('common', 'search')}...`} value={search} onChange={(e) => setSearch(e.target.value)} size="small" sx={{ mb: 2, maxWidth: 400 }} />
      <Card><CardContent sx={{ p: 0 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>{t('common', 'name')}</TableCell><TableCell>{t('players', 'steamId')}</TableCell><TableCell>{t('players', 'fame')}</TableCell><TableCell>{t('players', 'money')}</TableCell><TableCell>{t('players', 'lastLogin')}</TableCell><TableCell>{t('players', 'admin')}</TableCell></TableRow></TableHead>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} align="center">{t('players', 'noPlayers')}</TableCell></TableRow>}
            {filtered.map((p: any) => (
              <TableRow key={p.steamId} hover sx={{ cursor: 'pointer' }} onClick={() => handleSelect(p)}>
                <TableCell>{p.name}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.steamId}</TableCell>
                <TableCell>{p.famePoints}</TableCell>
                <TableCell>{p.walletBalance}</TableCell>
                <TableCell>{p.lastLogin ? new Date(p.lastLogin * 1000).toLocaleString() : '-'}</TableCell>
                <TableCell>
                  {isAdmin(p.steamId) ? (
                    <Chip label={t('players', 'admin')} size="small" color="primary" variant="outlined" />
                  ) : (
                    <Button size="small" variant="outlined" color="success" onClick={(e) => { e.stopPropagation(); handleSelect(p); }}>+</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={!!selected} onClose={() => { setSelected(null); setDetails(null); }} maxWidth="md" fullWidth>
        <DialogTitle>{selected?.name} ({selected?.steamId})</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {!isAdmin(selected?.steamId) && (
              <FormControl size="small" fullWidth>
                <InputLabel>{t('players', 'adminFlags')}</InputLabel>
                <Select multiple value={editFlags} onChange={(e) => setEditFlags(e.target.value as string[])} input={<OutlinedInput label={t('players', 'adminFlags')} />} renderValue={(selected) => selected.join(', ')}>
                  {ADMIN_FLAGS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant={isAdmin(selected?.steamId) ? 'outlined' : 'contained'} color={isAdmin(selected?.steamId) ? 'error' : 'primary'} onClick={handleDialogAdminAction}>
                {isAdmin(selected?.steamId) ? t('players', 'removeAdmin') : t('players', 'addAdmin')}
              </Button>
            </Box>
            {details && (<>
              <Typography variant="subtitle2">{t('players', 'wallet')}</Typography>
              <Typography>{t('players', 'money')}: {details.wallet?.walletBalance} | {t('players', 'gold')}: {details.wallet?.goldBalance} | {t('players', 'fame')}: {details.wallet?.famePoints}</Typography>
              <Typography variant="subtitle2">{t('players', 'attributes')}</Typography>
              {details.attributes?.error ? <Typography color="error">{details.attributes.error}</Typography> : (
                <Typography>{t('players', 'strength')}: {details.attributes?.strength?.toFixed(1)} {t('players', 'constitution')}: {details.attributes?.constitution?.toFixed(1)} {t('players', 'dexterity')}: {details.attributes?.dexterity?.toFixed(1)} {t('players', 'intelligence')}: {details.attributes?.intelligence?.toFixed(1)}</Typography>
              )}
              <Typography variant="subtitle2">{t('players', 'skills')} ({details.skills?.length || 0})</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                {details.skills?.map((s: any, i: number) => (
                  <Box key={i} sx={{ bgcolor: '#161b22', p: 1, borderRadius: 1, fontSize: 13 }}>
                    <Typography variant="caption" sx={{ color: '#8b949e' }}>{s.skillName}</Typography>
                    <Typography>Lvl {s.skillLevel} (Exp: {s.skillExperience})</Typography>
                  </Box>
                ))}
              </Box>
            </>)}
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => { setSelected(null); setDetails(null); }}>{t('common', 'close')}</Button></DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
