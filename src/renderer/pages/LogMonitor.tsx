import React, { useState, useEffect, useRef } from 'react';
import { Box, Card, CardContent, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function LogMonitor() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);
  const load = async () => {
    try {
      let e: any[];
      if (filter === 'all') e = await window.electronAPI.logs.get();
      else e = await window.electronAPI.logs.getByType(filter);
      setEvents(e || []);
      if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
    } catch {}
  };
  useEffect(() => { load(); }, [filter]);
  const colors: any = { admin: '#f85149', chat: '#58a6ff', login: '#3fb950', vehicle: '#d29922', system: '#8b949e' };
  const filterBtns = ['all', 'admin', 'chat', 'login', 'vehicle', 'system'];
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('logs', 'title')}</Typography>
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup value={filter} exclusive onChange={(_, v) => v && setFilter(v)} size="small">
          {filterBtns.map((f) => (
            <ToggleButton key={f} value={f}>{t('logs', f)}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Card><CardContent sx={{ p: 0 }}>
        <Box ref={boxRef} sx={{ height: 500, overflow: 'auto', p: 2, fontFamily: 'Consolas, monospace', fontSize: 12, bgcolor: '#0d1117' }}>
          {events.length === 0 && <Typography sx={{ color: '#484f58' }}>{t('logs', 'noLogs')}</Typography>}
          {events.map((e: any) => (
            <Box key={e.id} sx={{ color: colors[e.type] || '#8b949e', py: 0.5, borderBottom: '1px solid #21262d' }}>
              <Typography component="span" sx={{ color: '#484f58', mr: 1 }}>[{new Date(e.timestamp).toLocaleTimeString()}]</Typography>
              <Typography component="span" sx={{ color: colors[e.type] }}>[{e.type.toUpperCase()}]</Typography>
              <Typography component="span" sx={{ ml: 1 }}>{e.message}</Typography>
            </Box>
          ))}
        </Box>
      </CardContent></Card>
    </Box>
  );
}
