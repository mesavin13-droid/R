import React, { useState, useEffect } from 'react';
import { MapPin, HelpCircle, Bell, X, ArrowRight, CheckCircle2 } from 'lucide-react';

interface OnboardingTutorialProps {
  onClose: () => void;
}

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Smooth entry after the splash screen settles
    const timer = setTimeout(() => setIsVisible(true), 700);
    return () => clearTimeout(timer);
  }, []);

  const steps = [
    {
      title: '🚧 Сообщайте о дорожных событиях',
      description: 'Видите ДТП, закрытый переезд или засаду ДПС? Нажмите кнопку «+» на карте, выберите точную точку и предупредите всех водителей в реальном времени.',
      icon: <MapPin className="w-6 h-6 text-accent" />,
      badge: 'Карта и События',
    },
    {
      title: '❓ Задавайте вопросы и отвечайте',
      description: 'Интересует ситуация на конкретном переезде? Поставьте интерактивную метку вопроса на карте. Водители поблизости получат пуш-уведомление и сразу ответят.',
      icon: <HelpCircle className="w-6 h-6 text-purple" />,
      badge: 'Интерактивные метки',
    },
    {
      title: '🔔 Мгновенные гео-пуши',
      description: 'Активируйте уведомления в профиле, чтобы автоматически получать предупреждения, если прямо перед вами закрылся переезд или возник затор.',
      icon: <Bell className="w-6 h-6 text-info-2" />,
      badge: 'Будьте в курсе',
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem('roadlive_tutorial_completed', 'true');
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  if (!isVisible) return null;

  const step = steps[currentStep];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Обучение работе с ROADLIVE"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-300 select-none"
    >
      <div className="relative w-full max-w-sm bg-surface-800/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col text-ink transition-all duration-300 scale-100">
        
        {/* Progress header */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
            {step.badge}
          </span>
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep ? 'bg-accent w-4' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Core content */}
        <div className="flex flex-col items-center text-center space-y-4 py-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center shadow-inner">
            {step.icon}
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">
            {step.title}
          </h3>
          <p className="text-xs text-muted leading-relaxed max-w-[280px]">
            {step.description}
          </p>
        </div>

        {/* Action Button Segment */}
        <div className="mt-6 flex items-center gap-2.5">
          {currentStep > 0 ? (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-semibold text-muted transition active:scale-95 cursor-pointer"
            >
              Назад
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-semibold text-muted transition active:scale-95 cursor-pointer"
            >
              Пропустить
            </button>
          )}

          <button
            onClick={handleNext}
            className="flex-1 py-3 bg-accent hover:bg-accent-strong text-white font-semibold text-xs rounded-xl transition active:scale-95 shadow-lg shadow-accent/25 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {currentStep === steps.length - 1 ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Поехали!</span>
              </>
            ) : (
              <>
                <span>Далее</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Close Button top-right */}
        <button
          onClick={handleComplete}
          className="absolute top-4 right-4 p-1 rounded-full bg-white/5 text-muted hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
