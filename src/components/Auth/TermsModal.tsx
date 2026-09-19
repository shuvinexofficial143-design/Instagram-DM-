import React from 'react';
import { X, ShieldCheck, FileText, Lock } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'terms' | 'privacy';
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, type }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              {type === 'terms' ? <FileText className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {type === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h3>
              <p className="text-xs text-slate-500">AutoReply.io • Last updated: September 2026</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed">
          {type === 'terms' ? (
            <>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">1. Acceptance of Terms</h4>
                <p>
                  By accessing and using AutoReply.io, you agree to comply with and be bound by these
                  Terms of Service and all applicable Meta Platform Terms & Graph API policies.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">2. Instagram Automation & Compliance</h4>
                <p>
                  AutoReply.io connects to Instagram Business and Creator accounts via official Meta Graph
                  Webhooks and messaging APIs. Users must maintain ownership or authorization for all
                  connected social profiles.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">3. Responsible AI Use</h4>
                <p>
                  AI-generated direct messages must strictly conform to anti-spam guidelines. Do not use
                  automated replies for deceptive marketing, harassment, or unlawful content distribution.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">4. Account Security</h4>
                <p>
                  You are responsible for maintaining the confidentiality of your authentication
                  credentials and any API tokens associated with your account.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">1. Data We Collect</h4>
                <p>
                  We collect account identifiers (email, name, authentication ID) and Instagram metadata
                  (page ID, username, direct message logs) exclusively for providing automated customer
                  service and DM response workflows.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">2. Data Security & Storage</h4>
                <p>
                  All credentials and tokens are securely stored and encrypted. We do not sell or rent
                  your conversation logs or customer details to third parties.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">3. Meta Platform Data Retention</h4>
                <p>
                  Instagram direct messages are processed in real-time. You retain the right to delete
                  your automations, contact records, or disconnect your Instagram account at any time.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">4. AI Processing</h4>
                <p>
                  Context needed to generate automated replies is sent only to the configured AI service
                  for processing the requested response.
                </p>
              </div>
            </>
          )}

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-2.5 text-slate-700">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-[11px] font-medium">
              Your account data is handled through the configured Meta Graph API and Supabase-backed application services.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
