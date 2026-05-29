import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, IconButton, Button, Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import CloudIcon from '@mui/icons-material/Cloud';
import DownloadIcon from '@mui/icons-material/Download';
import ScheduleIcon from '@mui/icons-material/Schedule';
import MenuIcon from '@mui/icons-material/Menu';
import LanguageIcon from '@mui/icons-material/Language';
import TuneIcon from '@mui/icons-material/Tune';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ShieldIcon from '@mui/icons-material/Shield';
import PeopleIcon from '@mui/icons-material/People';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import InventoryIcon from '@mui/icons-material/Inventory';
import DescriptionIcon from '@mui/icons-material/Description';
import BackupIcon from '@mui/icons-material/Backup';
import ChatIcon from '@mui/icons-material/Chat';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderIcon from '@mui/icons-material/Folder';
import { LanguageProvider, useTranslation } from './contexts/LanguageContext';
import { Dashboard } from './pages/Dashboard';
import { ServerSettings } from './pages/ServerSettings';
import { GameSettings } from './pages/GameSettings';
import { RaidSettings } from './pages/RaidSettings';
import { ServerInstall } from './pages/ServerInstall';
import { AppSettings } from './pages/AppSettings';
import { RestartScheduler } from './pages/RestartScheduler';
import { WebPanelPage } from './pages/WebPanelPage';
import { FTPSettings } from './pages/FTPSettings';
import { BackupManager } from './pages/BackupManager';
import { DiscordSettings } from './pages/DiscordSettings';
import { EconomySettings } from './pages/EconomySettings';
import { PlayersPage } from './pages/PlayersPage';
import { SquadsPage } from './pages/SquadsPage';
import { LogMonitor } from './pages/LogMonitor';
import { FileManager } from './pages/FileManager';
import { LootEditor } from './pages/LootEditor';

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
    { path: '/webpanel', label: t('nav', 'webPanel'), icon: <CloudIcon /> },
    { path: '/server-settings', label: t('nav', 'serverConfig'), icon: <TuneIcon /> },
    { path: '/game-settings', label: t('nav', 'gameConfig'), icon: <SportsEsportsIcon /> },
    { path: '/economy', label: t('nav', 'economy'), icon: <AccountBalanceIcon /> },
    { path: '/raid', label: t('nav', 'raid'), icon: <ShieldIcon /> },
    { path: '/players', label: t('nav', 'players'), icon: <PeopleIcon /> },
    { path: '/squads', label: t('nav', 'squads'), icon: <GroupWorkIcon /> },
    { path: '/loot', label: t('nav', 'loot'), icon: <InventoryIcon /> },
    { path: '/logs', label: t('nav', 'logs'), icon: <DescriptionIcon /> },
    { path: '/backups', label: t('nav', 'backups'), icon: <BackupIcon /> },
    { path: '/discord', label: t('nav', 'discord'), icon: <ChatIcon /> },
    { path: '/ftp', label: t('nav', 'ftp'), icon: <FolderOpenIcon /> },
    { path: '/files', label: t('nav', 'files'), icon: <FolderIcon /> },
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
      <List sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1, pt: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
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
          <span>{t('settings', lang === 'ru' ? 'langRu' : 'langEn')}</span>
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
          <Route path="/webpanel" element={<WebPanelPage />} />
          <Route path="/server-settings" element={<ServerSettings />} />
          <Route path="/game-settings" element={<GameSettings />} />
          <Route path="/economy" element={<EconomySettings />} />
          <Route path="/raid" element={<RaidSettings />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/squads" element={<SquadsPage />} />
          <Route path="/loot" element={<LootEditor />} />
          <Route path="/logs" element={<LogMonitor />} />
          <Route path="/backups" element={<BackupManager />} />
          <Route path="/discord" element={<DiscordSettings />} />
          <Route path="/ftp" element={<FTPSettings />} />
          <Route path="/files" element={<FileManager />} />
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
