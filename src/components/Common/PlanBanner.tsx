import React from 'react';
import { AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PlanBanner: React.FC = () => {
  const { user, setIsRenewModalOpen } = useApp();

  const isTrial = user?.plan === 'trial';
  if (!isTrial) return null;

  return (
    <div className="bg-[#FDEAEA] border-b border-red-200/80 px-6 py-3 flex items-center justify-between text-xs text-red-900 shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-[#DC2626] shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <span className="font-bold text-red-950">Free Trial Expiring Soon: </span>
          <span className="text-red-800">
            You have 5 days remaining in your trial. Connect your Meta App credentials and renew now to avoid DM automation downtime.
          </span>
        </div>
      </div>
      <button
        onClick={() => setIsRenewModalOpen(true)}
        className="bg-[#DC2626] hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
      >
        <span>Renew / Upgrade Plan</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
