import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, UserProfile } from '../../types';
import { ChatService } from '../../services/chatService';
import { CHAT_CHANNEL_GROUPS } from '../../data/chatData';
import {
  Send, MapPin, Radio, Navigation
} from 'lucide-react';

interface DriverChatProps {
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  onFocusMap: (lat: number, lng: number) => void;
}

export const DriverChat: React.FC<DriverChatProps> = ({
  currentUser,
  userCoords,
  onFocusMap,
}) => {
  const channels = ChatService.getChannels();
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0].id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [includeLocation] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

  const reloadMessages = () => {
    setMessages(ChatService.getMessages(selectedChannelId));
  };

  useEffect(() => {
    reloadMessages();
    void ChatService.refreshFromServer(selectedChannelId).then(reloadMessages);
    const unsub = ChatService.subscribe(() => {
      reloadMessages();
    });

    // The live "efir" relies on a WebSocket, which the serverless host
    // (Vercel) can't keep open. So we poll the same HTTP endpoint the fallback
    // uses — this is what makes new messages actually appear for everyone on
    // production. Pauses while the tab is hidden to save battery/data.
    let pollTimer: any = null;
    const poll = () => {
      if (document.visibilityState === 'visible') {
        void ChatService.refreshFromServer(selectedChannelId).then(reloadMessages);
      }
    };
    pollTimer = setInterval(poll, 5000);

    return () => {
      unsub();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [selectedChannelId]);

  useEffect(() => {
    // Only auto-scroll when the user is already near the bottom. Previously the
    // poll re-rendered every 5s and yanked the view to the bottom, which felt
    // like the screen kept reloading/jumping while reading older messages.
    const el = messagesEndRef.current;
    if (!el) return;
    const nearBottom =
      window.innerHeight + window.scrollY >= document.body.scrollHeight - 200;
    if (nearBottom) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      const loc = includeLocation && userCoords
        ? { name: 'Моё местоположение', lat: userCoords.lat, lng: userCoords.lng }
        : undefined;

      await ChatService.sendMessage(selectedChannelId, text, currentUser, loc);
      setInputText('');
      reloadMessages();
    } finally {
      setIsSending(false);
    }
  };

  const handleReaction = (msgId: string, emoji: string) => {
    ChatService.addReaction(msgId, emoji);
    reloadMessages();
  };

  const getTimeAgo = (dateStr: string) => {
    const elapsedMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.max(0, Math.round(elapsedMs / (60 * 1000)));
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин`;
    const hours = Math.round(mins / 60);
    return `${hours} ч`;
  };

  const driverPresets = [
    'Димитровский мост свободен',
    'Троллейная переезд открыт',
    'На Большевистской авария',
    'Где сейчас экипажи контроля?',
    'Очереди нет, свободно',
    'Спасибо за инфу 🤝',
  ];

  return (
    <div className="h-full flex flex-col bg-graphite overflow-hidden pb-16 select-none">
      {/* Top Header & Channels Bar */}
      <div className="bg-surface-800/80 backdrop-blur-2xl border-b border-white/[0.08] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3.5 max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-surface-700 border border-white/10 text-accent flex items-center justify-center font-bold">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                  {activeChannel.name}
                </h1>
              </div>
              <p className="text-xs text-muted truncate mt-0.5">{activeChannel.description}</p>
            </div>
          </div>
        </div>

        {/* Channels — grouped by category (Общее / Мосты / Районы) */}
        <div className="flex flex-col gap-2 max-w-2xl mx-auto">
          {CHAT_CHANNEL_GROUPS.map((group) => {
            const groupChannels = channels.filter((c) => c.group === group.id);
            if (groupChannels.length === 0) return null;
            return (
              <div key={group.id} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-faintest shrink-0 w-[54px] leading-tight">
                  {group.label}
                </span>
                {groupChannels.map((ch) => {
                  const isSelected = ch.id === selectedChannelId;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => setSelectedChannelId(ch.id)}
                      title={ch.description}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all select-none ${
                        isSelected
                          ? 'bg-surface-700 text-white border border-accent/60 shadow-xs'
                          : 'bg-surface-800 text-muted border border-white/[0.06] hover:text-white'
                      }`}
                    >
                      <span>{ch.icon}</span>
                      <span>{ch.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 max-w-2xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-10 h-10 rounded-2xl bg-surface-700 border border-white/10 text-accent mx-auto flex items-center justify-center mb-3">
              <Radio className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-white">В эфире пока тихо</p>
            <p className="text-xs text-muted mt-1 mb-4">
              Сообщите обстановку на вашем маршруте
            </p>
            <button
              onClick={() => handleSendMessage('Всем привет! Как обстановка на дорогах?')}
              className="px-4 py-2 bg-accent hover:bg-accent-strong text-white text-xs font-medium rounded-xl transition active:scale-95"
            >
              Выйти в эфир
            </button>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.userId === currentUser.id;

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all`}
              >
                {/* Meta info */}
                <div className="flex items-center gap-1.5 px-2 mb-1 text-[11px] text-muted">
                  <span className="font-medium text-white">{m.userName}</span>
                  <span>· ★ {m.userRating.toFixed(1)}</span>
                  <span>· {getTimeAgo(m.createdAt)}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`relative max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed border ${
                    isMe
                      ? 'bg-graphite-925 text-white border-accent/40 rounded-br-xs'
                      : 'bg-surface-800 text-ink border-white/[0.08] rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {/* Location attachment chip */}
                  {m.locationName && (
                    <div
                      onClick={() => {
                        if (m.latitude && m.longitude) {
                          onFocusMap(m.latitude, m.longitude);
                        }
                      }}
                      className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-normal w-fit cursor-pointer transition bg-white/5 hover:bg-white/10 text-accent border border-white/5"
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{m.locationName}</span>
                      <Navigation className="w-2.5 h-2.5 shrink-0 opacity-70 ml-0.5" />
                    </div>
                  )}

                  {/* Reactions */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {m.reactions &&
                      Object.entries(m.reactions).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(m.id, emoji)}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-white hover:bg-white/10 transition flex items-center gap-1"
                        >
                          <span>{emoji}</span>
                          <span>{count}</span>
                        </button>
                      ))}

                    <div className="inline-flex gap-1 opacity-60 hover:opacity-100 transition">
                      {['👍', '🤝', '⚠️'].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => handleReaction(m.id, emoji)}
                          className="hover:scale-110 transition text-xs p-0.5"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Section */}
      <div className="p-3 sm:p-4 bg-surface-800/90 backdrop-blur-2xl border-t border-white/[0.08] max-w-2xl mx-auto w-full">
        {/* Quick Driver Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
          {driverPresets.map((preset) => (
            <button
              key={preset}
              onClick={() => handleSendMessage(preset)}
              className="px-3 py-1 bg-surface-700 hover:bg-white/10 text-ink text-xs font-normal rounded-xl whitespace-nowrap transition active:scale-95 border border-white/[0.06] shrink-0"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1 flex items-center bg-graphite rounded-xl px-4 py-2 border border-white/[0.08] focus-within:border-accent/60 transition">
            <input
              type="text"
              placeholder="Сообщение в эфир..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full text-xs sm:text-sm bg-transparent outline-none text-white placeholder:text-faint"
            />
          </div>

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="p-2.5 bg-accent hover:bg-accent-strong disabled:opacity-30 text-white rounded-xl transition active:scale-95 shadow-xs shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
