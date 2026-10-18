import React from "react";
import {
  ArrowUpRight,
  Database,
  Instagram,
  Users,
  Columns3,
  Clock3,
} from "lucide-react";
import {
  AutomationDataGroup,
  automationDataStatus,
  wasAutomationUpdated,
} from "../../lib/customerData";
export function AutomationDataCard({
  group,
  selected,
  onOpen,
}: {
  group: AutomationDataGroup;
  selected: boolean;
  onOpen: () => void;
}) {
  const c = group.current,
    status = automationDataStatus(c),
    updated = wasAutomationUpdated(c);
  return (
    <article
      className={`cd-automation-card cd-card-${status.tone}${selected ? " is-selected" : ""}`}
    >
      <div className="cd-card-top">
        <span className={"cd-status cd-status-" + status.tone}>
          <i />
          {status.label}
        </span>
        {updated && status.tone !== "deleted" && (
          <span className="cd-status cd-status-updated">
            <Clock3 size={12} />
            Updated
          </span>
        )}
        <span className="cd-card-symbol">
          <Database size={19} />
        </span>
      </div>
      <h3>{c.automation_name}</h3>
      <p className="cd-account">
        <Instagram size={14} />
        {c.instagram_username
          ? "@" + c.instagram_username
          : "Instagram automation"}
      </p>
      <div className="cd-card-metrics">
        <span>
          <Users size={15} />
          <strong>{(c.customer_count || 0).toLocaleString()}</strong> customers
        </span>
        <span>
          <Columns3 size={15} />
          <strong>{c.fields.length}</strong> fields
        </span>
      </div>
      <p className="cd-card-note">
        {status.tone === "deleted"
          ? "Automation deleted. Customer records are preserved."
          : status.tone === "inactive"
            ? "Automation paused. Saved customer records stay available."
            : !c.active
              ? "Data capture is off. Saved customers remain available."
              : updated
                ? "New fields join this table. Existing customer data stays saved."
                : "Customer details are saved automatically from incoming messages."}
      </p>
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        className="cd-card-open"
      >
        {selected ? "Viewing customers" : "View customers"}
        <ArrowUpRight size={17} />
      </button>
    </article>
  );
}
