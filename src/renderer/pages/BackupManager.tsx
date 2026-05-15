import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from '../contexts/LanguageContext';

export function BackupManager() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<any[]>([]);
  const [confirm, setConfirm] = useState({ open: false, id: '', action: '' });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);

  const load = async () => { try { setBackups(await window.electronAPI.backup.list()); } catch {} };

  const handleCreate = async () => {
    try {
      await window.electronAPI.backup.create();
      await load();
      setSnack({ open: true, message: t('backups', 'backupCreated'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const handleRestore = async () => {
    try {
      await window.electronAPI.backup.restore(confirm.id);
      setSnack({ open: true, message: t('backups', 'backupRestored'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setConfirm({ open: false, id: '', action: '' });
  };

  const handleDelete = async () => {
    try {
      await window.electronAPI.backup.delete(confirm.id);
      await load();
      setSnack({ open: true, message: t('backups', 'backupDeleted'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
    setConfirm({ open: false, id: '', action: '' });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{t('backups', 'title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>{t('backups', 'createBackup')}</Button>
      </Box>
      <Card><CardContent>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('common', 'name')}</TableCell>
                <TableCell>{t('common', 'type')}</TableCell>
                <TableCell>{t('common', 'time')}</TableCell>
                <TableCell align="right">{t('common', 'actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backups.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell>{b.name}</TableCell>
                  <TableCell><Chip label={t('backups', b.type)} size="small" color={b.type === 'manual' ? 'primary' : 'default'} variant="outlined" /></TableCell>
                  <TableCell>{new Date(b.timestamp).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<RestoreIcon />} onClick={() => setConfirm({ open: true, id: b.id, action: 'restore' })}>{t('backups', 'restore')}</Button>
                    <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setConfirm({ open: true, id: b.id, action: 'delete' })}>{t('common', 'delete')}</Button>
                  </TableCell>
                </TableRow>
              ))}
              {backups.length === 0 && <TableRow><TableCell colSpan={4} align="center">{t('backups', 'noBackups')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent></Card>

      <Dialog open={confirm.open} onClose={() => setConfirm({ ...confirm, open: false })}>
        <DialogTitle>{t('common', 'confirm')}</DialogTitle>
        <DialogContent>
          <Typography>{confirm.action === 'restore' ? t('backups', 'confirmRestore') : t('backups', 'confirmDelete')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm({ ...confirm, open: false })}>{t('common', 'cancel')}</Button>
          <Button onClick={confirm.action === 'restore' ? handleRestore : handleDelete}
            variant="contained" color={confirm.action === 'delete' ? 'error' : 'primary'}>
            {confirm.action === 'restore' ? t('backups', 'restore') : t('common', 'delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
