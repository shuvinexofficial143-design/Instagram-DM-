import React, { useLayoutEffect } from 'react';
type AppSplashScreenProps = { exiting?: boolean };
export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ exiting = false }) => {
  useLayoutEffect(() => { document.getElementById('boot-screen')?.remove(); }, []);
  return <div className={`butterfly-splash${exiting ? ' is-exiting' : ''}`} role="status" aria-live="polite" aria-label="Auto Replys is loading">
    <div className="butterfly-splash-content">
      <img className="butterfly-splash-art" src="/loading-butterflies.svg" alt="" aria-hidden="true" />
      <strong className="butterfly-splash-title">Auto Replys</strong>
      <p>Making conversations feel effortless</p>
      <div className="butterfly-splash-track" aria-hidden="true"><span /></div>
      <small>Preparing your workspace…</small>
    </div>
  </div>;
};
