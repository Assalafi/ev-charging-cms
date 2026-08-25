// Import polyfills first to ensure Node.js globals are available
import './polyfills';

import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import App from './App';
import { createAppTheme } from './theme';
import './styles/global.css';
import { AuthProvider } from './contexts/AuthContext';
import { MQTTProvider } from './contexts/MQTTContext';
import { BrandingProvider, useBranding } from './contexts/BrandingContext';

function BrandedApplication() {
  const { branding } = useBranding();
  const theme = useMemo(() => createAppTheme(branding.primaryColor, branding.secondaryColor), [branding.primaryColor, branding.secondaryColor]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <MQTTProvider>
          <App />
        </MQTTProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
// Configure the future flags
window.__reactRouterFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <BrandingProvider>
        <BrandedApplication />
      </BrandingProvider>
    </BrowserRouter>
  </React.StrictMode>
);
