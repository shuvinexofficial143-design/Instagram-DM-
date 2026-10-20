import React from "react";
import { Database, ArrowUpRight } from "lucide-react";
import { useApp } from "../../context/AppContext";
export const CustomerDataCard = () => {
  const { setActiveTab } = useApp();
  return (
    <article className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Database className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          Built in
        </span>
      </div>
      <h2 className="mt-4 text-base font-bold text-slate-900">Customer Data</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Capture names, phone numbers and customer-shared details from AI DM
        conversations. Each AI DM automation has its own saved customer table.
      </p>
      <button
        onClick={() => setActiveTab("customer-data")}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white"
      >
        Open Customer Data
        <ArrowUpRight className="h-4 w-4" />
      </button>
    </article>
  );
};
