import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Snackbar, Alert } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function VehiclesPage() {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  useEffect(() => { load(); }, []);
  const load = async () => {
    try { await window.electronAPI.db.init(); const v = await window.electronAPI.db.getVehicles(); setVehicles(v || []); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('vehicles', 'title')}</Typography>
      <Card><CardContent sx={{ p: 0 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>{t('vehicles', 'id')}</TableCell><TableCell>{t('vehicles', 'asset')}</TableCell><TableCell>{t('vehicles', 'alias')}</TableCell><TableCell>{t('vehicles', 'functional')}</TableCell><TableCell>{t('vehicles', 'lastAccess')}</TableCell></TableRow></TableHead>
          <TableBody>
            {vehicles.length === 0 && <TableRow><TableCell colSpan={5} align="center">{t('vehicles', 'noVehicles')}</TableCell></TableRow>}
            {vehicles.map((v: any) => (
              <TableRow key={v.entityId}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{v.entityId}</TableCell>
                <TableCell>{v.asset}</TableCell>
                <TableCell>{v.alias || '-'}</TableCell>
                <TableCell>{v.functional ? t('common', 'yes') : t('common', 'no')}</TableCell>
                <TableCell>{v.lastAccess || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
