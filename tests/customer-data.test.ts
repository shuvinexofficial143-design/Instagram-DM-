import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerCsv,
  customerCsvCell,
  customerSearchPattern,
  groupAutomationData,
  automationDataStatus,
  wasAutomationUpdated,
} from "../src/lib/customerData";
test("CSV preserves column order, Unicode and multi-line details, and neutralizes spreadsheet formulas", () => {
  const csv = customerCsv(
    ["Name", "Phone"],
    [
      {
        id: "r",
        customer_key: "c",
        username: 'a"sha',
        data: { Name: "आशा\nशर्मा", Phone: "+919876543210" },
        created_at: "2026-10-18",
        updated_at: "2026-10-18",
      },
    ],
  );
  assert.ok(csv.startsWith('\uFEFF"Instagram","Name","Phone"'));
  assert.ok(csv.includes('"a""sha"'));
  assert.ok(csv.includes('"आशा\nशर्मा"'));
  assert.ok(csv.includes('"\'+919876543210"'));
  for (const malicious of [
    '=HYPERLINK("x")',
    "  =SUM(1,2)",
    "@SUM(1)",
    "-1+2",
    "\t=cmd",
  ])
    assert.ok(customerCsvCell(malicious).startsWith("\"'"));
});
test("customer search treats wildcard characters as literal data", () => {
  assert.equal(customerSearchPattern("  a%_b\\c "), "%a\\%\\_b\\\\c%");
});

test("automation cards group schema versions, show actual run state and preserve deleted identity", () => {
  const base = {
    id: "a1",
    workspace_id: "w",
    automation_id: "a",
    automation_name: "Shop",
    version: 1,
    fields: ["Name"],
    active: true,
    automation_deleted_at: null,
    created_at: "2026-10-18",
    updated_at: "2026-10-18",
    automation_status: "paused",
  };
  assert.equal(automationDataStatus(base).label, "Inactive");
  const groups = groupAutomationData([
    base,
    { ...base, id: "b", automation_id: "b", automation_status: "active" },
    { ...base, id: "a2", version: 2, automation_status: "active" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].current.id, "a2");
  assert.equal(groups[0].versions.length, 2);
  assert.equal(automationDataStatus(groups[0].current).label, "Active");
  assert.ok(wasAutomationUpdated(groups[0].current));
  assert.equal(
    automationDataStatus({ ...base, automation_deleted_at: "2026-10-18" }).tone,
    "deleted",
  );
});

test("CSV keeps long Instagram IDs as text so spreadsheet apps do not round them", () => {
  assert.equal(customerCsvCell("17841477429832078"), '"\'17841477429832078"');
});
