import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Snackbar, Alert } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function SquadsPage() {
  const { t } = useTranslation();
  const [squads, setSquads] = useState<any[]>([]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  useEffect(() => { load(); }, []);
  const load = async () => {
    try { await window.electronAPI.db.init(); const s = await window.electronAPI.db.getSquads(); setSquads(s || []); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };
  const grouped: any = {};
  squads.forEach((s: any) => { if (!grouped[s.squadId]) grouped[s.squadId] = { ...s, members: [] }; grouped[s.squadId].members.push(s); });
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('squads', 'title')}</Typography>
      <Card><CardContent sx={{ p: 0 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>{t('squads', 'title')}</TableCell><TableCell>{t('squads', 'score')}</TableCell><TableCell>{t('squads', 'members')}</TableCell><TableCell>{t('squads', 'limit')}</TableCell></TableRow></TableHead>
          <TableBody>
            {Object.keys(grouped).length === 0 && <TableRow><TableCell colSpan={4} align="center">{t('squads', 'noSquads')}</TableCell></TableRow>}
            {Object.values(grouped).map((s: any) => (
              <TableRow key={s.squadId}>
                <TableCell><Typography fontWeight={600}>{s.squadName}</Typography></TableCell>
                <TableCell>{s.score}</TableCell>
                <TableCell>{s.members.filter((m: any) => m.memberSteamId).map((m: any) => m.memberName).join(', ')}</TableCell>
                <TableCell>{s.memberLimit}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
