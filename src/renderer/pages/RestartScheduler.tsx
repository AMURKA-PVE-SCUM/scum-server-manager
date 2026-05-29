import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Switch, FormControlLabel,
  Grid, TextField, IconButton, Chip, Snackbar, Alert, Tabs, Tab,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useTranslation } from '../contexts/LanguageContext';

const DAYS = ['dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday', 'daySunday'];

export function RestartScheduler() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [tab, setTab] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'interval' | 'specific'>('specific');
  const [intervalHours, setIntervalHours] = useState(4);
  const [specificTimes, setSpecificTimes] = useState<string[]>(['06:00', '12:00', '18:00', '00:00']);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [robotEnabled, setRobotEnabled] = useState(false);
  const [robotOnTime, setRobotOnTime] = useState('06:00');
  const [robotOffTime, setRobotOffTime] = useState('06:00');
  const [robotOnDays, setRobotOnDays] = useState<number[]>([6]);
  const [robotOffDays, setRobotOffDays] = useState<number[]>([1]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    if (cfg.server?.restartSchedule) setSpecificTimes(cfg.server.restartSchedule);
    if (cfg.server?.restartIntervalHours) setIntervalHours(cfg.server.restartIntervalHours);
    if (cfg.server?.restartDays) setSelectedDays(cfg.server.restartDays);
    if (cfg.server?.restartMode) setMode(cfg.server.restartMode);
    setEnabled(cfg.server?.autoRestart || false);
    setRobotEnabled(cfg.server?.robotScheduleEnabled || false);
    if (cfg.server?.robotEnableTime) setRobotOnTime(cfg.server.robotEnableTime);
    if (cfg.server?.robotDisableTime) setRobotOffTime(cfg.server.robotDisableTime);
    if (cfg.server?.robotEnableDays) setRobotOnDays(cfg.server.robotEnableDays);
    if (cfg.server?.robotDisableDays) setRobotOffDays(cfg.server.robotDisableDays);
  };

  const handleAddTime = () => setSpecificTimes([...specificTimes, '12:00']);
  const handleRemoveTime = (index: number) => setSpecificTimes(specificTimes.filter((_, i) => i !== index));
  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...specificTimes];
    newTimes[index] = value;
    setSpecificTimes(newTimes);
  };

  const handleSave = async () => {
    try {
      const cfg = await window.electronAPI.config.get();
      cfg.server.autoRestart = enabled;
      cfg.server.restartIntervalHours = intervalHours;
      cfg.server.restartDays = selectedDays;
      cfg.server.restartMode = mode;
      if (mode === 'specific') cfg.server.restartSchedule = specificTimes.filter(Boolean);
      else cfg.server.restartSchedule = [];
      cfg.server.robotScheduleEnabled = robotEnabled;
      cfg.server.robotEnableTime = robotOnTime;
      cfg.server.robotDisableTime = robotOffTime;
      cfg.server.robotEnableDays = robotOnDays;
      cfg.server.robotDisableDays = robotOffDays;
      await window.electronAPI.config.set(cfg);
      setSnack({ open: true, message: t('scheduler', 'saved'), severity: 'success' });
    } catch (e: any) { setSnack({ open: true, message: e.message, severity: 'error' }); }
  };

  const dayChips = (days: number[], setDays: (d: number[]) => void, onColor: 'success' | 'error' | 'primary', offColor: 'default') => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flex: 1 }}>
      {DAYS.map((day, i) => (
        <Chip key={i} label={t('scheduler', day)} size="small"
          color={days.includes(i) ? onColor : 'default'}
          variant={days.includes(i) ? 'filled' : 'outlined'}
          onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i])} />
      ))}
    </Box>
  );

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
        <ScheduleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />{t('scheduler', 'title')}
      </Typography>

      {!config ? (
        <Typography color="text.secondary">{t('common', 'loading')}</Typography>
      ) : (
        <Card>
          <CardContent>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab icon={<ScheduleIcon />} label={t('scheduler', 'tabRestart')} iconPosition="start" />
              <Tab icon={<SmartToyIcon />} label={t('scheduler', 'tabRobots')} iconPosition="start" />
            </Tabs>

            {tab === 0 && (
              <Box>
                <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                  label={t('scheduler', 'enable')} sx={{ mb: 2 }} />
                {enabled && (
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('scheduler', 'advanced')}</InputLabel>
                        <Select value={mode} label={t('scheduler', 'advanced')}
                          onChange={(e) => setMode(e.target.value as 'interval' | 'specific')}>
                          <MenuItem value="specific">{t('scheduler', 'specificTimes')}</MenuItem>
                          <MenuItem value="interval">{t('scheduler', 'everyXHours')}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>

                    {mode === 'interval' ? (
                      <Grid item xs={12} sm={4}>
                        <TextField fullWidth type="number" label={t('scheduler', 'everyXHoursLabel')}
                          value={intervalHours}
                          onChange={(e) => setIntervalHours(Math.max(1, parseInt(e.target.value) || 1))}
                          size="small" InputProps={{ inputProps: { min: 1, max: 168 } }} />
                      </Grid>
                    ) : (
                      <>
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('scheduler', 'specificTimes')}</Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                            {specificTimes.map((time, i) => (
                              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TextField type="time" value={time}
                                  onChange={(e) => handleTimeChange(i, e.target.value)}
                                  size="small" sx={{ width: 130 }} InputLabelProps={{ shrink: true }} />
                                <IconButton size="small" color="error" onClick={() => handleRemoveTime(i)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ))}
                          </Box>
                          <Button startIcon={<AddIcon />} size="small" onClick={handleAddTime}>
                            {t('scheduler', 'addTime')}
                          </Button>
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('scheduler', 'everyDay')}</Typography>
                          {dayChips(selectedDays, setSelectedDays, 'primary', 'default')}
                        </Grid>
                      </>
                    )}

                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {mode === 'specific' && specificTimes.map((t, i) => (
                          <Chip key={i} icon={<ScheduleIcon />} label={t} onDelete={() => handleRemoveTime(i)} size="small" />
                        ))}
                        {mode === 'interval' && (
                          <Chip icon={<ScheduleIcon />} label={`${t('scheduler', 'everyXHoursLabel')}: ${intervalHours}`} size="small" />
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                )}
              </Box>
            )}

            {tab === 1 && (
              <Box>
                <FormControlLabel control={<Switch checked={robotEnabled} onChange={(e) => setRobotEnabled(e.target.checked)} />}
                  label={t('scheduler', 'robotEnable')} sx={{ mb: 2 }} />
                {robotEnabled && (
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" sx={{ color: '#3fb950', mb: 1 }}>🟢 {t('scheduler', 'robotOn')}</Typography>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <TextField type="time" label={t('scheduler', 'robotTime')} value={robotOnTime}
                          onChange={(e) => setRobotOnTime(e.target.value)} size="small"
                          InputLabelProps={{ shrink: true }} sx={{ width: 130 }} />
                        {dayChips(robotOnDays, setRobotOnDays, 'success', 'default')}
                      </Box>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" sx={{ color: '#f85149', mb: 1 }}>🔴 {t('scheduler', 'robotOff')}</Typography>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <TextField type="time" label={t('scheduler', 'robotTime')} value={robotOffTime}
                          onChange={(e) => setRobotOffTime(e.target.value)} size="small"
                          InputLabelProps={{ shrink: true }} sx={{ width: 130 }} />
                        {dayChips(robotOffDays, setRobotOffDays, 'error', 'default')}
                      </Box>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" sx={{ color: '#8b949e' }}>
                        {t('scheduler', 'robotNote')}
                      </Typography>
                    </Grid>
                  </Grid>
                )}
              </Box>
            )}

            <Button variant="contained" onClick={handleSave} sx={{ mt: 3 }}>
              {t('common', 'save')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}