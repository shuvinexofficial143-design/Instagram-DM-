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
};
export type CustomerRecord = {
  id: string;
  customer_key: string;
  username: string;
  data: Record<string, string>;
  created_at: string;
  updated_at: string;
};
export const customerCsvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
export function customerCsv(fields: string[], rows: CustomerRecord[]) {
  return (
    "\uFEFF" +
    [
      ["Instagram", ...fields, "First captured", "Last updated"],
      ...rows.map((row) => [
        row.username || row.customer_key,
        ...fields.map((f) => row.data?.[f] || ""),
        row.created_at,
        row.updated_at,
      ]),
    ]
      .map((row) => row.map(customerCsvCell).join(","))
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
