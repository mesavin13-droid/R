import React, { useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-2 bg-surface-700 hover:bg-white/10 text-white text-xs font-medium rounded-2xl border border-white/10 shadow-xs transition active:scale-95 whitespace-nowrap"
        title="Установить ROADLIVE на устройство"
      >
        <Download className="w-3.5 h-3.5 text-accent" />
        <span className="hidden sm:inline">Установить</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-surface-700 hover:bg-white/10 border border-white/10 rounded-2xl transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5 text-accent" />
          <span className="hidden sm:inline">На экран</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
            <div className="w-full max-w-sm rounded-2xl graphite-sheet p-5 text-white">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-accent" />
                  Установка на iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-muted hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3.5 text-xs text-muted leading-relaxed">
                1. Нажмите кнопку <strong className="text-white">«Поделиться»</strong> <Share2 className="inline w-3 h-3 text-accent" /> в Safari.
                <br />
                2. Выберите <strong className="text-white">«На экран Домой»</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-accent py-2.5 text-xs font-medium text-white hover:bg-accent-strong transition active:scale-95"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
