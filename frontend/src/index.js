// Import polyfills first to ensure Node.js globals are available
import './polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import App from './App';
import theme from './theme';
import { AuthProvider } from './contexts/AuthContext';
import { MQTTProvider } from './contexts/MQTTContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
// Configure the future flags
window.__reactRouterFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <MQTTProvider>
            <App />
          </MQTTProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
