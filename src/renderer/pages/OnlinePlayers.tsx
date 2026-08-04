import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem,
  FormControl, InputLabel, Snackbar, Alert, Chip
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import BoltIcon from '@mui/icons-material/Bolt';
import ShieldIcon from '@mui/icons-material/Shield';
import DeleteIcon from '@mui/icons-material/Delete';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import NightlightIcon from '@mui/icons-material/Nightlight';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ChatIcon from '@mui/icons-material/Chat';
import { useTranslation } from '../contexts/LanguageContext';

interface OnlinePlayer {
  steamId: string;
  name: string;
  connectedAt: string;
  duration: number;
}

export function OnlinePlayers() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [attrDialog, setAttrDialog] = useState({ open: false, player: null as OnlinePlayer | null });
  const [attrValues, setAttrValues] = useState({ strength: 8, dexterity: 5, stamina: 5, intellect: 5 });
  
  const [knockoutDialog, setKnockoutDialog] = useState({ open: false, player: null as OnlinePlayer | null, seconds: 10 });
  const [announceDialog, setAnnounceDialog] = useState({ open: false, text: '' });
  const [notifyDialog, setNotifyDialog] = useState({ open: false, player: null as OnlinePlayer | null, type: 0, message: '' });
  const [chatDialog, setChatDialog] = useState({ open: false, player: null as OnlinePlayer | null, color: 'White', message: '' });
  
  const [silenced, setSilenced] = useState<Set<string>>(new Set());
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    loadPlayers();
    const interval = setInterval(loadPlayers, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/players/online');
      const data = await response.json();
      if (data.players) {
        setPlayers(data.players);
      }
    } catch (e: any) {
      console.error('Failed to load players:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const sendPlayerAction = async (steamId: string, action: string, params: any) => {
    try {
      const response = await fetch('/api/players/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId, action, params }),
      });
      const result = await response.json();
      
      if (result.success) {
        setSnack({ open: true, message: 'Command sent successfully', severity: 'success' });
      } else {
        setSnack({ open: true, message: result.error || 'Command failed', severity: 'error' });
      }
    } catch (e: any) {
      setSnack({ open: true, message: e.message, severity: 'error' });
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleSetAttributes = () => {
    if (!attrDialog.player) return;
    sendPlayerAction(attrDialog.player.steamId, 'setAttributes', attrValues);
    setAttrDialog({ open: false, player: null });
  };

  const handleGodMode = (player: OnlinePlayer) => {
    sendPlayerAction(player.steamId, 'godMode', { enabled: true });
  };

  const handleKill = (player: OnlinePlayer) => {
    sendPlayerAction(player.steamId, 'suicide', {});
  };

  const handleSilence = (player: OnlinePlayer) => {
    const isSilenced = silenced.has(player.steamId);
    sendPlayerAction(player.steamId, isSilenced ? 'unsilence' : 'silence', {});
    setSilenced(prev => {
      const next = new Set(prev);
      if (isSilenced) next.delete(player.steamId);
      else next.add(player.steamId);
      return next;
    });
  };

  const handleKnockout = () => {
    if (!knockoutDialog.player) return;
    sendPlayerAction(knockoutDialog.player.steamId, 'knockout', { seconds: knockoutDialog.seconds });
    setKnockoutDialog({ open: false, player: null, seconds: 10 });
  };

  const handleAnnounce = () => {
    sendPlayerAction('', 'announce', { text: announceDialog.text });
    setAnnounceDialog({ open: false, text: '' });
  };

  const handleNotify = () => {
    if (!notifyDialog.player) return;
    sendPlayerAction(notifyDialog.player.steamId, 'notify', {
      type: notifyDialog.type,
      message: notifyDialog.message,
    });
    setNotifyDialog({ open: false, player: null, type: 0, message: '' });
  };

  const handleChat = () => {
    if (!chatDialog.player) return;
    sendPlayerAction(chatDialog.player.steamId, 'chat', {
      color: chatDialog.color,
      message: chatDialog.message,
    });
    setChatDialog({ open: false, player: null, color: 'White', message: '' });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <GroupIcon />
        {t('players', 'onlineTitle')}
        <Chip label={`${players.length} online`} color="primary" size="small" sx={{ ml: 2 }} />
      </Typography>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('common', 'name')}</TableCell>
                <TableCell>SteamID64</TableCell>
                <TableCell>{t('players', 'timeOnline')}</TableCell>
                <TableCell align="right">{t('players', 'actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {players.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    {loading ? 'Loading...' : t('players', 'noPlayersOnline')}
                  </TableCell>
                </TableRow>
              )}
              {players.map((player) => (
                <TableRow key={player.steamId} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{player.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{player.steamId}</TableCell>
                  <TableCell>{formatDuration(player.duration)}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<BoltIcon />}
                        onClick={() => setAttrDialog({ open: true, player })}
                      >
                        {t('players', 'setAttributes')}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<ShieldIcon />}
                        onClick={() => handleGodMode(player)}
                      >
                        God Mode
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleKill(player)}
                      >
                        Kill
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color={silenced.has(player.steamId) ? 'warning' : 'inherit'}
                        startIcon={silenced.has(player.steamId) ? <VolumeUpIcon /> : <VolumeOffIcon />}
                        onClick={() => handleSilence(player)}
                      >
                        {silenced.has(player.steamId) ? 'Unsilence' : 'Silence'}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<NightlightIcon />}
                        onClick={() => setKnockoutDialog({ open: true, player, seconds: 10 })}
                      >
                        Knockout
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AnnouncementIcon />}
                        onClick={() => setAnnounceDialog({ open: true, text: '' })}
                      >
                        Announce
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<NotificationsIcon />}
                        onClick={() => setNotifyDialog({ open: true, player, type: 0, message: '' })}
                      >
                        Notify
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ChatIcon />}
                        onClick={() => setChatDialog({ open: true, player, color: 'White', message: '' })}
                      >
                        Chat
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Set Attributes Dialog */}
      <Dialog open={attrDialog.open} onClose={() => setAttrDialog({ open: false, player: null })}>
        <DialogTitle>{t('players', 'setAttributes')} - {attrDialog.player?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField
              label="Strength"
              type="number"
              value={attrValues.strength}
              onChange={(e) => setAttrValues({ ...attrValues, strength: Number(e.target.value) })}
              size="small"
            />
            <TextField
              label="Dexterity"
              type="number"
              value={attrValues.dexterity}
              onChange={(e) => setAttrValues({ ...attrValues, dexterity: Number(e.target.value) })}
              size="small"
            />
            <TextField
              label="Stamina"
              type="number"
              value={attrValues.stamina}
              onChange={(e) => setAttrValues({ ...attrValues, stamina: Number(e.target.value) })}
              size="small"
            />
            <TextField
              label="Intellect"
              type="number"
              value={attrValues.intellect}
              onChange={(e) => setAttrValues({ ...attrValues, intellect: Number(e.target.value) })}
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttrDialog({ open: false, player: null })}>Cancel</Button>
          <Button onClick={handleSetAttributes} variant="contained">Send</Button>
        </DialogActions>
      </Dialog>

      {/* Knockout Dialog */}
      <Dialog open={knockoutDialog.open} onClose={() => setKnockoutDialog({ open: false, player: null, seconds: 10 })}>
        <DialogTitle>Knockout - {knockoutDialog.player?.name}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('players', 'seconds')}
            type="number"
            value={knockoutDialog.seconds}
            onChange={(e) => setKnockoutDialog({ ...knockoutDialog, seconds: Number(e.target.value) })}
            size="small"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKnockoutDialog({ open: false, player: null, seconds: 10 })}>Cancel</Button>
          <Button onClick={handleKnockout} variant="contained">Send</Button>
        </DialogActions>
      </Dialog>

      {/* Announce Dialog */}
      <Dialog open={announceDialog.open} onClose={() => setAnnounceDialog({ open: false, text: '' })}>
        <DialogTitle>Announce to All</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label={t('players', 'message')}
            value={announceDialog.text}
            onChange={(e) => setAnnounceDialog({ ...announceDialog, text: e.target.value })}
            size="small"
            multiline
            rows={3}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnnounceDialog({ open: false, text: '' })}>Cancel</Button>
          <Button onClick={handleAnnounce} variant="contained">Send</Button>
        </DialogActions>
      </Dialog>

      {/* Notify Dialog */}
      <Dialog open={notifyDialog.open} onClose={() => setNotifyDialog({ open: false, player: null, type: 0, message: '' })}>
        <DialogTitle>Notify - {notifyDialog.player?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl size="small">
              <InputLabel>{t('players', 'notificationType')}</InputLabel>
              <Select
                value={notifyDialog.type}
                label={t('players', 'notificationType')}
                onChange={(e) => setNotifyDialog({ ...notifyDialog, type: Number(e.target.value) })}
              >
                <MenuItem value={0}>Info</MenuItem>
                <MenuItem value={1}>Warning</MenuItem>
                <MenuItem value={2}>Error</MenuItem>
                <MenuItem value={3}>Success</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label={t('players', 'message')}
              value={notifyDialog.message}
              onChange={(e) => setNotifyDialog({ ...notifyDialog, message: e.target.value })}
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotifyDialog({ open: false, player: null, type: 0, message: '' })}>Cancel</Button>
          <Button onClick={handleNotify} variant="contained">Send</Button>
        </DialogActions>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={chatDialog.open} onClose={() => setChatDialog({ open: false, player: null, color: 'White', message: '' })}>
        <DialogTitle>Send Chat - {chatDialog.player?.name}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl size="small">
              <InputLabel>{t('players', 'color')}</InputLabel>
              <Select
                value={chatDialog.color}
                label={t('players', 'color')}
                onChange={(e) => setChatDialog({ ...chatDialog, color: e.target.value })}
              >
                <MenuItem value="White">White</MenuItem>
                <MenuItem value="Red">Red</MenuItem>
                <MenuItem value="Green">Green</MenuItem>
                <MenuItem value="Blue">Blue</MenuItem>
                <MenuItem value="Yellow">Yellow</MenuItem>
                <MenuItem value="Cyan">Cyan</MenuItem>
                <MenuItem value="Magenta">Magenta</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label={t('players', 'message')}
              value={chatDialog.message}
              onChange={(e) => setChatDialog({ ...chatDialog, message: e.target.value })}
              size="small"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChatDialog({ open: false, player: null, color: 'White', message: '' })}>Cancel</Button>
          <Button onClick={handleChat} variant="contained">Send</Button>
        </DialogActions>
      </Dialog>

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
