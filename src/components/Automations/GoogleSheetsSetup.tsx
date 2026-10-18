import React from 'react';
import { Check, ChevronRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { googleLogo, sheetsLogo } from '../Common/googleBrandAssets';

export type GoogleSheetsSetupProps = {
  enabled: boolean; onEnabledChange: (enabled: boolean) => void;
  connected: boolean; email: string; loading: boolean; error: string;
  onConnect: () => void; onRetry: () => void; children?: React.ReactNode;
};

export function GoogleSheetsSetup(p: GoogleSheetsSetupProps) {
  return <section className={`ai-setup-card sheets-setup ${p.enabled ? 'is-enabled' : ''}`} aria-labelledby="sheets-heading">
    <div className="sheets-setup-header">
      <div className="sheets-setup-identity">
        <span className="sheets-setup-icon"><img src={sheetsLogo} width={30} height={30} alt="" /></span>
        <div><h3 id="sheets-heading">Google Sheets <span className="ai-optional">Optional</span></h3>
          <p id="sheets-toggle-description">Save customer details to your own spreadsheet.</p></div>
      </div>
      <button type="button" role="switch" aria-checked={p.enabled} aria-label="Enable Google Sheets"
        aria-describedby="sheets-toggle-description" aria-controls="sheets-setup-content"
        className="sheets-toggle" onClick={() => p.onEnabledChange(!p.enabled)}>
        <span className="sheets-toggle-label">{p.enabled ? 'On' : 'Off'}</span>
        <span className="sheets-toggle-track" aria-hidden="true"><span className="sheets-toggle-thumb">{p.enabled && <Check size={12} />}</span></span>
      </button>
    </div>
    <div id="sheets-setup-content">
      {!p.enabled ? <p className="sheets-off-note">Your AI replies work without Google Sheets. Turn this on whenever you need lead tracking.</p> : <>
        <div className="sheets-setup-divider" />
        {p.error && <div className="sheets-inline-error" role="alert"><p>{p.error}</p>
          <button type="button" onClick={p.onRetry} disabled={p.loading}><RefreshCw size={14} />Check again</button></div>}
        {p.connected ? <div className="sheets-account-row">
          <span className="sheets-account-check"><Check size={16} /></span>
          <div><strong>Google account connected</strong><span>{p.email || 'Ready to create your sheet'}</span></div>
          <button type="button" disabled={p.loading} onClick={p.onConnect}>Change<ChevronRight size={14} /></button>
        </div> : <div className="sheets-connect-state"><p>Connect Google, choose your columns, then create a sheet for this automation.</p>
          <button type="button" className="google-brand-button" onClick={p.onConnect} disabled={p.loading}>
            {p.loading ? <LoaderCircle size={18} className="animate-spin" /> : <img src={googleLogo} width={20} height={20} alt="" />}
            {p.loading ? 'Checking connection…' : 'Connect Google Sheets'}
          </button></div>}
        {p.connected && p.children}
      </>}
    </div>
  </section>;
}
