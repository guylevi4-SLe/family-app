import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, rememberError } from './components/ErrorBoundary';
import './styles.css';
import { applyPalette, readPalette } from './theme';
import { reloadOnNewVersion } from './swUpdate';

applyPalette(readPalette());
reloadOnNewVersion();

window.addEventListener('error', (e) => rememberError(e.message));
window.addEventListener('unhandledrejection', (e) => rememberError(String(e.reason?.message ?? e.reason)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
