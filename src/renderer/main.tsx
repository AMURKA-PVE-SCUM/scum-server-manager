import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Global renderer error logging
window.onerror = (msg, url, line, col, err) => {
  console.error('[GLOBAL ERROR]', msg, url, line, col, err?.stack);
  try { localStorage.setItem('lastError', JSON.stringify({ msg: String(msg), url, line, col, stack: err?.stack, time: Date.now() })); } catch {}
};
window.onunhandledrejection = (e) => {
  console.error('[UNHANDLED PROMISE]', e.reason?.stack || e.reason);
  try { localStorage.setItem('lastError', JSON.stringify({ msg: String(e.reason), stack: e.reason?.stack, time: Date.now() })); } catch {}
};

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#58a6ff' },
    secondary: { main: '#f0883e' },
    background: { default: '#0d1117', paper: '#161b22' },
    text: { primary: '#e6edf3', secondary: '#8b949e' },
    divider: '#30363d',
    error: { main: '#f85149' },
    warning: { main: '#d29922' },
    success: { main: '#3fb950' },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    h4: { fontWeight: 600, fontSize: '1.5rem' },
    h5: { fontWeight: 600, fontSize: '1.25rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    body2: { color: '#8b949e' },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          backgroundImage: 'none',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { '&:last-child': { paddingBottom: 16 } } },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 500 },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#0d1117',
            '& fieldset': { borderColor: '#30363d' },
            '&:hover fieldset': { borderColor: '#58a6ff' },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { '&.MuiChip-outlined': { borderColor: '#30363d' } },
        outlined: { borderColor: '#30363d' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid #21262d', backgroundColor: '#0d1117' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: '#1c2128', color: '#e6edf3',
          '& .MuiAlert-icon': { color: 'inherit' },
          '&.MuiAlert-standardSuccess': { border: '1px solid #3fb950' },
          '&.MuiAlert-standardError': { border: '1px solid #f85149' },
          '&.MuiAlert-standardWarning': { border: '1px solid #d29922' },
          '&.MuiAlert-standardInfo': { border: '1px solid #58a6ff' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottomColor: '#21262d' } },
    },
    MuiTableHead: {
      styleOverrides: { root: { '& .MuiTableCell-head': { color: '#8b949e', fontWeight: 600 } } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <ErrorBoundary><App /></ErrorBoundary>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
);
