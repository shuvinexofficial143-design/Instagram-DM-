import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
const raw = await fs.readFile(
  new URL(
    "../supabase/functions/instagram-live-webhook/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = await transform(
  raw.replace(/^import .*;\n/gm, "") +
    "\nglobalThis.customerHelpers={captureCustomerData,customerDataFields,isCustomerPurchaseReport};",
  { loader: "ts", format: "esm" },
);
function fixture({ failAI = false, failSave = false, purchase = null } = {}) {
  const calls = [],
    logs = [],
    requests = [];
  let saves = 0;
  const admin = {
    from() {
      let value;
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        or() {
          return q;
        },
        limit() {
          return q;
        },
        upsert(v) {
          value = v;
          return q;
        },
        then(resolve) {
          if (value) {
            logs.push(value);
            return Promise.resolve({ error: null }).then(resolve);
          }
          return Promise.resolve({
            data: [
              {
                id: "canonical",
                data: { ig_user_ids: ["old", "new"], ig_username: "asha" },
              },
            ],
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
    async rpc(name, args) {
      saves++;
      calls.push({ name, args });
      return { data: "row", error: failSave ? { message: "outage" } : null };
    },
  };
  const ctx = {
    Response,
    Request,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    crypto,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    console,
    createClient: () => admin,
    Deno: { env: { get: () => "" }, serve() {} },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (failAI) return Response.json({}, { status: 503 });
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                _purchase: purchase,
                Name: "Asha",
                Consent: "Yes",
                Unknown: "ignore",
                Phone: null,
                Email: { bad: "object" },
              }),
            },
          },
        ],
      });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(compiled.code, ctx);
  const rule = {
    id: "auto_test",
    trigger_type: "dm_ai_conversation",
    trigger_config: { data_fields: ["Name", "Phone", "Email"] },
  };
  const capture = (text, cfg = {}, triggerType = "dm_ai_conversation") =>
    ctx.customerHelpers.captureCustomerData(
      admin,
      "workspace",
      { ...rule, trigger_type:triggerType, trigger_config: { ...rule.trigger_config, ...cfg } },
      { senderId: "old", text, messageId: "m1", timestamp: Date.now() },
      "key",
      { username: "our_shop", ig_user_id: "business-id" },
    );
  return {
    purchaseReport: ctx.customerHelpers.isCustomerPurchaseReport,
    calls,
    logs,
    requests,
    capture,
    get saves() {
      return saves;
    },
  };
}
test("capture uses only customer facts, configured fields, and a canonical customer identity", async () => {
  const f = fixture();
  await f.capture("My name is Asha. Phone 9876543210");
  const saved = f.calls[0];
  assert.equal(saved.name, "autoreply_capture_customer");
  assert.equal(saved.args.p_customer, "canonical");
  assert.equal(saved.args.p_values.Name, "Asha");
  assert.equal(saved.args.p_values.Phone, "9876543210");
  assert.equal(saved.args.p_values.Consent, undefined);
  assert.equal(saved.args.p_values.Unknown, undefined);
  assert.equal(saved.args.p_values.Email, undefined);
  const prompt = JSON.parse(f.requests[0].init.body);
  assert.equal(prompt.messages.length, 2);
  assert.equal(prompt.messages[1].content, "My name is Asha. Phone 9876543210");
  assert.ok(!f.requests.some((r) => r.url.includes("google")));
});
test("AI extraction outage still saves explicit phone/email and logs partial extraction", async () => {
  const f = fixture({ failAI: true });
  await f.capture("9876543210, asha@example.test");
  assert.equal(f.calls[0].args.p_values.Phone, "9876543210");
  assert.equal(f.calls[0].args.p_values.Email, "asha@example.test");
  assert.ok(
    f.logs.some((l) => l.data?.reason === "customer_data_extraction_partial"),
  );
});
test("capture off does no work; storage failures retry and remain visible without rejecting a reply", async () => {
  const off = fixture();
  await off.capture("Phone 9876543210", { data_capture_enabled: false });
  assert.equal(off.requests.length, 0);
  assert.equal(off.calls.length, 0);
  const failed = fixture({ failSave: true });
  await failed.capture("Phone 9876543210");
  assert.equal(failed.saves, 2);
  assert.ok(
    failed.logs.some((l) => l.data?.reason === "customer_data_save_failed"),
  );
});
test("runtime starts capture after inbound persistence, before quota and outbound success checks", () => {
  assert.ok(
    raw.indexOf(
      "await captureCustomerData(admin,workspaceId,automation,item,openaiKey,account)",
    ) < raw.indexOf("const canStartAi ="),
  );
  assert.ok(!raw.includes("runInBackground(syncAiLeadToGoogleSheet("));
});

test("numeric order identifiers are not guessed to be phone numbers during an extraction outage", async () => {
  const f = fixture({ failAI: true });
  await f.capture("Order ID 9876543210");
  assert.equal(f.calls[0].args.p_values.Phone, undefined);
});

test("Instagram business identity and event times are automatic metadata, not customer questions", async () => {
  const f = fixture();
  await f.capture("My name is Asha");
  const event = f.calls[0].args.p_event;
  assert.equal(event.customer_instagram_id, "old");
  assert.equal(event.source_username, "our_shop");
  assert.equal(event.source_id, "business-id");
  assert.ok(!Number.isNaN(Date.parse(f.calls[0].args.p_at)));
});
test("purchase detection requires an explicit customer report with exact evidence", async () => {
  const evidence = "I bought this watch";
  const f = fixture({
    purchase: { reported: true, product: "Watch", evidence },
  });
  await f.capture(evidence);
  assert.equal(f.calls[0].args.p_event.purchase_reported, true);
  assert.equal(f.calls[0].args.p_event.purchase_product, "Watch");
  const invalid = fixture({
    purchase: {
      reported: true,
      product: "Watch",
      evidence: "I bought a watch",
    },
  });
  await invalid.capture("What is the price?");
  assert.equal(invalid.calls[0].args.p_event.purchase_reported, false);
  for (const text of [
    "I want to buy",
    "I have not purchased",
    "If I bought it",
    "I paid?",
    "मैंने अभी नहीं खरीदा",
  ])
    assert.equal(f.purchaseReport(text), false, text);
});

test('comment, story and fixed DM replies never extract customer data even with old enabled flags',async()=>{
 for(const type of ['comment','story_reply','dm']){
  const f=fixture();await f.capture('My phone is 9876543210, email asha@example.test',{data_capture_enabled:true},type);
  assert.equal(f.requests.length,0,type);assert.equal(f.calls.length,0,type);assert.equal(f.saves,0,type);
 }
});
