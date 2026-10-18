import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerCsv,
  customerCsvCell,
  customerSearchPattern,
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
