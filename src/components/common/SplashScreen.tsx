import { colors } from '../../theme/tokens';
import React, { useState, useEffect } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Stage 1: Point appears (0 - 320ms)
    const t1 = setTimeout(() => setStage(2), 320);
    // Stage 2: Route line extends & mark reveals (320 - 800ms)
    const t2 = setTimeout(() => setStage(3), 800);
    // Stage 3: Wordmark & slogan settle and shine (800 - 1650ms)
    const t3 = setTimeout(() => {
      setStage(4);
      setIsFadingOut(true);
    }, 1650);
    // Stage 4: Total splash duration: 2.0s (2000ms)
    const t4 = setTimeout(() => {
      onComplete();
    }, 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-graphite select-none transition-opacity duration-350 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Central Mark & Wordmark */}
      <div className="flex flex-col items-center justify-center gap-5 text-center px-6">
        {/* Animated Mark */}
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Subtle Ambient Glow Ring */}
          <div
            className={`absolute inset-0 rounded-3xl bg-accent/15 filter blur-xl transition-all duration-700 ${
              stage >= 2 ? 'opacity-100 scale-105' : 'opacity-0 scale-90'
            }`}
          />

          <svg
            viewBox="0 0 100 100"
            className="w-full h-full relative z-10"
            fill="none"
          >
            {/* Mark Background Container */}
            <rect
              width="100"
              height="100"
              rx="28"
              fill={colors.surface800}
              stroke="rgba(255,255,255,0.08)"
              className={`transition-opacity duration-500 ${
                stage >= 2 ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Letter R Stem & Loop */}
            <path
              d="M28 72 L28 28 L56 28 C67 28 74 35 74 44 C74 53 67 60 56 60 L28 60"
              stroke={colors.ink}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="180"
              strokeDashoffset={stage >= 2 ? '0' : '180'}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />

            {/* Route Branch Leg */}
            <path
              d="M50 58 L72 74"
              stroke={colors.ink}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="40"
              strokeDashoffset={stage >= 2 ? '0' : '40'}
              style={{ transition: 'stroke-dashoffset 0.5s 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />

            {/* Cold Blue Location Dot */}
            <circle
              cx="72"
              cy="74"
              r="5.5"
              fill={colors.accent}
              className={`transition-all duration-500 delay-300 ${
                stage >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
              }`}
              style={{ transformOrigin: '72px 74px' }}
            />
            <circle
              cx="72"
              cy="74"
              r="9.5"
              stroke={colors.accent}
              strokeWidth="1.5"
              className={`transition-all duration-700 delay-400 ${
                stage >= 2 ? 'opacity-40 scale-100' : 'opacity-0 scale-50'
              }`}
              style={{ transformOrigin: '72px 74px' }}
            />
          </svg>
        </div>

        {/* Wordmark & Slogan */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`flex items-center gap-2 transition-all duration-500 ${
              stage >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            <span className="text-xl sm:text-2xl font-bold tracking-[0.2em] text-ink pl-1 font-mono">
              ROADLIVE
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          </div>

          <p
            className={`text-xs sm:text-[13px] text-muted font-normal tracking-wide transition-all duration-500 delay-100 ${
              stage >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
          >
            Что происходит на дороге прямо сейчас
          </p>
        </div>
      </div>
    </div>
  );
};
