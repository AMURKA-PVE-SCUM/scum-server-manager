import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, IconButton, Button, Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import VideogameAssetIcon from '@mui/icons-material/VideogameAsset';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PeopleIcon from '@mui/icons-material/People';
import BackupIcon from '@mui/icons-material/Backup';
import TerminalIcon from '@mui/icons-material/Terminal';
import ForumIcon from '@mui/icons-material/Forum';
import DownloadIcon from '@mui/icons-material/Download';
import ScheduleIcon from '@mui/icons-material/Schedule';
import MenuIcon from '@mui/icons-material/Menu';
import LanguageIcon from '@mui/icons-material/Language';
import { LanguageProvider, useTranslation } from './contexts/LanguageContext';
import { Dashboard } from './pages/Dashboard';
import { ServerSettings } from './pages/ServerSettings';
import { GameSettings } from './pages/GameSettings';
import { EconomySettings } from './pages/EconomySettings';
import { RaidSettings } from './pages/RaidSettings';
import { UserManager } from './pages/UserManager';
import { LootEditor } from './pages/LootEditor';
import { BackupManager } from './pages/BackupManager';
import { LogMonitor } from './pages/LogMonitor';
import { DiscordSettings } from './pages/DiscordSettings';
import { ServerInstall } from './pages/ServerInstall';
import { AppSettings } from './pages/AppSettings';
import { RestartScheduler } from './pages/RestartScheduler';
const DRAWER_WIDTH = 220;
function AppContent() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useTranslation();
  const navItems = [
    { path: '/', label: t('nav', 'dashboard'), icon: <DashboardIcon /> },
    { path: '/server-install', label: t('nav', 'serverInstall'), icon: <DownloadIcon /> },
    { path: '/scheduler', label: t('nav', 'restartScheduler'), icon: <ScheduleIcon /> },
    { path: '/server-settings', label: t('nav', 'serverConfig'), icon: <SettingsIcon /> },
    { path: '/game-settings', label: t('nav', 'gameConfig'), icon: <VideogameAssetIcon /> },
    { path: '/economy', label: t('nav', 'economy'), icon: <AttachMoneyIcon /> },
    { path: '/raid', label: t('nav', 'raid'), icon: <VideogameAssetIcon /> },
    { path: '/loot', label: t('nav', 'loot'), icon: <VideogameAssetIcon /> },
    { path: '/users', label: t('nav', 'users'), icon: <PeopleIcon /> },
    { path: '/logs', label: t('nav', 'logs'), icon: <TerminalIcon /> },
    { path: '/backups', label: t('nav', 'backups'), icon: <BackupIcon /> },
    { path: '/discord', label: t('nav', 'discord'), icon: <ForumIcon /> },
    { path: '/settings', label: t('nav', 'settings'), icon: <SettingsIcon /> },
  ];
  const isActive = (path: string) => location.pathname === path;
  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0d1117' }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#58a6ff', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
          SCUM
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#8b949e', fontWeight: 500, letterSpacing: '0.3px' }}>
          Server Manager
        </Typography>
      </Box>
      <Divider sx={{ borderColor: '#21262d' }} />
      <List sx={{ flex: 1, overflow: 'auto', px: 1, pt: 1 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={isActive(item.path)}
            onClick={() => { navigate(item.path); setMobileOpen(false); }}
            sx={{
              borderRadius: 1.5, mb: 0.3, px: 1.5, py: 0.7,
              color: isActive(item.path) ? '#e6edf3' : '#8b949e',
              transition: 'all 0.15s ease',
              '&.Mui-selected': {
                bgcolor: 'rgba(88,166,255,0.1)',
                color: '#e6edf3',
                '&:hover': { bgcolor: 'rgba(88,166,255,0.15)' },
                '& .MuiListItemIcon-root': { color: '#58a6ff' },
              },
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.04)',
                color: '#e6edf3',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 34, color: 'inherit', '& .MuiSvgIcon-root': { fontSize: 19 } }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                fontSize: 13.5,
                fontWeight: isActive(item.path) ? 600 : 400,
              }}
            />
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ borderColor: '#21262d' }} />
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <LanguageIcon sx={{ fontSize: 16, color: '#8b949e' }} />
        <Button
          size="small"
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          sx={{
            flex: 1, color: '#8b949e', borderColor: '#30363d',
            fontSize: 12.5, textTransform: 'none',
            justifyContent: 'space-between',
            '&:hover': { borderColor: '#58a6ff', color: '#e6edf3' },
          }}
          variant="outlined"
        >
          <span>{lang === 'ru' ? 'Русский' : 'English'}</span>
          <Box component="span" sx={{ fontSize: 11, opacity: 0.6, ml: 1 }}>
            {lang === 'ru' ? 'EN' : 'RU'}
          </Box>
        </Button>
      </Box>
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#0d1117' }}>
      <IconButton
        edge="start"
        sx={{
          position: 'fixed', top: 10, left: 8, zIndex: 1300,
          display: { md: 'none' }, color: '#8b949e',
        }}
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <MenuIcon />
      </IconButton>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: '1px solid #21262d', bgcolor: '#0d1117' },
          }}
          ModalProps={{ keepMounted: true }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: '1px solid #21262d', bgcolor: '#0d1117' },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, p: 3, overflow: 'auto', maxHeight: '100vh', bgcolor: '#0d1117' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/server-install" element={<ServerInstall />} />
          <Route path="/scheduler" element={<RestartScheduler />} />
          <Route path="/server-settings" element={<ServerSettings />} />
          <Route path="/game-settings" element={<GameSettings />} />
          <Route path="/economy" element={<EconomySettings />} />
          <Route path="/raid" element={<RaidSettings />} />
          <Route path="/loot" element={<LootEditor />} />
          <Route path="/users" element={<UserManager />} />
          <Route path="/logs" element={<LogMonitor />} />
          <Route path="/backups" element={<BackupManager />} />
          <Route path="/discord" element={<DiscordSettings />} />
          <Route path="/settings" element={<AppSettings />} />
        </Routes>
      </Box>
    </Box>
  );
}
export function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
