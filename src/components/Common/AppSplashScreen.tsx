import { useLayoutEffect } from 'react';
import { BrandMark } from './BrandMark';

type AppSplashScreenProps = { exiting?: boolean; statusText?: string };

export const AppSplashScreen = ({
  exiting = false,
  statusText = 'Preparing your workspace…',
}: AppSplashScreenProps) => {
  // Hand off before paint; the HTML loader and this component share one stylesheet.
  useLayoutEffect(() => { document.getElementById('boot-screen')?.remove(); }, []);

  return (
    <div className={`brand-loading${exiting ? ' is-exiting' : ''}`} role="status" aria-live="polite" aria-label="Auto Replys is loading">
      <div className="brand-loading-top" aria-hidden="true">
        <span className="brand-loading-wordmark"><BrandMark size={28} />Auto Replys</span>
        <span className="brand-loading-edition">INSTAGRAM AUTOMATION</span>
      </div>
      <div className="brand-loading-content">
        <div className="brand-loading-stage" aria-hidden="true">
          <div className="brand-loading-orbit"><i /></div>
          <div className="brand-loading-orbit brand-loading-orbit-inner" />
          <div className="brand-loading-message brand-loading-message-in">
            <span className="brand-loading-message-label">MESSAGE</span>
            <span className="brand-loading-dots"><i /><i /><i /></span>
          </div>
          <div className="brand-loading-symbol"><BrandMark size={88} /></div>
          <div className="brand-loading-message brand-loading-message-out">
            <span className="brand-loading-message-label">REPLY</span>
            <span className="brand-loading-reply-line"><i /><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </div>
        </div>
        <p className="brand-loading-eyebrow">A LITTLE LESS BUSYWORK</p>
        <strong className="brand-loading-title">Auto Replys<span>.</span></strong>
        <p className="brand-loading-tagline">Make room for more conversations.</p>
        <div className="brand-loading-track" aria-hidden="true"><span /></div>
        <p className="brand-loading-status">{statusText}</p>
      </div>
      <div className="brand-loading-footer" aria-hidden="true"><span>DMs</span><i /><span>Comments</span><i /><span>Connections</span></div>
    </div>
  );
};
