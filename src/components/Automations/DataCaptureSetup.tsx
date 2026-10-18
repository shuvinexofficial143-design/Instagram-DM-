import React, { useState } from "react";
import { Database, Plus, X, ShieldCheck } from "lucide-react";
export type DataCaptureProps = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  fields: string[];
  onFieldsChange: (value: string[]) => void;
};
export function DataCaptureSetup({
  enabled,
  onEnabledChange,
  fields,
  onFieldsChange,
}: DataCaptureProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    const label = draft.trim().slice(0, 60);
    if (!label) return;
    if (fields.some((x) => x.toLowerCase() === label.toLowerCase())) {
      setError("This field already exists.");
      return;
    }
    if (fields.length >= 30) {
      setError("Use up to 30 fields per table.");
      return;
    }
    onFieldsChange([...fields, label]);
    setDraft("");
    setError("");
  };
  return (
    <section
      className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm"
      aria-labelledby="customer-capture-heading"
    >
      <div className="flex items-center gap-3 bg-indigo-50/60 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">
          <Database className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="customer-capture-heading"
            className="text-base font-bold text-slate-950"
          >
            Customer Data
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            A dedicated customer table for this automation.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Save customer data"
          onClick={() => onEnabledChange(!enabled)}
          className={
            "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 " +
            (enabled ? "bg-indigo-600" : "bg-slate-300")
          }
        >
          <span
            className={
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform " +
              (enabled ? "left-1 translate-x-5" : "left-1")
            }
          />
        </button>
      </div>
      <div className="p-5">
        <p className="text-sm leading-6 text-slate-600">
          {enabled
            ? "Customer-shared details are captured automatically. Follow-up messages update the same customer’s row."
            : "Capture is off. Existing customer records stay available."}
        </p>
        {enabled && (
          <>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">
              Information to capture
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  {field}
                  <button
                    type="button"
                    disabled={fields.length <= 1}
                    aria-label={"Remove " + field + " field"}
                    onClick={() =>
                      onFieldsChange(fields.filter((x) => x !== field))
                    }
                    className="rounded text-slate-400 hover:text-rose-600 disabled:opacity-30"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="New customer data field"
                maxLength={60}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="Add a field, e.g. Delivery address"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm focus:outline-indigo-500"
              />
              <button
                type="button"
                onClick={add}
                className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-rose-600">
                {error}
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              New fields join this table automatically. Existing customer
              details and earlier columns stay saved.
            </p>
          </>
        )}
        <div className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
          <span>
            Only details shared by customers are saved. Tables stay available if
            the automation is deleted. Manage and export them in Customer Data.
          </span>
        </div>
      </div>
    </section>
  );
}
