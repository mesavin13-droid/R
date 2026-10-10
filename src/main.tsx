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
// disabled) so updateViaCache is 'none': the SW update check must always refetch
// sw.js instead of trusting the HTTP cache, otherwise a deployed build is never
// picked up by clients that already have a Service Worker installed.
//
// Version switching is handled entirely by the build-id gate in index.html:
// it purges caches + SW and reloads exactly once. We deliberately do NOT also
// reload on 'controllerchange' here — doing both creates a reload loop in
// Telegram's WebView (each reload re-triggers a controllerchange), which is what
// left the app stuck on a spinner.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[SW] registration failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);