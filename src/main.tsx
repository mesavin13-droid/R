import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { YandexMapsService } from './services/yandexMapsService';

// Preload Yandex Maps JS API immediately on launch to eliminate initialization delay
YandexMapsService.loadYandexMaps().catch((err) => {
  console.warn('[Preload] Yandex Maps preloader:', err);
});

createRoot(document.getElementById('root')!).render(<App />);
