import React from "react";
import { FileSpreadsheet } from "lucide-react";
export type GoogleSheetsSetupProps = {
  enabled?: boolean;
  onEnabledChange?: (value: boolean) => void;
  connected?: boolean;
  email?: string;
  loading?: boolean;
  error?: string;
  onConnect?: () => void;
  onRetry?: () => void;
  children?: React.ReactNode;
};
export const GoogleSheetsSetup = (_props: GoogleSheetsSetupProps) => (
  <section
    className="rounded-2xl border border-slate-200 bg-white p-5"
    aria-labelledby="google-sheets-heading"
  >
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
        <FileSpreadsheet className="h-5 w-5" />
      </span>
      <h3
        id="google-sheets-heading"
        className="flex-1 text-sm font-bold text-slate-900"
      >
        Google Sheets
      </h3>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        Coming Soon
      </span>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-500">
      Spreadsheet integration is coming soon. Save customer details directly in
      Customer Data.
    </p>
  </section>
);
