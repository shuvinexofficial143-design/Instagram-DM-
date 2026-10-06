import React, { useLayoutEffect } from 'react';
import { MessageCircle, Sparkles, Zap } from 'lucide-react';

type AppSplashScreenProps = {
  exiting?: boolean;
};

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ exiting = false }) => {
  useLayoutEffect(() => {
    // Remove the initial HTML loader only after its React replacement has committed.
    document.getElementById('boot-screen')?.remove();
  }, []);
  return (
    <div
      className={`app-splash-screen${exiting ? ' is-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Auto Replies is loading"
    >
      <div className="app-splash-flow" aria-hidden="true">
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path d="M-100 670 C180 100 430 920 780 400 S1220 50 1540 300" />
          <path d="M-100 750 C230 220 440 1020 810 520 S1270 130 1540 420" />
        </svg>
      </div>
      <div className="app-splash-glow app-splash-glow-a" aria-hidden="true" />
      <div className="app-splash-glow app-splash-glow-b" aria-hidden="true" />

      <div className="app-splash-content">
        <div className="app-splash-mark" aria-hidden="true">
          <span className="app-splash-orbit app-splash-orbit-one" />
          <span className="app-splash-orbit app-splash-orbit-two" />
          <span className="app-splash-chat app-splash-chat-one"><MessageCircle /></span>
          <span className="app-splash-chat app-splash-chat-two"><Sparkles /></span>
          <span className="app-splash-logo">
            <Zap />
          </span>
        </div>

        <div className="app-splash-copy">
          <div className="app-splash-brand-row">
            <span className="app-splash-brand">Auto Replies</span>
            <span className="app-splash-live-dot" />
          </div>
          <p>Smart Instagram conversations, ready in a moment.</p>
        </div>

        <div className="app-splash-progress" aria-hidden="true">
          <span className="app-splash-progress-bar" />
        </div>

        <div className="app-splash-status">
          <span className="app-splash-status-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Preparing your workspace</span>
        </div>
      </div>
    </div>
  );
};
