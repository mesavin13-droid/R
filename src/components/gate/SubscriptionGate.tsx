import React, { useState } from 'react';
import { RefreshCw, Send, ExternalLink, Radio } from 'lucide-react';
import { ChannelSubscriptionStatus } from '../../services/telegramService';

interface SubscriptionGateProps {
  status: ChannelSubscriptionStatus;
  checking: boolean;
  onCheck: () => void;
}

function openChannel(link: string): void {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(link);
    return;
  }
  window.open(link, '_blank', 'noopener');
}

export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({ status, checking, onCheck }) => {
  const [opened, setOpened] = useState(false);
  const channel = status.channel || null;
  const checkFailed = Boolean(status.error);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6 bg-graphite text-center select-none">
      <div className="w-full max-w-sm p-7 sm:p-8 bg-surface-800/70 backdrop-blur-3xl border border-white/[0.06] rounded-[32px] shadow-[0_24px_64px_rgba(0,0,0,0.8)] space-y-6 flex flex-col items-center animate-in zoom-in-95 duration-300">
        {/* Icon with pulsing rings */}
        <div className="relative w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center border border-accent/25">
          <div className="absolute inset-0 rounded-full border border-accent/30 animate-ping opacity-75" />
          <Radio className="w-9 h-9 text-accent" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-white tracking-tight uppercase">ROADLIVE</h1>
          <p className="text-xs text-muted leading-relaxed">
            Чтобы открыть карту, подпишитесь на канал сообщества — это бесплатно и навсегда снимает вопрос «кто ты и зачем ты здесь».
          </p>
        </div>

        {/* Channel card */}
        {channel && (
          <div className="w-full p-4 rounded-2xl bg-surface-900 border border-white/10 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent to-accent-deep flex items-center justify-center shadow-lg shrink-0">
                <Send className="w-5 h-5 text-white" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {channel.username ? `@${channel.username}` : 'Канал сообщества'}
                </p>
                <p className="text-[10px] text-muted">
                  Дорожное сообщество водителей
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setOpened(true);
                openChannel(channel.link);
              }}
              className="w-full py-3 rounded-xl bg-telegram text-white text-xs font-extrabold tracking-wide flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Открыть канал и подписаться
            </button>
          </div>
        )}

        {checkFailed && (
          <div className="w-full text-left p-3 rounded-xl bg-danger/10 border border-danger/25">
            <p className="text-[11px] text-danger-soft leading-relaxed">
              Не удалось проверить подписку: {status.error}. Убедитесь, что бот добавлен администратором в канал.
            </p>
          </div>
        )}

        <div className="w-full space-y-2.5">
          <button
            onClick={onCheck}
            disabled={checking}
            className="w-full py-3.5 bg-white/5 hover:bg-white/10 active:scale-95 text-white font-extrabold text-xs rounded-2xl transition border border-white/10 tracking-wider uppercase flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Проверяем...' : opened ? 'Я подписался — проверить' : 'Проверить подписку'}
          </button>
        </div>

        <div className="pt-1 text-[10px] text-faintest uppercase tracking-widest font-bold">
          Подписка проверяется автоматически
        </div>
      </div>
    </div>
  );
};