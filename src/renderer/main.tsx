import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, GlobalStyles } from '@mui/material';
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
    primary: { main: '#58a6ff', light: '#79c0ff', dark: '#388bfd', contrastText: '#0d1117' },
    secondary: { main: '#f0883e' },
    background: { default: '#000000', paper: '#0a0a0c' },
    text: { primary: '#e6edf3', secondary: '#8b949e' },
    divider: '#30363d',
    error: { main: '#f85149' },
    warning: { main: '#d29922' },
    success: { main: '#3fb950' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    h4: { fontWeight: 700, fontSize: '1.5rem' },
    h5: { fontWeight: 700, fontSize: '1.25rem' },
    h6: { fontWeight: 600, fontSize: '1rem' },
    body2: { color: '#8b949e' },
    button: { letterSpacing: '0.02em' },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#0a0a0c',
          border: '1px solid #21262d',
          backgroundImage: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease',
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            borderColor: '#30363d',
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { '&:last-child': { paddingBottom: 16 } } },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: 6 },
        containedPrimary: {
          backgroundImage: 'linear-gradient(180deg,#6cb6ff,#58a6ff)',
          boxShadow: '0 1px 3px rgba(22,27,34,0.4)',
          '&:hover': {
            backgroundImage: 'linear-gradient(180deg,#58a6ff,#388bfd)',
            boxShadow: '0 2px 8px rgba(88,166,255,0.25)',
          },
        },
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        outlined: {
          borderColor: '#30363d',
          '&:hover': { borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.08)' },
        },
        text: { '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' } },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#000000',
            borderRadius: 8,
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            '& fieldset': { borderColor: '#30363d' },
            '&:hover fieldset': { borderColor: '#8b949e' },
            '&.Mui-focused fieldset': { borderColor: '#58a6ff', borderWidth: 1 },
            '&.Mui-focused': {
              boxShadow: '0 0 0 3px rgba(88,166,255,0.15)',
            },
          },
          '& .MuiInputLabel-root': { color: '#8b949e' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { '&.MuiChip-outlined': { borderColor: '#30363d' }, borderRadius: 6 },
        outlined: { borderColor: '#30363d' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#21262d',
          border: '1px solid #30363d',
          color: '#e6edf3',
          fontSize: 12,
          fontFamily: "'Segoe UI', sans-serif",
        },
        arrow: { color: '#21262d' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: '1px solid #21262d', backgroundColor: '#000000' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          backgroundColor: '#1c2128', color: '#e6edf3', borderRadius: 6,
          '& .MuiAlert-icon': { color: 'inherit' },
          '&.MuiAlert-standardSuccess': { border: '1px solid #3fb950' },
          '&.MuiAlert-standardError': { border: '1px solid #f85149' },
          '&.MuiAlert-standardWarning': { border: '1px solid #d29922' },
          '&.MuiAlert-standardInfo': { border: '1px solid #58a6ff' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottomColor: '#21262d', fontSize: 13.5 } },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { transition: 'background-color 0.12s ease', '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' } },
      },
    },
    MuiTableHead: {
      styleOverrides: { root: { '& .MuiTableCell-head': { color: '#8b949e', fontWeight: 700 } } },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', border: '1px solid #21262d', boxShadow: 'none' },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: '#58a6ff', boxShadow: '0 0 8px rgba(88,166,255,0.6)' },
        root: { '& .MuiTab-root': { color: '#8b949e', '&.Mui-selected': { color: '#58a6ff' } } },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0a0a0c',
          border: '1px solid #30363d',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: '#21262d' } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 6, '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' } },
      },
    },
  },
});

const globalStyles = (
  <GlobalStyles
    styles={{
      '*': { scrollbarWidth: 'thin', scrollbarColor: '#30363d transparent' },
      '*::-webkit-scrollbar': { width: 10, height: 10 },
      '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
      '*::-webkit-scrollbar-thumb': {
        backgroundColor: '#30363d',
        borderRadius: 6,
        border: '2px solid #000000',
      },
      '*::-webkit-scrollbar-thumb:hover': { backgroundColor: '#58a6ff' },
      '*::-webkit-scrollbar-corner': { backgroundColor: 'transparent' },
      'body': { backgroundColor: '#000000' },
      'a': { color: '#58a6ff', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
    }}
  />
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        {globalStyles}
        <ErrorBoundary><App /></ErrorBoundary>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
);
