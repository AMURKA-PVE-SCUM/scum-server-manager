import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody, Button, Breadcrumbs, Link, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function FileManager() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [editFile, setEditFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    const base = cfg.server.serverPath;
    if (base) { setCurrentPath(base); await listDir(base); }
  };
  const listDir = async (dir: string) => {
    try { const e = await window.electronAPI.files.list(dir); setEntries(e); setCurrentPath(dir); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };
  const handleOpen = (entry: any) => {
    if (entry.isDirectory) listDir(entry.path);
    else {
      window.electronAPI.files.read(entry.path).then((c) => { setEditFile(entry.path); setEditContent(c); }).catch((e: any) => setSnack({ open: true, message: e.message, severity: 'error' }));
    }
  };
  const handleSave = async () => {
    if (!editFile) return;
    try { await window.electronAPI.files.write(editFile, editContent); setSnack({ open: true, message: t('files', 'saved'), severity: 'success' }); setEditFile(null); } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };
  const pathParts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const baseIdx = pathParts.findIndex((p) => p.toLowerCase() === 'server');
  const displayParts = pathParts.slice(baseIdx >= 0 ? baseIdx : 0);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('nav', 'files')}</Typography>
      <Breadcrumbs sx={{ mb: 2, fontSize: 13 }}>
        {displayParts.map((part, i) => {
          const p = pathParts.slice(0, pathParts.indexOf(part) + 1).join('/').replace(/\//g, '\\');
          const full = config?.server?.serverPath ? config.server.serverPath.split('\\').slice(0, -pathParts.length + pathParts.indexOf(part) + 1).join('\\') + '\\' + part : p;
          return i === displayParts.length - 1 ? <Typography key={i} sx={{ color: '#e6edf3' }}>{part}</Typography> : <Link key={i} href="#" onClick={(e) => { e.preventDefault(); const parent = config?.server?.serverPath + displayParts.slice(0, i + 1).join('\\'); listDir(parent); }} sx={{ color: '#58a6ff', cursor: 'pointer' }}>{part}</Link>;
        })}
      </Breadcrumbs>
      <Card><CardContent sx={{ p: 0 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>{t('common', 'name')}</TableCell><TableCell>{t('files', 'size')}</TableCell></TableRow></TableHead>
          <TableBody>
            {displayParts.length > 1 && <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => { const parent = currentPath.split('\\').slice(0, -1).join('\\'); listDir(parent); }}><TableCell colSpan={2}>..</TableCell></TableRow>}
            {entries.map((e: any) => (
              <TableRow key={e.path} hover sx={{ cursor: 'pointer' }} onClick={() => handleOpen(e)}>
                <TableCell>{e.isDirectory ? '📁 ' : '📄 '}{e.name}</TableCell>
                <TableCell>{e.isDirectory ? '-' : (e.size / 1024).toFixed(1) + ' KB'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      <Dialog open={!!editFile} onClose={() => setEditFile(null)} maxWidth="lg" fullWidth>
        <DialogTitle>{editFile?.split('\\').pop()}</DialogTitle>
        <DialogContent>
          <Box component="textarea" value={editContent} onChange={(e) => setEditContent(e.target.value)} sx={{ width: '100%', minHeight: 400, fontFamily: 'monospace', fontSize: 13, p: 2, bgcolor: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 1, mt: 2 }} />
        </DialogContent>
        <DialogActions><Button onClick={() => setEditFile(null)}>{t('common', 'cancel')}</Button><Button variant="contained" onClick={handleSave}>{t('common', 'save')}</Button></DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={6000} onClose={() => setSnack({ ...snack, open: false })}><Alert severity={snack.severity}>{snack.message}</Alert></Snackbar>
    </Box>
  );
}
