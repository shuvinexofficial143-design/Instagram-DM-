import React, { useEffect, useState } from "react";
import {
  Database,
  Search,
  Download,
  ArrowUpRight,
  RefreshCw,
  Table2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Archive,
  Users,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../lib/supabase";
import {
  CustomerCollection,
  CustomerRecord,
  customerCsv,
  customerSearchPattern,
} from "../../lib/customerData";
const PAGE_SIZE = 25;
const formatDate = (text: string) =>
  new Date(text).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export const CustomerDataPage = () => {
  const { workspaceId, setActiveTab, firebaseUser } = useApp();
  const [collections, setCollections] = useState<CustomerCollection[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [scope, setScope] = useState("");
  const [rows, setRows] = useState<CustomerRecord[]>([]),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [revision, setRevision] = useState(0),
    [listReady, setListReady] = useState(false);
  const [detail, setDetail] = useState<CustomerRecord | null>(null);
  const selected =
    scope === workspaceId
      ? collections.find((c) => c.id === selectedId)
      : undefined;
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setScope("");
    setCollections([]);
    setRows([]);
    setSearch("");
    setQuery("");
    setPage(0);
    setDetail(null);
    setListReady(false);
  }, [workspaceId]);
  useEffect(() => {
    let alive = true;
    if (!firebaseUser?.uid) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("autoreply_data_collections")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        if (!alive) return;
        setCollections(data || []);
        setScope(workspaceId);
        setSelectedId((old) =>
          (data || []).some((c) => c.id === old) ? old : data?.[0]?.id || "",
        );
        setListReady(true);
        setError("");
        if (!data?.length) setLoading(false);
      } catch {
        if (alive) {
          setError("Customer tables could not be loaded. Please retry.");
          setLoading(false);
        }
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [workspaceId, firebaseUser?.uid, revision]);
  useEffect(() => {
    let alive = true;
    setRows([]);
    setTotal(0);
    setDetail(null);
    if (!selected || !listReady) return;
    const load = async () => {
      setLoading(true);
      try {
        let request = supabase
          .from("autoreply_customer_records")
          .select("id,customer_key,username,data,created_at,updated_at", {
            count: "exact",
          })
          .eq("workspace_id", workspaceId)
          .eq("collection_id", selected.id);
        if (query.trim())
          request = request.ilike("search_text", customerSearchPattern(query));
        const { data, count, error } = await request
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        if (alive) {
          setRows(data || []);
          setTotal(count || 0);
          setError("");
        }
      } catch {
        if (alive)
          setError("Customer records could not be loaded. Please retry.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [workspaceId, selected?.id, listReady, page, query, revision]);
  const exportCsv = async () => {
    if (!selected || exporting) return;
    setExporting(true);
    setError("");
    try {
      const all: CustomerRecord[] = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        let request = supabase
          .from("autoreply_customer_records")
          .select("id,customer_key,username,data,created_at,updated_at")
          .eq("workspace_id", workspaceId)
          .eq("collection_id", selected.id);
        if (query.trim())
          request = request.ilike("search_text", customerSearchPattern(query));
        const { data, error } = await request
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        all.push(...(data || []));
        if ((data || []).length < 1000) break;
        if (offset === 99000)
          throw new Error(
            "Narrow your search to export fewer than 100,000 records.",
          );
      }
      const blob = new Blob([customerCsv(selected.fields, all)], {
          type: "text/csv;charset=utf-8;",
        }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        (selected.automation_name.replace(/[^\p{L}\p{N}_-]/gu, "_") ||
          "Customer_Data") +
        "_v" +
        selected.version +
        ".csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || "Export failed. Please retry.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="min-h-full bg-[#F8FAFC] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
              Your workspace database
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Customer Data
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Customer details, organized by automation. A lasting record of the
              conversations that grow your business.
            </p>
          </div>
          <button
            onClick={() => setRevision((v) => v + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
          >
            <RefreshCw
              className={"h-4 w-4 " + (loading ? "animate-spin" : "")}
            />
            Refresh
          </button>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            icon={Table2}
            label="Table versions"
            value={scope === workspaceId ? collections.length : 0}
          />
          <Stat
            icon={Database}
            label="Automations with data tables"
            value={
              scope === workspaceId
                ? new Set(collections.map((c) => c.automation_id)).size
                : 0
            }
          />
          <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Your records stay with you
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Deleting an automation keeps its customer tables. Field changes
                create a new version.
              </p>
            </div>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            {error}{" "}
            <button
              onClick={() => setRevision((v) => v + 1)}
              className="ml-2 font-bold underline"
            >
              Retry
            </button>
          </div>
        )}
        {!firebaseUser?.uid ? (
          <Empty
            title="Sign in to view Customer Data"
            text="Customer information is available only to the signed-in workspace owner."
          />
        ) : scope !== workspaceId || !listReady ? (
          <Empty
            title={error ? "Tables unavailable" : "Loading customer tables…"}
            text="Your workspace records will appear here."
          />
        ) : !collections.length ? (
          <Empty
            title="Your first customer table starts here"
            text="Enable Customer Data in an automation and choose the information to capture. New customer messages fill the table automatically."
            action={() => setActiveTab("automations")}
          />
        ) : (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-4">
                <h2 className="text-sm font-bold text-slate-900">
                  Automation tables
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Current and preserved versions
                </p>
              </div>
              <div className="max-h-[600px] space-y-1 overflow-y-auto p-2">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    aria-pressed={c.id === selectedId}
                    onClick={() => {
                      setSelectedId(c.id);
                      setPage(0);
                      setSearch("");
                      setQuery("");
                    }}
                    className={
                      "w-full rounded-xl border p-3 text-left " +
                      (c.id === selectedId
                        ? "border-indigo-200 bg-indigo-50"
                        : "border-transparent hover:bg-slate-50")
                    }
                  >
                    <p className="break-words text-sm font-semibold text-slate-800">
                      {c.automation_name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="text-slate-500">
                        Version {c.version}
                      </span>
                      <span
                        className={
                          c.automation_deleted_at
                            ? "text-rose-600"
                            : c.active
                              ? "text-emerald-700"
                              : "text-amber-700"
                        }
                      >
                        {c.automation_deleted_at
                          ? "Automation deleted"
                          : c.active
                            ? "Current table"
                            : "Archived"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>
            {selected && (
              <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Table2 className="h-5 w-5 text-indigo-500" />
                        <h2 className="break-words text-lg font-bold text-slate-900">
                          {selected.automation_name}
                        </h2>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Version {selected.version} · {total.toLocaleString()}{" "}
                        {query ? "matching " : ""}customers ·{" "}
                        {selected.fields.length} fields
                      </p>
                    </div>
                    <button
                      disabled={loading || !total || exporting}
                      onClick={() => void exportCsv()}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      <Download className="h-4 w-4" />
                      {exporting ? "Exporting…" : "Export CSV"}
                    </button>
                  </div>
                  {(!selected.active || selected.automation_deleted_at) && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <Archive className="h-4 w-4 shrink-0" />
                      {selected.automation_deleted_at
                        ? "Automation deleted. These customer records are preserved and available for export."
                        : "This table is archived. New captures use the current version when capture is enabled."}
                    </p>
                  )}
                  <label className="mt-5 flex max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search customer details"
                      placeholder="Search name, phone, email or any detail…"
                      className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none"
                    />
                  </label>
                </div>
                {loading ? (
                  <div
                    role="status"
                    className="p-14 text-center text-sm text-slate-500"
                  >
                    Loading customer records…
                  </div>
                ) : !rows.length ? (
                  <Empty
                    title={
                      query
                        ? "No matching customers"
                        : "Waiting for customer details"
                    }
                    text={
                      query
                        ? "Try a different name, phone number or search term."
                        : "Customer messages received by this automation will create one row per customer. Only details they share are filled in."
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                      <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Customer</th>
                          {selected.fields.map((f) => (
                            <th key={f} className="px-5 py-3">
                              {f}
                            </th>
                          ))}
                          <th className="px-5 py-3">Last updated</th>
                          <th className="px-5 py-3">
                            <span className="sr-only">Details</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => (
                          <tr key={row.id} className="hover:bg-indigo-50/30">
                            <td className="px-5 py-4 font-medium text-slate-800">
                              {row.username && row.username !== row.customer_key
                                ? "@" + row.username
                                : row.customer_key}
                            </td>
                            {selected.fields.map((f) => (
                              <td
                                key={f}
                                className="max-w-60 truncate px-5 py-4 text-slate-600"
                                title={row.data?.[f] || ""}
                              >
                                {row.data?.[f] || (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ))}
                            <td className="px-5 py-4 text-xs text-slate-500">
                              {formatDate(row.updated_at)}
                            </td>
                            <td className="px-5 py-4">
                              <button
                                onClick={() => setDetail(row)}
                                aria-label={"View details for " + row.username}
                                className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
                  <span>
                    {total
                      ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}`
                      : "0 customers"}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      aria-label="Previous page"
                      disabled={page === 0 || loading}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span>Page {page + 1}</span>
                    <button
                      aria-label="Next page"
                      disabled={(page + 1) * PAGE_SIZE >= total || loading}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {detail && (
                  <section
                    className="border-t border-indigo-100 bg-indigo-50/30 p-5"
                    aria-label="Customer details"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">
                        Customer details
                      </h3>
                      <button
                        onClick={() => setDetail(null)}
                        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"
                      >
                        Close details
                      </button>
                    </div>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      {[
                        ["Instagram", detail.username || detail.customer_key],
                        ...selected.fields.map((f) => [
                          f,
                          detail.data?.[f] || "Not shared",
                        ]),
                        ["First captured", formatDate(detail.created_at)],
                        ["Last updated", formatDate(detail.updated_at)],
                      ].map(([name, value]) => (
                        <div key={name}>
                          <dt className="text-xs font-semibold text-slate-500">
                            {name}
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-indigo-600">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold text-slate-950">
          {value.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white px-5 py-14 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-500">
        <Users className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
        {text}
      </p>
      {action && (
        <button
          onClick={action}
          className="mt-5 min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white"
        >
          Set up an automation
        </button>
      )}
    </div>
  );
}
