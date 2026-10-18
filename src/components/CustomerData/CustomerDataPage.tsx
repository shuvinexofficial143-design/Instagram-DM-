import React, { useEffect, useMemo, useState } from "react";
import {
  Database,
  Search,
  Download,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Table2,
  Instagram,
  Check,
  Users,
  Plus,
  ArrowLeft,
  Clock3,
} from "lucide-react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../lib/supabase";
import {
  CustomerCollection,
  CustomerRecord,
  customerCsv,
  customerSearchPattern,
  groupAutomationData,
  automationDataStatus,
  customerDisplayName,
  wasAutomationUpdated,
  CUSTOMER_RECORD_COLUMNS,
} from "../../lib/customerData";
import { AutomationDataCard } from "./AutomationDataCard";
import {
  CustomerRecordDetails,
  formatCustomerTime,
} from "./CustomerRecordDetails";
import "./customer-data.css";
const PAGE_SIZE = 25;
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
  const [loading, setLoading] = useState(false),
    [listLoading, setListLoading] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<CustomerRecord | null>(null),
    [filter, setFilter] = useState("all");
  const groups = useMemo(
    () => groupAutomationData(scope === workspaceId ? collections : []),
    [collections, scope, workspaceId],
  );
  const selected =
    scope === workspaceId
      ? collections.find((c) => c.id === selectedId)
      : undefined;
  const selectedGroup = groups.find((g) => g.id === selected?.automation_id);
  const visibleGroups = groups.filter(
    (g) =>
      filter === "all" ||
      (filter === "updated"
        ? automationDataStatus(g.current).tone !== "deleted" &&
          wasAutomationUpdated(g.current)
        : automationDataStatus(g.current).tone === filter),
  );
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
    setSelectedId("");
    setRows([]);
    setSearch("");
    setQuery("");
    setPage(0);
    setDetail(null);
    setFilter("all");
  }, [workspaceId]);
  useEffect(() => {
    let alive = true;
    if (!firebaseUser?.uid) {
      setListLoading(false);
      return;
    }
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc(
          "autoreply_customer_collections",
          { p_workspace: workspaceId },
        );
        if (error) throw error;
        if (!alive) return;
        if (!Array.isArray(data)) throw new Error("Invalid customer tables");
        setCollections(data);
        setScope(workspaceId);
        setError("");
      } catch {
        if (alive) setError("Could not load automation tables. Please retry.");
      } finally {
        if (alive) setListLoading(false);
      }
    };
    setListLoading(true);
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    const onFocus = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [workspaceId, firebaseUser?.uid, revision]);
  useEffect(() => {
    let alive = true;
    setRows([]);
    setTotal(0);
    setDetail(null);
    if (!selected) return;
    const load = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        let req = supabase
          .from("autoreply_customer_records")
          .select(CUSTOMER_RECORD_COLUMNS, { count: "exact" })
          .eq("workspace_id", workspaceId)
          .eq("collection_id", selected.id);
        if (query.trim())
          req = req.ilike("search_text", customerSearchPattern(query));
        const { data, count, error } = await req
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) throw error;
        if (alive) {
          setRows(data || []);
          setTotal(count || 0);
          setDetail((old) =>
            old ? (data || []).find((r) => r.id === old.id) || old : null,
          );
          setError("");
        }
      } catch {
        if (alive) setError("Could not load customer records. Please retry.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load(true);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [workspaceId, selected?.id, page, query, revision]);
  const openTable = (id: string) => {
    setSelectedId(id);
    setSearch("");
    setQuery("");
    setPage(0);
    setDetail(null);
  };
  const exportCsv = async () => {
    if (!selected || exporting) return;
    setExporting(true);
    setError("");
    try {
      const all: CustomerRecord[] = [];
      for (let offset = 0; offset < 100000; offset += 1000) {
        let req = supabase
          .from("autoreply_customer_records")
          .select(CUSTOMER_RECORD_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("collection_id", selected.id);
        if (query.trim())
          req = req.ilike("search_text", customerSearchPattern(query));
        const { data, error } = await req
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
        a = document.createElement("a");
      a.href = url;
      a.download =
        (selected.automation_name.replace(/[^\p{L}\p{N}_-]/gu, "_") ||
          "Customer_Data") + ".csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setError(e?.message || "Export failed. Please retry.");
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    if (!selectedId) return;
    const panel = document.getElementById("customer-records-panel");
    panel?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    panel?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [selectedId]);
  useEffect(() => {
    if (!detail) return;
    document.querySelector(".cd-customer-detail")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, [detail?.id]);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="customer-data-workspace">
      <header className="cd-page-header">
        <div>
          <span className="cd-kicker">WORKSPACE / CUSTOMER DATA</span>
          <h1>Customer Data</h1>
          <p>
            Customer details, organized by automation. Instagram identity and
            activity times are captured automatically.
          </p>
        </div>
        <button
          className="cd-button cd-button-secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw
            size={15}
            className={loading || listLoading ? "cd-spin" : ""}
          />
          Refresh
        </button>
      </header>
      <div className="cd-summary-bar">
        <span>
          <Database size={16} />
          <strong>{groups.length}</strong> automations
        </span>
        <span>
          <Users size={16} />
          <strong>
            {collections
              .reduce((n, c) => n + (c.customer_count || 0), 0)
              .toLocaleString()}
          </strong>{" "}
          customer records
        </span>
        <span>
          <ShieldCheck size={16} />
          Records stay saved after deletion
        </span>
      </div>
      {error && (
        <div role="alert" className="cd-error">
          {error}
          <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
        </div>
      )}
      {!firebaseUser?.uid ? (
        <Empty
          title="Sign in to view Customer Data"
          text="Customer information is available only to the signed-in workspace owner."
        />
      ) : scope !== workspaceId ? (
        <Empty
          title={
            error
              ? "Automation tables unavailable"
              : "Loading automation tables…"
          }
          text="Your customer records will appear here."
        />
      ) : !groups.length ? (
        <Empty
          title="A dedicated space for every automation"
          text="Enable Customer Data in an automation. Names, phone numbers and other selected details will fill in automatically."
          action={() => setActiveTab("automations")}
        />
      ) : (
        <>
          <section aria-labelledby="automation-data-heading">
            <div className="cd-section-title">
              <div>
                <h2 id="automation-data-heading">Your automations</h2>
                <p>Choose an automation to explore its customers.</p>
              </div>
              <div className="cd-filters" aria-label="Filter automations">
                {[
                  ["all", "All"],
                  ["active", "Active"],
                  ["inactive", "Inactive"],
                  ["updated", "Updated"],
                  ["deleted", "Deleted"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {visibleGroups.length ? (
              <div className="cd-automation-grid">
                {visibleGroups.map((group) => (
                  <AutomationDataCard
                    key={group.id}
                    group={group}
                    selected={selected?.automation_id === group.id}
                    onOpen={() => openTable(group.current.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="cd-filter-empty">
                No automations match this filter.
              </div>
            )}
          </section>
          {!selected && (
            <div className="cd-get-started">
              <Table2 size={19} />
              <p>
                <strong>Your customer workspace is ready.</strong> Open an
                automation card to view customer information, Instagram
                identities and activity times.
              </p>
            </div>
          )}
          {selected && (
            <section
              id="customer-records-panel"
              className="cd-records-panel"
              aria-labelledby="records-heading"
            >
              <header className="cd-records-header">
                <div>
                  <button
                    className="cd-back"
                    onClick={() => {
                      setSelectedId("");
                      setDetail(null);
                    }}
                  >
                    <ArrowLeft size={14} />
                    Close table
                  </button>
                  <h2 id="records-heading" tabIndex={-1}>
                    {selected.automation_name}
                  </h2>
                  <p>
                    <Instagram size={14} />
                    {selected.instagram_username
                      ? "@" + selected.instagram_username
                      : "Instagram"}
                    <span>·</span>
                    {total.toLocaleString()} {query ? "matching " : ""}customers
                    <span>·</span>
                    {selected.fields.length} fields
                  </p>
                </div>
                <div className="cd-records-actions">
                  {(selectedGroup?.versions.length || 0) > 1 && (
                    <label className="cd-version-select">
                      <span>Saved table</span>
                      <select
                        aria-label="Saved table version"
                        value={selected.id}
                        onChange={(e) => openTable(e.target.value)}
                      >
                        {selectedGroup?.versions.map((c) => (
                          <option key={c.id} value={c.id}>
                            Version {c.version}
                            {c.id === selectedGroup.current.id
                              ? " · Current"
                              : " · Archived"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="cd-button cd-button-primary"
                    disabled={loading || !total || exporting}
                    onClick={() => void exportCsv()}
                  >
                    <Download size={15} />
                    {exporting ? "Exporting…" : "Export CSV"}
                  </button>
                </div>
              </header>
              {selected.automation_deleted_at && (
                <div className="cd-notice cd-notice-deleted">
                  <ShieldCheck size={16} />
                  Automation deleted. All saved customer information is still
                  available.
                </div>
              )}
              {(selected.schema_revision || 1) > 1 &&
                !selected.automation_deleted_at && (
                  <div className="cd-notice cd-notice-updated">
                    <Plus size={16} />
                    Fields updated automatically. Earlier customer details are
                    preserved.
                  </div>
                )}
              <div className="cd-table-toolbar">
                <label className="cd-search">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search customer details"
                    placeholder="Search name, phone, email or customer…"
                  />
                </label>
                <span
                  className={
                    "cd-live-indicator " +
                    (selected.active && selected.automation_status === "active"
                      ? ""
                      : "is-paused")
                  }
                >
                  <i />
                  {selected.automation_deleted_at
                    ? "Preserved records"
                    : !selected.active
                      ? "Capture off"
                      : selected.automation_status === "active"
                        ? "Auto capture"
                        : "Automation inactive"}
                </span>
              </div>
              {loading ? (
                <div role="status" className="cd-records-loading">
                  Loading customer records…
                </div>
              ) : !rows.length ? (
                <Empty
                  title={
                    query
                      ? "No matching customers"
                      : "Your next conversation starts this table"
                  }
                  text={
                    query
                      ? "Try another name, phone number or email."
                      : "When a customer messages this automation, their Instagram identity and arrival time are captured. Shared details fill in the same row."
                  }
                />
              ) : (
                <>
                  <div className="cd-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          {selected.fields.map((f) => (
                            <th key={f}>{f}</th>
                          ))}
                          <th>First message</th>
                          <th>Latest message</th>
                          <th>Purchase reported</th>
                          <th>
                            <span className="cd-visually-hidden">
                              Customer details
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <button
                                className="cd-customer-name"
                                onClick={() => setDetail(r)}
                              >
                                {customerDisplayName(r)}
                              </button>
                              <small>
                                {r.username && r.username !== r.customer_key
                                  ? "@" + r.username
                                  : "ID " + (r.instagram_id || r.customer_key)}
                              </small>
                            </td>
                            {selected.fields.map((f) => (
                              <td key={f} title={r.data?.[f] || ""}>
                                {r.data?.[f] || (
                                  <span className="cd-unshared">
                                    Not shared
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="cd-time-cell">
                              {formatCustomerTime(
                                r.first_seen_at || r.created_at,
                              )}
                            </td>
                            <td className="cd-time-cell">
                              {formatCustomerTime(
                                r.last_seen_at || r.updated_at,
                              )}
                            </td>
                            <td className="cd-time-cell">
                              {r.purchase_reported_at ? (
                                <span className="cd-purchase">
                                  <Check size={13} />
                                  {formatCustomerTime(r.purchase_reported_at)}
                                </span>
                              ) : (
                                <span className="cd-unshared">
                                  Not reported
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className="cd-icon-button"
                                aria-label={
                                  "View details for " +
                                  (r.username || r.customer_key)
                                }
                                onClick={() => setDetail(r)}
                              >
                                <ArrowUpRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="cd-mobile-records">
                    {rows.map((r) => (
                      <article key={r.id} className="cd-mobile-customer">
                        <div>
                          <button
                            className="cd-customer-name"
                            onClick={() => setDetail(r)}
                          >
                            {customerDisplayName(r)}
                          </button>
                          <button
                            className="cd-icon-button"
                            aria-label={
                              "View customer " + (r.username || r.customer_key)
                            }
                            onClick={() => setDetail(r)}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        </div>
                        <p>
                          {r.username && r.username !== r.customer_key
                            ? "@" + r.username
                            : "Instagram ID: " +
                              (r.instagram_id || r.customer_key)}
                        </p>
                        <dl>
                          {selected.fields.slice(0, 3).map((f) => (
                            <div key={f}>
                              <dt>{f}</dt>
                              <dd>{r.data?.[f] || "Not shared"}</dd>
                            </div>
                          ))}
                        </dl>
                        <span>
                          <Clock3 size={13} />
                          First message ·{" "}
                          {formatCustomerTime(r.first_seen_at || r.created_at)}
                        </span>
                      </article>
                    ))}
                  </div>
                </>
              )}
              <footer className="cd-table-footer">
                <span>
                  {total
                    ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}`
                    : "0 customers"}
                </span>
                <div>
                  <button
                    className="cd-icon-button"
                    aria-label="Previous page"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span>Page {page + 1}</span>
                  <button
                    className="cd-icon-button"
                    aria-label="Next page"
                    disabled={(page + 1) * PAGE_SIZE >= total || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </footer>
              {detail && (
                <CustomerRecordDetails
                  record={detail}
                  fields={selected.fields}
                  onClose={() => setDetail(null)}
                />
              )}
              <div className="cd-timezone-note">
                <Clock3 size={13} />
                Times shown in {timezone}. CSV timestamps use UTC.
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
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
    <div className="cd-empty">
      <span>
        <Database size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="cd-button cd-button-primary" onClick={action}>
          Set up an automation
        </button>
      )}
    </div>
  );
}
