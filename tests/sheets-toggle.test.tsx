import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleSheetsSetup } from "../src/components/Automations/GoogleSheetsSetup";
import sheets from "../api/google-sheets";
test("Google Sheets shows only Coming Soon even with a stored connection", () => {
  const html = renderToStaticMarkup(
    GoogleSheetsSetup({
      enabled: true,
      connected: true,
      email: "private@example.test",
      error: "old error",
      children: "old controls",
    }),
  );
  assert.match(html, /Coming Soon/);
  for (const hidden of [
    "private@example.test",
    "old error",
    "old controls",
    'role="switch"',
    "<button",
  ])
    assert.ok(!html.includes(hidden));
});
test("every public Google Sheets action is paused without any upstream request", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("Upstream access must be paused");
  };
  try {
    for (const action of [
      "connect",
      "callback",
      "status",
      "create-sheet",
      "append-lead",
      "runtime-token",
    ]) {
      const res = {
        statusCode: 0,
        body: null as any,
        setHeader() {},
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(body: any) {
          this.body = body;
        },
      };
      await sheets({ query: { action }, headers: {}, method: "POST" }, res);
      assert.equal(res.statusCode, action === "status" ? 200 : 410);
      assert.equal(res.body.comingSoon, true);
      assert.equal(res.body.connected, false);
    }
  } finally {
    globalThis.fetch = original;
  }
});
