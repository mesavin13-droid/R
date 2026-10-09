import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Keeps a render failure from turning the whole Mini App into a black screen:
 * the user gets a reload action instead of a dead webview.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ROADLIVE] Render failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#111315] text-center">
        <div className="w-full max-w-sm p-7 bg-[#181B1F] border border-white/[0.08] rounded-3xl space-y-4">
          <div className="text-3xl">⚠️</div>
          <h1 className="text-lg font-bold text-white">Что-то пошло не так</h1>
          <p className="text-xs text-[#9AA0A8] leading-relaxed">
            Приложение не смогло отобразить экран. Перезагрузите его — данные
            и ваш профиль сохранятся.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-2xl bg-[#24A1DE] text-white text-xs font-bold"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
