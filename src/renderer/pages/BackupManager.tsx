import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, Snackbar, Alert, Table, TableHead, TableRow, TableCell, TableBody, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function BackupManager() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    try { const b = await window.electronAPI.backup.list(); setBackups(b); } catch {}
  };
  const handleCreate = async () => {
    setBackingUp(true);
    try { await window.electronAPI.backup.create(); await load(); setSnack({ open: true, message: t('backups', 'backupCreated'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setBackingUp(false);
  };
  const handleRestore = async () => {
    if (!restoreId) return;
    try { await window.electronAPI.backup.restore(restoreId); setSnack({ open: true, message: t('backups', 'backupRestored'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setRestoreId(null);
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try { await window.electronAPI.backup.delete(deleteId); await load(); setSnack({ open: true, message: t('backups', 'backupDeleted'), severity: 'success' }); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setDeleteId(null);
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('backups', 'title')}</Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button variant="contained" onClick={handleCreate} disabled={backingUp}>{backingUp ? `${t('common', 'loading')}` : t('backups', 'createBackup')}</Button>
      </Box>
      <Card><CardContent sx={{ p: 0 }}>
        <Table>
          <TableHead><TableRow>
            <TableCell>{t('common', 'name')}</TableCell>
            <TableCell>{t('common', 'date')}</TableCell>
            <TableCell>{t('common', 'type')}</TableCell>
            <TableCell>{t('common', 'actions')}</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {backups.length === 0 && <TableRow><TableCell colSpan={4} align="center">{t('backups', 'noBackups')}</TableCell></TableRow>}
            {backups.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.name}</TableCell>
                <TableCell>{new Date(b.timestamp).toLocaleString()}</TableCell>
                <TableCell>{b.type}</TableCell>
                <TableCell>
                  <Button size="small" color="warning" onClick={() => setRestoreId(b.id)}>{t('backups', 'restore')}</Button>
                  <Button size="small" color="error" onClick={() => setDeleteId(b.id)}>{t('common', 'delete')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={!!restoreId} onClose={() => setRestoreId(null)}>
        <DialogTitle>{t('backups', 'restore')}</DialogTitle>
        <DialogContent><Typography>{t('backups', 'confirmRestore')}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setRestoreId(null)}>{t('common', 'cancel')}</Button><Button color="warning" onClick={handleRestore}>{t('backups', 'restore')}</Button></DialogActions>
      </Dialog>
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>{t('common', 'delete')}</DialogTitle>
        <DialogContent><Typography>{t('backups', 'confirmDelete')}</Typography></DialogContent>
        <DialogActions><Button onClick={() => setDeleteId(null)}>{t('common', 'cancel')}</Button><Button color="error" onClick={handleDelete}>{t('common', 'delete')}</Button></DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
