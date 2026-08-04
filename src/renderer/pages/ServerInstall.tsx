import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField,
  Grid, Alert, LinearProgress, Stepper, Step, StepLabel,
} from '@mui/material';
import { useTranslation } from '../contexts/LanguageContext';

export function ServerInstall() {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState(0);
  const [steamCmdPath, setSteamCmdPath] = useState('');
  const [serverPath, setServerPath] = useState('');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState('');

  const handleSelectSteamCmdPath = async () => {
    const p = await window.electronAPI.dialog.selectFolder();
    if (p) setSteamCmdPath(p);
  };

  const handleSelectServerPath = async () => {
    const p = await window.electronAPI.dialog.selectFolder();
    if (p) setServerPath(p);
  };

  const handleInstallSteamCmd = async () => {
    setInstalling(true); setError('');
    try {
      const cfg = await window.electronAPI.config.get();
      cfg.server.steamCmdPath = steamCmdPath;
      await window.electronAPI.config.set(cfg);
      await window.electronAPI.steamcmd.install();
      setActiveStep(1);
    } catch (e: any) { setError(e.message); }
    setInstalling(false);
  };

  const handleInstallServer = async () => {
    setInstalling(true); setError('');
    try {
      const cfg = await window.electronAPI.config.get();
      cfg.server.serverPath = serverPath;
      await window.electronAPI.config.set(cfg);
      await window.electronAPI.server.update();
      setActiveStep(2);
    } catch (e: any) { setError(e.message); }
    setInstalling(false);
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>{t('install', 'title')}</Typography>
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {[0, 1, 2].map((i) => <Step key={i}><StepLabel>{t('install', `step${i + 1}`)}</StepLabel></Step>)}
      </Stepper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {installing && <LinearProgress sx={{ mb: 2 }} />}

      {activeStep === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('install', 'step1')}</Typography>
            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={9}>
                <TextField fullWidth label={t('install', 'steamCmdPath')} value={steamCmdPath}
                  onChange={(e) => setSteamCmdPath(e.target.value)} size="small" />
              </Grid>
              <Grid item xs={3}>
                <Button variant="outlined" onClick={handleSelectSteamCmdPath}>{t('common', 'browse')}</Button>
              </Grid>
              <Grid item xs={12}>
                <Button variant="contained" onClick={handleInstallSteamCmd} disabled={!steamCmdPath || installing}>
                  {t('install', 'installSteamCmd')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {activeStep === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('install', 'step2')}</Typography>
            <Grid container spacing={2}>
              <Grid item xs={9}>
                <TextField fullWidth label={t('install', 'serverPath')} value={serverPath}
                  onChange={(e) => setServerPath(e.target.value)} size="small" />
              </Grid>
              <Grid item xs={3}>
                <Button variant="outlined" onClick={handleSelectServerPath}>{t('common', 'browse')}</Button>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('install', 'downloadNotice')}
                </Typography>
                <Button variant="contained" onClick={handleInstallServer} disabled={!serverPath || installing}>
                  {t('install', 'installServer')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {activeStep === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, color: 'success.main' }}>{t('install', 'installComplete')}</Typography>
            <Typography>{t('install', 'installCompleteDesc')}</Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
