import React, { useState, useEffect, useRef } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Paper, Chip, Alert, Snackbar } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import SendIcon from '@mui/icons-material/Send';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from '../contexts/LanguageContext';

export function RconConsole() {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(28015);
  const [password, setPassword] = useState('');
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<{ cmd: string; response: string; timestamp: string }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const checkStatus = async () => {
    try {
      const status = await window.electronAPI.rcon.status();
      if (status.connected) {
        setConnected(true);
        if (status.config) {
          setHost(status.config.host);
          setPort(status.config.port);
        }
      }
    } catch (e: any) {
      console.error('Failed to check RCON status:', e.message);
    }
  };

  const handleConnect = async () => {
    console.log('[RCON Console] Attempting to connect...', { host, port, password: '***' });
    try {
      const result = await window.electronAPI.rcon.connect({ host, port, password });
      console.log('[RCON Console] Connect result:', result);
      if (result.success) {
        setConnected(true);
        setSnack({ open: true, message: t('rcon', 'connected'), severity: 'success' });
        addToHistory('SYSTEM', result.response);
      } else {
        setSnack({ open: true, message: result.error || t('rcon', 'connectionFailed'), severity: 'error' });
      }
    } catch (e: any) {
      console.error('[RCON Console] Connect error:', e);
      setSnack({ open: true, message: e.message, severity: 'error' });
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.rcon.disconnect();
      setConnected(false);
      setSnack({ open: true, message: t('rcon', 'disconnected'), severity: 'success' });
      addToHistory('SYSTEM', 'Disconnected from RCON server');
    } catch (e: any) {
      setSnack({ open: true, message: e.message, severity: 'error' });
    }
  };

  const sendCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    
    try {
      const result = await window.electronAPI.rcon.sendCommand(cmd);
      addToHistory(cmd, result.response || result.error || t('rcon', 'noResponse'));
      
      if (result.success) {
        setCommand('');
        setHistoryIndex(-1);
      } else {
        setSnack({ open: true, message: result.error || 'Command failed', severity: 'error' });
      }
    } catch (e: any) {
      setSnack({ open: true, message: e.message, severity: 'error' });
    }
  };

  const addToHistory = (cmd: string, response: string) => {
    const entry = {
      cmd,
      response,
      timestamp: new Date().toLocaleTimeString(),
    };
    setHistory(prev => [...prev, entry]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand(command);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommand(history[newIndex].cmd);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCommand(history[newIndex].cmd);
        }
      }
    }
  };

  const quickCommands = [
    { label: 'List Players', command: 'ListPlayers' },
    { label: 'Server Info', command: 'ServerInfo' },
    { label: 'Save World', command: 'SaveWorld' },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <TerminalIcon />
        {t('rcon', 'title')}
      </Typography>

      {/* Connection Panel */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField
              label={t('rcon', 'host')}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={connected}
              size="small"
              sx={{ minWidth: 150 }}
            />
            <TextField
              label={t('rcon', 'port')}
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              disabled={connected}
              size="small"
              sx={{ minWidth: 100 }}
            />
            <TextField
              label={t('rcon', 'password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={connected}
              size="small"
              sx={{ minWidth: 200 }}
            />
            <Button
              variant={connected ? 'outlined' : 'contained'}
              color={connected ? 'error' : 'primary'}
              onClick={connected ? handleDisconnect : handleConnect}
              startIcon={connected ? <StopIcon /> : <PlayArrowIcon />}
            >
              {connected ? t('rcon', 'disconnect') : t('rcon', 'connect')}
            </Button>
            <Chip
              label={connected ? t('rcon', 'connected') : t('rcon', 'disconnected')}
              color={connected ? 'success' : 'default'}
              variant="outlined"
            />
          </Box>
        </CardContent>
      </Card>

      {/* Quick Commands */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        {quickCommands.map((qc) => (
          <Button
            key={qc.command}
            variant="outlined"
            size="small"
            onClick={() => sendCommand(qc.command)}
            disabled={!connected}
          >
            {qc.label}
          </Button>
        ))}
      </Box>

      {/* Console Output */}
      <Paper
        sx={{
          height: 500,
          overflow: 'auto',
          p: 2,
          bgcolor: '#0d1117',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: 13,
        }}
      >
        {history.length === 0 && (
          <Typography sx={{ color: '#8b949e', fontStyle: 'italic' }}>
            {t('rcon', 'noCommands')}
          </Typography>
        )}
        {history.map((entry, idx) => (
          <Box key={idx} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ color: '#58a6ff', fontWeight: 'bold' }}>
                [{entry.timestamp}] $ {entry.cmd}
              </Typography>
            </Box>
            <Paper sx={{ p: 1.5, bgcolor: '#161b22', borderLeft: '3px solid #238636' }}>
              <Typography sx={{ color: '#c9d1d9', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {entry.response}
              </Typography>
            </Paper>
          </Box>
        ))}
        <div ref={consoleEndRef} />
      </Paper>

      {/* Command Input */}
      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          placeholder={t('rcon', 'enterCommand')}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
          size="small"
        />
        <Button
          variant="contained"
          onClick={() => sendCommand(command)}
          disabled={!connected || !command.trim()}
          startIcon={<SendIcon />}
        >
          {t('rcon', 'send')}
        </Button>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack({ ...snack, open: false })}
      >
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}
