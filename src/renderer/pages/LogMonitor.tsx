import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Tabs, Tab,
} from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function LogMonitor() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [logs, setLogs] = useState<any[]>([]);

  const tabTypes = ['', 'admin', 'chat', 'login', 'vehicle', 'system'];
  const tabLabels = ['all', 'admin', 'chat', 'login', 'vehicle', 'system'];

  const load = useCallback(async () => {
    try {
      const l = tab === 0
        ? await window.electronAPI.logs.get()
        : await window.electronAPI.logs.getByType(tabTypes[tab]);
      setLogs(l.slice(-100).reverse());
    } catch {}
  }, [tab]);

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  const colors: Record<string, 'warning' | 'info' | 'success' | 'error' | 'default'> = {
    admin: 'warning', chat: 'info', login: 'success', vehicle: 'error', system: 'default',
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('logs', 'title')}</Typography>
      <Card><CardContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          {tabLabels.map((l, i) => <Tab key={i} label={t('logs', l)} />)}
        </Tabs>
        <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 80 }}>{t('common', 'time')}</TableCell>
                <TableCell sx={{ width: 90 }}>{t('common', 'type')}</TableCell>
                <TableCell>{t('common', 'message')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(log.timestamp).toLocaleTimeString()}</TableCell>
                  <TableCell><Chip label={log.type} size="small" color={colors[log.type] || 'default'} variant="outlined" /></TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{log.message}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && <TableRow><TableCell colSpan={3} align="center">{t('logs', 'noLogs')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent></Card>
    </Box>
  );
}
