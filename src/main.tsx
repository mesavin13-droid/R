import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import { YandexMapsService } from './services/yandexMapsService';

// Preload Yandex Maps JS API immediately on launch to eliminate initialization delay
YandexMapsService.loadYandexMaps().catch((err) => {
  console.warn('[Preload] Yandex Maps preloader:', err);
});

// Service Worker registration is manual here (vite-plugin-pwa injectRegister is
// disabled) so we control two things the generated script leaves at defaults:
//   1. updateViaCache: 'none' — the SW update check must always refetch sw.js
//      instead of trusting the HTTP cache, otherwise a deployed build is never
//      picked up by clients that already have a Service Worker installed.
//   2. Reload once when a new SW takes control, so the freshly-activated build
//      actually renders instead of the old page running until the next open.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[SW] registration failed:', err));
  });

  let updatedByControllerChange = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updatedByControllerChange) return;
    updatedByControllerChange = true;
    // Skip the very first claim so a fresh visitor is not reloaded out of the
    // gate; only reload when an already-running session learns about a new build.
    if (!navigator.serviceWorker.controller) return;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);