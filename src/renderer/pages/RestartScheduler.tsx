import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Switch, FormControlLabel,
  Grid, TextField, IconButton, Chip, Snackbar, Alert,
  ToggleButton, ToggleButtonGroup, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useTranslation } from '../contexts/LanguageContext';

const DAYS = ['dayMonday', 'dayTuesday', 'dayWednesday', 'dayThursday', 'dayFriday', 'daySaturday', 'daySunday'];

export function RestartScheduler() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'interval' | 'specific'>('specific');
  const [intervalHours, setIntervalHours] = useState(4);
  const [specificTimes, setSpecificTimes] = useState<string[]>(['06:00', '12:00', '18:00', '00:00']);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const cfg = await window.electronAPI.config.get();
    setConfig(cfg);
    if (cfg.server?.restartSchedule) setSpecificTimes(cfg.server.restartSchedule);
    if (cfg.server?.restartIntervalHours) setIntervalHours(cfg.server.restartIntervalHours);
    if (cfg.server?.restartDays) setSelectedDays(cfg.server.restartDays);
    if (cfg.server?.restartMode) setMode(cfg.server.restartMode);
    setEnabled(cfg.server?.autoRestart || false);
  };

  const handleAddTime = () => setSpecificTimes([...specificTimes, '12:00']);
  const handleRemoveTime = (index: number) => setSpecificTimes(specificTimes.filter((_, i) => i !== index));
  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...specificTimes];
    newTimes[index] = value;
    setSpecificTimes(newTimes);
  };
  const handleDayToggle = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    try {
      const cfg = await window.electronAPI.config.get();
      cfg.server.autoRestart = enabled;
      cfg.server.restartIntervalHours = intervalHours;
      cfg.server.restartDays = selectedDays;
      cfg.server.restartMode = mode;
      if (mode === 'specific') {
        cfg.server.restartSchedule = specificTimes.filter(Boolean);
      } else {
        cfg.server.restartSchedule = [];
      }
      await window.electronAPI.config.set(cfg);
      setSnack({ open: true, message: t('scheduler', 'saved'), severity: 'success' });
    } catch (e: any) {
      setSnack({ open: true, message: e.message, severity: 'error' });
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
        <ScheduleIcon /> {t('scheduler', 'title')}
      </Typography>

      {!config ? (
        <Typography color="text.secondary">{t('common', 'loading')}</Typography>
      ) : (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <FormControlLabel
                control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                label={t('scheduler', 'enable')}
                sx={{ mb: 2 }}
              />

              {enabled && (
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{t('scheduler', 'advanced')}</InputLabel>
                      <Select
                        value={mode}
                        label={t('scheduler', 'advanced')}
                        onChange={(e) => setMode(e.target.value as 'interval' | 'specific')}
                      >
                        <MenuItem value="specific">{t('scheduler', 'specificTimes')}</MenuItem>
                        <MenuItem value="interval">{t('scheduler', 'everyXHours')}</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  {mode === 'interval' ? (
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        type="number"
                        label={t('scheduler', 'everyXHoursLabel')}
                        value={intervalHours}
                        onChange={(e) => setIntervalHours(Math.max(1, parseInt(e.target.value) || 1))}
                        size="small"
                        InputProps={{ inputProps: { min: 1, max: 168 } }}
                      />
                    </Grid>
                  ) : (
                    <>
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          {t('scheduler', 'specificTimes')}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                          {specificTimes.map((time, i) => (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <TextField
                                type="time"
                                value={time}
                                onChange={(e) => handleTimeChange(i, e.target.value)}
                                size="small"
                                sx={{ width: 140 }}
                                InputLabelProps={{ shrink: true }}
                              />
                              <IconButton size="small" color="error" onClick={() => handleRemoveTime(i)}>
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          ))}
                        </Box>
                        <Button startIcon={<AddIcon />} size="small" onClick={handleAddTime}>
                          {t('scheduler', 'addTime')}
                        </Button>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          {t('scheduler', 'everyDay')}
                        </Typography>
                        <ToggleButtonGroup
                          value={selectedDays}
                          onChange={(_, days) => days && setSelectedDays(days)}
                          size="small"
                        >
                          {DAYS.map((day, i) => (
                            <ToggleButton key={i} value={i} sx={{ px: 1.5 }}>
                              {t('scheduler', day)}
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      </Grid>
                    </>
                  )}

                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {mode === 'specific' && specificTimes.map((time, i) => (
                        <Chip key={i} icon={<ScheduleIcon />} label={time} onDelete={() => handleRemoveTime(i)} size="small" />
                      ))}
                      {mode === 'interval' && (
                        <Chip icon={<ScheduleIcon />} label={`${t('scheduler', 'everyXHoursLabel')}: ${intervalHours}`} size="small" />
                      )}
                    </Box>
                  </Grid>
                </Grid>
              )}
            </CardContent>
          </Card>

          <Button variant="contained" onClick={handleSave}>
            {t('common', 'save')}
          </Button>
        </>
      )}

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
}