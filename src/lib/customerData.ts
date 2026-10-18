export type CustomerCollection = {
  id: string;
  workspace_id: string;
  automation_id: string;
  automation_name: string;
  version: number;
  fields: string[];
  active: boolean;
  automation_deleted_at: string | null;
  created_at: string;
  updated_at: string;
  automation_status?: string;
  automation_updated_at?: string | null;
  schema_revision?: number;
  instagram_username?: string;
  instagram_id?: string;
  customer_count?: number;
  purchase_count?: number;
  last_customer_at?: string | null;
};
export type CustomerRecord = {
  id: string;
  customer_key: string;
  username: string;
  data: Record<string, string>;
  created_at: string;
  updated_at: string;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  instagram_id?: string;
  source_instagram_username?: string;
  source_instagram_id?: string;
  purchase_reported_at?: string | null;
  purchase_product?: string;
};
export type AutomationDataGroup = {
  id: string;
  current: CustomerCollection;
  versions: CustomerCollection[];
};
export function groupAutomationData(
  collections: CustomerCollection[],
): AutomationDataGroup[] {
  const groups = new Map<string, CustomerCollection[]>();
  for (const c of collections) {
    const rows = groups.get(c.automation_id) || [];
    rows.push(c);
    groups.set(c.automation_id, rows);
  }
  return [...groups].map(([id, rows]) => {
    const versions = [...rows].sort((a, b) => b.version - a.version);
    return { id, current: versions[0], versions };
  });
}
export function automationDataStatus(c: CustomerCollection) {
  if (c.automation_deleted_at || c.automation_status === "deleted")
    return { label: "Deleted", tone: "deleted" } as const;
  if (c.automation_status === "active")
    return { label: "Active", tone: "active" } as const;
  return { label: "Inactive", tone: "inactive" } as const;
}
export const wasAutomationUpdated = (c: CustomerCollection) =>
  Boolean(
    c.automation_updated_at || (c.schema_revision || 1) > 1 || c.version > 1,
  );
export const customerCsvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (
    /^[\s]*[=+@-]/.test(text) ||
    /^[\t\r\n]/.test(text) ||
    /^\d{15,}$/.test(text)
  )
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
export function customerCsv(fields: string[], rows: CustomerRecord[]) {
  return (
    "\uFEFF" +
    [
      [
        "Instagram",
        ...fields,
        "Instagram ID",
        "Business Instagram",
        "Business Instagram ID",
        "First message at (UTC)",
        "Last message at (UTC)",
        "Purchase reported at (UTC)",
        "Product reported",
        "First captured (UTC)",
        "Last updated (UTC)",
      ],
      ...rows.map((r) => [
        r.username || r.customer_key,
        ...fields.map((f) => r.data?.[f] || ""),
        r.instagram_id || r.customer_key,
        r.source_instagram_username || "",
        r.source_instagram_id || "",
        r.first_seen_at || r.created_at,
        r.last_seen_at || r.updated_at,
        r.purchase_reported_at || "",
        r.purchase_product || "",
        r.created_at,
        r.updated_at,
      ]),
    ]
      .map((r) => r.map(customerCsvCell).join(","))
      .join("\r\n")
  );
}
export const customerSearchPattern = (text: string) =>
  "%" +
  text
    .trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, "\\$&") +
  "%";
export const CUSTOMER_RECORD_COLUMNS =
  "id,customer_key,username,data,created_at,updated_at,first_seen_at,last_seen_at,instagram_id,source_instagram_username,source_instagram_id,purchase_reported_at,purchase_product";
export function customerDisplayName(row: CustomerRecord) {
  const named = Object.entries(row.data || {}).find(([k]) =>
    /^(name|customer name|full name|नाम)$/i.test(k),
  )?.[1];
  return (
    named ||
    (row.username && row.username !== row.customer_key
      ? "@" + row.username
      : "Instagram customer")
  );
}
