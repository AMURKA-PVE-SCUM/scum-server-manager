import React, { Component, ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

function getLang(): string {
  try { return localStorage.getItem('lang') || 'ru'; } catch { return 'ru'; }
}

const errorText: Record<string, { title: string; home: string }> = {
  ru: { title: 'Произошла ошибка', home: 'Вернуться на главную' },
  en: { title: 'An error occurred', home: 'Return Home' },
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      const msg = `[RENDERER ERROR] ${error.message}\n${error.stack}\nComponent: ${info.componentStack}`;
      console.error(msg);
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      const lang = getLang();
      const text = errorText[lang] || errorText.ru;
      return (
        <Box sx={{ p: 4, bgcolor: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ color: '#f85149' }}>{text.title}</Typography>
          <Box sx={{ bgcolor: '#161b22', p: 2, borderRadius: 1, maxWidth: 600, overflow: 'auto', fontFamily: 'monospace', fontSize: 12, color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </Box>
          <Button variant="contained" onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '/'; }}>
            {text.home}
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}