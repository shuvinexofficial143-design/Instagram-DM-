import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };
const GRAPH_VERSION = "v25.0";

let accountRowsCache: { expiresAt: number; rows: any[] } = {
  expiresAt: 0,
  rows: [],
};
const automationCache = new Map<
  string,
  { expiresAt: number; automation: any | null }
>();
const pendingOutboundMemory = new Map<
  string,
  { recipientId: string; expiresAt: number }
>();
const runtimeContextMemory = new Map<
  string,
  { expiresAt: number; value: any }
>();
const messageClaimMemory = new Map<string, number>();
const replyCacheMemory = new Map<
  string,
  { expiresAt: number; responseText: string }
>();

const historyCache = new Map<
  string,
  { expiresAt: number; messages: any[] }
>();

function runInBackground(task: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  const safeTask = task.catch((err) => console.warn("[BACKGROUND_TASK_WARN]", err instanceof Error ? err.message : String(err)));
  if (runtime?.waitUntil) runtime.waitUntil(safeTask);
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  let key = "";

  try {
    const modern = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    key = String(modern?.default || "").trim();
  } catch {}

  if (!key) {
    key = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  }

  if (!url || !key) throw new Error("Supabase admin credentials are unavailable");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanToken(value: unknown): string {
  return String(value || "").trim();
}

async function verifyMetaHmac(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
) {
  if (!rawBody || !signatureHeader || !appSecret) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );

  const expected =
    "sha256=" +
    Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

  if (expected.length !== signatureHeader.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }

  return mismatch === 0;
}

function asText(value: unknown, max = 12000): string {
  return String(value || "").trim().slice(0, max);
}

function normalizeReplyCacheKey(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[!?.,;:()[\]{}"'\u2018\u2019\u201c\u201d]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length <= 500 ? normalized : "";
}

function extractDirectMessages(event: any) {
  const items: Array<{
    entryId: string;
    senderId: string;
    recipientId: string;
    messageId: string;
    text: string;
    timestamp: number;
  }> = [];

  for (const entry of Array.isArray(event?.entry) ? event.entry : []) {
    const entryId = String(entry?.id || "");

    for (const msg of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      const text = asText(msg?.message?.text, 6000);
      const isEcho = Boolean(msg?.message?.is_echo);
      const senderId = String(msg?.sender?.id || "");
      const recipientId = String(msg?.recipient?.id || entryId || "");
      const messageId = String(msg?.message?.mid || msg?.mid || "");
      const timestamp = Number(msg?.timestamp || entry?.time || Date.now());

      if (!isEcho && senderId && recipientId && text) {
        items.push({ entryId, senderId, recipientId, messageId, text, timestamp });
      }
    }

    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (String(change?.field || "") !== "messages") continue;
      const value = change?.value || {};
      const text = asText(value?.message?.text || value?.text, 6000);
      const isEcho = Boolean(value?.message?.is_echo || value?.is_echo);
      const senderId = String(value?.sender?.id || value?.from?.id || "");
      const recipientId = String(value?.recipient?.id || entryId || "");
      const messageId = String(value?.message?.mid || value?.mid || "");
      const timestamp = Number(value?.timestamp || entry?.time || Date.now());

      if (!isEcho && senderId && recipientId && text) {
        items.push({ entryId, senderId, recipientId, messageId, text, timestamp });
      }
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.messageId || `${item.senderId}:${item.timestamp}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadTypingRuntimeContext(
  admin: any,
  ids: string[]
) {
  const candidates = [...new Set(
    (ids || []).map((id) => String(id || "").trim()).filter(Boolean)
  )];

  if (!candidates.length) return null;

  for (const id of candidates) {
    const cached = runtimeContextMemory.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const { data, error } = await admin
    .from("autoreply_runtime_context")
    .select("ig_user_id,user_id,account,automation_id,automation")
    .in("ig_user_id", candidates)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[LIVE_DM_TYPING_CONTEXT_WARN]", error);
    return null;
  }

  if (!data?.user_id || !data?.account?.access_token) {
    return null;
  }

  const value = {
    user_id: data.user_id,
    account: data.account,
    automation: data.automation_id
      ? {
          ...(data.automation || {}),
          id: data.automation_id,
        }
      : null,
  };

  const expiresAt = Date.now() + 5 * 60_000;
  const igId = String(data.ig_user_id || data?.account?.ig_user_id || "");

  if (igId) {
    runtimeContextMemory.set(igId, { expiresAt, value });
  }
  for (const id of candidates) {
    runtimeContextMemory.set(id, { expiresAt, value });
  }

  return value;
}

async function loadDmContext(
  admin: any,
  ids: string[],
  messageId: string,
  incomingText: string,
  senderId: string,
  includeHistory: boolean
) {
  const candidates = [...new Set(
    (ids || []).map((id) => String(id || "").trim()).filter(Boolean)
  )];

  if (!candidates.length) return null;

  const { data, error } = await admin.rpc("autoreply_prepare_automation_event", {
    p_candidates: candidates,
    p_message_id: String(messageId || ""),
    p_sender_id: String(senderId || ""),
  });

  if (error) {
    console.error("[LIVE_DM_CONTEXT_LOOKUP_FAILED]", error);
    throw new Error("Could not resolve live DM context");
  }

  return data || null;
}

async function claimMessageOnly(
  admin: any,
  workspaceId: string,
  messageId: string,
  incomingText: string,
  senderId: string
) {
  if (!workspaceId) return "new";

  const { data, error } = await admin.rpc("autoreply_claim_message_only", {
    p_user_id: workspaceId,
    p_message_id: String(messageId || ""),
    p_query_key: "",
    p_sender_id: String(senderId || ""),
  });

  if (error) {
    console.warn("[LIVE_DM_BACKGROUND_CLAIM_WARN]", error);
    return "new";
  }

  return String(data || "new");
}

async function markPendingOutbound(
  admin: any,
  workspaceId: string,
  responseText: string,
  recipientId: string
) {
  const textKey = normalizeReplyCacheKey(responseText);
  if (!workspaceId || !textKey || !recipientId) return;

  const { error } = await admin.rpc("autoreply_mark_pending_outbound", {
    p_user_id: workspaceId,
    p_text_key: textKey,
    p_recipient_id: recipientId,
  });

  if (error) {
    console.warn("[LIVE_DM_PENDING_OUTBOUND_WARN]", error);
  }
}

async function markOutboundClaim(
  admin: any,
  workspaceId: string,
  messageId: string
) {
  if (!workspaceId || !messageId) return;
  const { error } = await admin.rpc("autoreply_mark_outbound_message", {
    p_user_id: workspaceId,
    p_message_id: messageId,
  });
  if (error) {
    console.warn("[LIVE_DM_OUTBOUND_CLAIM_WARN]", error);
  }
}

async function saveReplyCache(
  admin: any,
  workspaceId: string,
  automationId: string,
  incomingText: string,
  responseText: string
) {
  const queryKey = normalizeReplyCacheKey(incomingText);
  if (!workspaceId || !automationId || !queryKey || !responseText) return;

  replyCacheMemory.set(
    `${workspaceId}:${automationId}:${queryKey}`,
    {
      responseText,
      expiresAt: Date.now() + 60 * 60 * 1000,
    }
  );

  const { error } = await admin
    .from("autoreply_reply_cache")
    .upsert(
      {
        user_id: workspaceId,
        automation_id: automationId,
        query_key: queryKey,
        response_text: responseText,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,automation_id,query_key" }
    );

  if (error) {
    console.warn("[LIVE_DM_REPLY_CACHE_SAVE_WARN]", error);
  }
}

async function findWorkspaceByInstagramIds(admin: any, ids: string[]) {
  const candidates = [...new Set(
    (ids || []).map((id) => String(id || "").trim()).filter(Boolean)
  )];

  if (!candidates.length) return null;

  let rows = accountRowsCache.rows;
  if (Date.now() >= accountRowsCache.expiresAt || !rows.length) {
    const { data, error } = await admin
      .from("autoreply_instagram_tokens")
      .select("user_id,account")
      .limit(100);

    if (error) {
      console.error("[LIVE_DM_ACCOUNT_SCAN_FAILED]", error);
      return null;
    }

    rows = data || [];
    accountRowsCache = {
      rows,
      expiresAt: Date.now() + 300_000,
    };
  }

  const matched = rows.find((row: any) =>
    candidates.includes(String(row?.account?.ig_user_id || ""))
  );

  if (matched?.user_id && matched?.account?.access_token) {
    return {
      ...matched,
      matchedInstagramId: String(matched?.account?.ig_user_id || ""),
    };
  }

  const usableRows = rows.filter(
    (row: any) => row?.user_id && row?.account?.access_token
  );

  if (usableRows.length === 1) {
    const only = usableRows[0];
    console.warn("[LIVE_DM_ACCOUNT_SINGLE_FALLBACK]", {
      candidates,
      using: only?.account?.ig_user_id || null,
    });
    return {
      ...only,
      matchedInstagramId: String(only?.account?.ig_user_id || ""),
    };
  }

  console.warn("[LIVE_DM_ACCOUNT_NOT_FOUND]", {
    candidates,
    connectedAccounts: rows.map((row: any) => ({
      user_id: row?.user_id || null,
      ig_user_id: row?.account?.ig_user_id || null,
      username: row?.account?.username || null,
    })),
  });

  return null;
}
async function getPlanQuota(admin: any, workspaceId: string) {
  // Independent reads start together; usage remains fresh for every message.
  // Profiles contain identity columns, not a JSON plan document. Until a
  // server-issued subscription exists, use the configured free entitlement.
  const [planResult, usageResult] = await Promise.all([
    admin.from("autoreply_plans").select("id,total_messages,ai_replies").eq("id", "free").maybeSingle(),
    admin.rpc("autoreply_get_usage", { p_user_id: workspaceId }),
  ]);
  if (planResult.error || usageResult.error) {
    console.error("[QUOTA_LOOKUP_FAILED]", { planCode: planResult.error?.code, usageCode: usageResult.error?.code });
    throw new Error("Could not verify the message allowance");
  }
  const usage = usageResult.data;
  return {
    plan: "free", totalUsed: Number(usage?.total_messages || 0), aiUsed: Number(usage?.ai_replies || 0),
    totalLimit: Number(planResult.data?.total_messages ?? 1500),
    aiLimit: Number(planResult.data?.ai_replies ?? 1000),
  };
}

function aiTimeoutMs(): number {
  const configured = Number(Deno.env.get("DM_AI_TIMEOUT_MS") || 8000);
  return Number.isFinite(configured) ? Math.min(12000, Math.max(2000, configured)) : 8000;
}

function canReuseSharedReply(history: any[], incomingText: string): boolean {
  // Follow-up replies depend on this customer's history and must not be shared.
  return history.length === 0 && !isConversationalGreeting(incomingText);
}

async function syncAiLeadToGoogleSheet(admin:any, workspaceId:string, senderId:string, incomingText:string, history:any[], openaiKey:string) {
  try {
    const { data: row } = await admin.from("autoreply_documents").select("data").eq("user_id",workspaceId).eq("collection","google_sheets_connections").eq("id","primary").maybeSingle();
    const cfg=row?.data||{}; const fields=Array.isArray(cfg?.fields)?cfg.fields.map((x:any)=>String(x||"").trim()).filter(Boolean):[];
    if(!cfg?.connected||!cfg?.spreadsheet_id||!fields.length||!cfg?.refresh_token||!openaiKey)return;
    const transcript=[...(Array.isArray(history)?history.slice(-8):[]),{role:"user",content:incomingText}].map((m:any)=>String(m?.role||"user")+": "+String(m?.content||"")).join("\n");
    const er=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+openaiKey,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",temperature:0,response_format:{type:"json_object"},messages:[{role:"system",content:"Extract only customer-provided lead information from the conversation. Return one JSON object using ONLY these exact keys: "+fields.join(", ")+". Omit fields that are unknown. Never guess."},{role:"user",content:transcript}]})});
    const ep:any=await er.json().catch(()=>null); if(!er.ok)return; let extracted:any={}; try{extracted=JSON.parse(String(ep?.choices?.[0]?.message?.content||"{}"))}catch{return}
    const clean:any={}; for(const key of fields){const v=extracted?.[key];if(v!==undefined&&v!==null&&String(v).trim())clean[key]=String(v).trim()} if(!Object.keys(clean).length)return;
    const leadId=String(senderId||"").trim(); const {data:existing}=await admin.from("autoreply_documents").select("data").eq("user_id",workspaceId).eq("collection","ai_leads").eq("id",leadId).maybeSingle(); const merged={...(existing?.data||{}),...clean,instagram_username:(existing?.data?.instagram_username||senderId),updated_at:new Date().toISOString(),created_at:existing?.data?.created_at||new Date().toISOString()};
    await admin.from("autoreply_documents").upsert({user_id:workspaceId,collection:"ai_leads",id:leadId,data:merged},{onConflict:"user_id,collection,id"});
    const tr=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:String(Deno.env.get("GOOGLE_SHEETS_CLIENT_ID")||""),client_secret:String(Deno.env.get("GOOGLE_SHEETS_CLIENT_SECRET")||""),refresh_token:String(cfg.refresh_token),grant_type:"refresh_token"})}); const tp:any=await tr.json().catch(()=>null);if(!tr.ok||!tp?.access_token)return;
    const values=fields.map((k:string)=>String(merged?.[k]||""));values.push(String(merged.instagram_username||senderId),String(merged.created_at||""),String(merged.updated_at||""));
    await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(cfg.spreadsheet_id)+"/values/"+encodeURIComponent((cfg.sheet_name||"Leads")+"!A:ZZ")+":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",{method:"POST",headers:{Authorization:"Bearer "+tp.access_token,"Content-Type":"application/json"},body:JSON.stringify({values:[values]})});
  } catch(err){console.warn("[GOOGLE_SHEETS_LEAD_SYNC_WARN]",err)}
}

async function incrementUsage(admin:any, workspaceId:string, isAi:boolean) {
  const { error } = await admin.rpc("autoreply_increment_usage", { p_user_id: workspaceId, p_is_ai: isAi });
  if (error) console.warn("[USAGE_INCREMENT_WARN]", error);
}

async function loadActiveDmAiAutomation(admin: any, workspaceId: string) {
  const cached = automationCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.automation;
  }

  const { data, error } = await admin
    .from("autoreply_documents")
    .select("id,data,updated_at")
    .eq("user_id", workspaceId)
    .eq("collection", "automations")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[LIVE_DM_AUTOMATIONS_LOAD_FAILED]", error);
    throw new Error("Could not load automations");
  }

  const all = (data || []).map((row: any) => ({
    id: String(row?.id || ""),
    ...(row?.data || {}),
    _updated_at: row?.updated_at || row?.data?.updated_at || "",
  }));

  const active = all.filter(
    (a: any) => a?.trigger_type === "dm_ai_conversation" && a?.status === "active"
  );

  if (active.length > 1) {
    await Promise.all(
      active.slice(1).map(async (stale: any) => {
        const paused = {
          ...stale,
          status: "paused",
          updated_at: new Date().toISOString(),
        };
        delete paused._updated_at;

        const { error: pauseError } = await admin
          .from("autoreply_documents")
          .update({ data: paused })
          .eq("user_id", workspaceId)
          .eq("collection", "automations")
          .eq("id", stale.id);

        if (pauseError) {
          console.error("[AUTOMATION_AUTO_PAUSE_FAILED]", stale.id, pauseError);
        }
      })
    );
  }

  const automation = active[0] || null;
  automationCache.set(workspaceId, {
    automation,
    expiresAt: Date.now() + 30_000,
  });

  return automation;
}
async function classifyMessageId(
  admin: any,
  workspaceId: string,
  messageId: string
): Promise<"new" | "outbound_echo" | "duplicate"> {
  if (!messageId) return "new";

  const { data: rows, error } = await admin
    .from("autoreply_documents")
    .select("collection,data")
    .eq("user_id", workspaceId)
    .eq("id", messageId)
    .in("collection", ["inbox_messages", "webhook_events"]);

  if (error) {
    console.warn("[LIVE_DM_MESSAGE_STATE_WARN]", error);
    return "new";
  }

  for (const row of rows || []) {
    if (
      row?.collection === "inbox_messages" &&
      row?.data?.direction === "out"
    ) {
      return "outbound_echo";
    }

    if (
      row?.collection === "webhook_events" &&
      row?.data?.status === "sent"
    ) {
      return "duplicate";
    }
  }

  return "new";
}
async function loadHistory(admin: any, workspaceId: string, senderId: string) {
  const key = `${workspaceId}:${senderId}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.messages.slice(-10);
  }

  const { data, error } = await admin
    .from("autoreply_dm_history")
    .select("messages")
    .eq("user_id", workspaceId)
    .eq("sender_id", senderId)
    .maybeSingle();

  if (error) {
    console.warn("[LIVE_DM_HISTORY_LOAD_WARN]", error);
  }

  let messages = Array.isArray(data?.messages) ? data.messages.slice(-10) : [];

  if (!messages.length) {
    const { data: legacy } = await admin
      .from("autoreply_documents")
      .select("data")
      .eq("user_id", workspaceId)
      .eq("collection", "dm_history")
      .eq("id", senderId)
      .maybeSingle();
    messages = Array.isArray(legacy?.data?.messages)
      ? legacy.data.messages.slice(-10)
      : [];
  }

  historyCache.set(key, {
    messages,
    expiresAt: Date.now() + 60_000,
  });
  return messages;
}

async function saveHistory(
  admin: any,
  workspaceId: string,
  senderId: string,
  history: any[]
) {
  const messages = history.slice(-12);
  historyCache.set(`${workspaceId}:${senderId}`, {
    messages,
    expiresAt: Date.now() + 60_000,
  });

  const { error } = await admin
    .from("autoreply_dm_history")
    .upsert(
      {
        user_id: workspaceId,
        sender_id: senderId,
        messages,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,sender_id" }
    );

  if (error) {
    console.warn("[LIVE_DM_HISTORY_SAVE_WARN]", error);
  }
}

async function logEvent(
  admin: any,
  workspaceId: string,
  id: string,
  data: Record<string, unknown>
) {
  if (!id) return;

  await admin
    .from("autoreply_documents")
    .upsert(
      {
        user_id: workspaceId,
        collection: "webhook_events",
        id,
        data: { ...data, updated_at: new Date().toISOString() },
      },
      { onConflict: "user_id,collection,id" }
    );
}

async function getSenderProfile(
  senderId: string,
  accessToken: string
): Promise<{ username: string; avatar_url: string }> {
  const params = new URLSearchParams({
    fields: "id,name,username,profile_pic,follower_count",
    access_token: accessToken,
  });

  try {
    const response = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(
        senderId
      )}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn(
        "[LIVE_DM_SENDER_PROFILE_WARN]",
        response.status,
        payload?.error?.message || payload
      );
      return { username: senderId, avatar_url: "" };
    }

    return {
      username: String(payload?.username || senderId),
      avatar_url: String(payload?.profile_pic || ""),
    };
  } catch (err) {
    console.warn("[LIVE_DM_SENDER_PROFILE_ERROR]", err);
    return { username: senderId, avatar_url: "" };
  }
}

async function persistInboundMessage(
  admin: any,
  workspaceId: string,
  item: any,
  profile: { username: string; avatar_url: string },
  countInteraction = true
) {
  const nowIso = new Date(
    Number.isFinite(item?.timestamp) ? item.timestamp : Date.now()
  ).toISOString();
  const messageId =
    String(item?.messageId || "").trim() ||
    `in_${item.senderId}_${item.timestamp || Date.now()}`;

  // Scoped sender IDs can change after reconnecting. Resolve saved aliases first;
  // only use a username supplied by Meta, never an unverified message value.
  const verifiedUsername = String(profile.username || "").trim().replace(/^@/, "").toLowerCase();
  const canMatchUsername = /^[a-z0-9._]{1,30}$/.test(verifiedUsername) && !/^\d+$/.test(verifiedUsername);
  const senderId = String(item.senderId);
  const filters = [`id.eq.${senderId}`, `data->>ig_user_id.eq.${senderId}`, `data->ig_user_ids.cs.["${senderId}"]`];
  if (canMatchUsername) filters.push(`data->>ig_username.eq.${verifiedUsername}`);
  const { data: candidates, error: lookupError } = await admin.from("autoreply_documents")
    .select("id,data").eq("user_id", workspaceId).eq("collection", "contacts")
    .or(filters.join(","));
  if (lookupError) throw lookupError;
  const matches = (candidates || []).filter((row: any) => row.id === senderId || row.data?.ig_user_id === senderId ||
    (row.data?.ig_user_ids || []).includes(senderId) || (canMatchUsername &&
      String(row.data?.ig_username || "").replace(/^@/, "").toLowerCase() === verifiedUsername));
  matches.sort((a: any, b: any) => String(a.data?.first_interaction_at || "").localeCompare(String(b.data?.first_interaction_at || "")));
  const canonicalId = matches[0]?.id || senderId;
  const existing = matches[0]?.data || {};
  const interactions = { comments: 0, dms: 0, stories: 0 };
  for (const row of matches) for (const key of Object.keys(interactions)) interactions[key] += Number(row.data?.interactions?.[key] || 0);
  const username = canMatchUsername ? verifiedUsername : existing.ig_username || senderId;
  const avatar = profile.avatar_url || matches.find((row: any) => row.data?.avatar_url)?.data.avatar_url || "";
  const aliases = [...new Set([senderId, ...matches.flatMap((row: any) => [row.id, row.data?.ig_user_id, ...(row.data?.ig_user_ids || [])])].filter(Boolean))];

  const contact = {
    ...existing,
    id: canonicalId,
    ig_username: username,
    ig_user_ids: aliases,
    ig_user_id: item.senderId,
    avatar_url: avatar,
    first_interaction_at: existing?.first_interaction_at || nowIso,
    last_interaction_at: [nowIso, ...matches.map((row: any) => row.data?.last_interaction_at || "")].sort().at(-1),
    interactions: {
      comments: Number(interactions?.comments || 0) + (countInteraction && item.triggerType === "comment" ? 1 : 0),
      dms: Number(interactions?.dms || 0) + (countInteraction && item.triggerType === "dm" ? 1 : 0),
      stories: Number(interactions?.stories || 0) + (countInteraction && item.triggerType === "story_reply" ? 1 : 0),
    },
    tags: [...new Set(matches.flatMap((row: any) => Array.isArray(row.data?.tags) ? row.data.tags : []))],
    status: existing?.status || "lead",
  };

  const inbox = {
    id: messageId,
    from_ig_id: item.senderId,
    from_username: username,
    from_avatar: avatar,
    message_text: item.text,
    direction: "in",
    is_automated: false,
    timestamp: nowIso,
  };

  const [contactResult, inboxResult] = await Promise.all([
    admin
      .from("autoreply_documents")
      .upsert(
        {
          user_id: workspaceId,
          collection: "contacts",
          id: canonicalId,
          data: contact,
        },
        { onConflict: "user_id,collection,id" }
      ),
    admin
      .from("autoreply_documents")
      .upsert(
        {
          user_id: workspaceId,
          collection: "inbox_messages",
          id: messageId,
          data: inbox,
        },
        { onConflict: "user_id,collection,id" }
      ),
  ]);

  if (contactResult.error) {
    console.error("[LIVE_DM_CONTACT_SAVE_FAILED]", contactResult.error);
  }
  if (inboxResult.error) {
    console.error("[LIVE_DM_INBOX_IN_SAVE_FAILED]", inboxResult.error);
    throw new Error("Could not save incoming message");
  }

  if (!contactResult.error) {
    for (const duplicate of matches.filter((row: any) => row.id !== canonicalId)) {
      // Keep a recoverable copy before removing a redundant contact. Messages
      // retain their original IDs and timestamps for conversation history.
      const archived = await admin.from("autoreply_documents").upsert({ user_id: workspaceId,
        collection: "contact_identity_archive", id: duplicate.id, data: { ...duplicate.data, merged_into: canonicalId } },
        { onConflict: "user_id,collection,id" });
      if (!archived.error) await admin.from("autoreply_documents").delete().eq("user_id", workspaceId)
        .eq("collection", "contacts").eq("id", duplicate.id);
    }
  }
  return { contact, inbox, messageId };
}

async function persistOutboundMessage(
  admin: any,
  workspaceId: string,
  item: any,
  profile: { username: string; avatar_url: string },
  automation: any,
  responseText: string,
  instagramMessageId?: string
) {
  const id = String(
    instagramMessageId ||
      `out_${item.messageId || item.senderId}_${Date.now()}`
  );

  const data = {
    id,
    from_ig_id: item.senderId,
    from_username: profile.username || item.senderId,
    from_avatar: profile.avatar_url || "",
    message_text: responseText,
    direction: "out",
    is_automated: true,
    automation_id: automation?.id || "",
    timestamp: new Date().toISOString(),
  };

  const { error } = await admin
    .from("autoreply_documents")
    .upsert(
      {
        user_id: workspaceId,
        collection: "inbox_messages",
        id,
        data,
      },
      { onConflict: "user_id,collection,id" }
    );

  if (error) {
    console.error("[LIVE_DM_INBOX_OUT_SAVE_FAILED]", error);
  }
}

async function persistWebhookLog(
  _admin: any,
  _workspaceId: string,
  _item: any,
  _profile: { username: string },
  _status: "triggered" | "ignored" | "error" | "success",
  _automation?: any,
  _responseText?: string,
  _error?: string
) {
  return;
}

async function updateAutomationStats(
  admin: any,
  workspaceId: string,
  automation: any
) {
  if (!automation?.id) return;

  const next = {
    ...automation,
    stats: {
      runs: Number(automation?.stats?.runs || 0) + 1,
      dms_sent: Number(automation?.stats?.dms_sent || 0) + 1,
      unique_users: Number(automation?.stats?.unique_users || 0),
      open_rate: Number(automation?.stats?.open_rate ?? 100),
    },
    updated_at: new Date().toISOString(),
  };
  delete next._updated_at;

  const { error } = await admin
    .from("autoreply_documents")
    .update({ data: next })
    .eq("user_id", workspaceId)
    .eq("collection", "automations")
    .eq("id", automation.id);

  if (error) {
    console.error("[LIVE_DM_AUTOMATION_STATS_FAILED]", error);
  }
}

function getInstantFastReply(_incomingText: string): string | null {
  // Fixed canned greetings are intentionally disabled.
  // Every inbound DM, including "Hi"/"Hello", should be generated by the AI
  // from the automation's configured business prompt so replies stay natural
  // and do not repeat the exact same sentence every time.
  return null;
}

function isConversationalGreeting(incomingText: string): boolean {
  const clean = String(incomingText || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[!.?]+$/g, "")
    .replace(/\s+/g, " ");

  return /^(hi+|hii+|hiii+|hello+|hey+|hey there|hello there|hlo+|hy+|namaste|namaskar|good morning|good afternoon|good evening)$/.test(clean);
}

async function generateReply(
  openaiKey: string,
  model: string,
  systemPrompt: string,
  history: any[],
  incomingText: string,
  varyNaturally = false
) {
  if (!openaiKey) throw new Error("OPENAI_API_KEY is missing");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiTimeoutMs());

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              systemPrompt ||
              "You are a helpful Instagram DM assistant. Reply naturally and briefly.",
          },
          ...history
            .slice(-4)
            .filter((m: any) => m?.role && m?.content)
            .map((m: any) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: asText(m.content, 1200),
            })),
          { role: "user", content: incomingText },
        ],
        temperature: varyNaturally ? 0.75 : 0.4,
        max_tokens: 72,
      }),
      signal: controller.signal,
    });

    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error?.message || `OpenAI HTTP ${response.status}`
      );
    }

    const text = asText(payload?.choices?.[0]?.message?.content, 1000);
    if (!text) throw new Error("GPT-4o mini returned an empty response");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// Serialize sender actions per conversation in this worker. A new turn owns the
// indicator; stale cleanup must never switch off a newer turn. No AI work waits here.
const typingConversations = new Map<string, { owner: symbol; tail: Promise<any> }>();
function createTypingSession(key: string, send: (action: "typing_on" | "typing_off", valid: () => boolean) => Promise<any>, onFirst: (result: any) => void) {
  const previous = typingConversations.get(key);
  const state = { owner: Symbol(key), tail: previous?.tail || Promise.resolve(null) };
  typingConversations.set(key, state);
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const owns = () => typingConversations.get(key) === state;
  const queue = (action: "typing_on" | "typing_off") => {
    const valid = () => owns() && (action === "typing_off" || active);
    state.tail = state.tail.catch(() => null).then(() => valid() ? send(action, valid) : null);
    return state.tail;
  };
  const refresh = () => {
    if (!active || !owns()) return;
    timer = setTimeout(() => {
      timer = null;
      if (!active || !owns()) return;
      runInBackground(queue("typing_on").then(refresh));
    }, 4000);
  };
  const first = queue("typing_on").then(result => { onFirst(result); refresh(); return result; });
  return { first, stop() {
    if (!active) return Promise.resolve(null);
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    return queue("typing_off").finally(() => { if (owns()) typingConversations.delete(key); });
  } };
}

async function sendInstagramSenderAction(
  igUserId: string,
  recipientId: string,
  accessToken: string,
  action: "typing_on" | "typing_off",
  valid: () => boolean = () => true
) {
  if (!igUserId || !recipientId || !accessToken) return null;

  for (let attempt = 0; attempt < 2 && valid(); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(
        `https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(
          igUserId
        )}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            sender_action: action,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const payload: any = await response.json().catch(() => null);
        console.warn("[LIVE_DM_SENDER_ACTION_WARN]", {
          action,
          status: response.status,
          error: payload?.error?.message || null,
        });
        // Only retry transient failures while this turn still owns the indicator.
        if (attempt === 0 && (response.status >= 500 || response.status === 429) && valid()) continue;
        return null;
      }

      return await response.json().catch(() => ({}));
    } catch (err) {
      console.warn("[LIVE_DM_SENDER_ACTION_ERROR]", {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt === 0 && valid()) continue;
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function sendInstagramText(
  igUserId: string,
  recipientId: string,
  accessToken: string,
  text: string
) {
  const response = await fetch(
    `https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(
      igUserId
    )}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text.slice(0, 1000) },
      }),
      // Never retry a Send API call: a timeout can follow a successful delivery.
      signal: AbortSignal.timeout(10000),
    }
  );

  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Instagram Send API HTTP ${response.status}`
    );
  }

  if (!payload?.message_id) throw new Error("Instagram did not confirm message delivery");
  return payload;
}

async function secretsMatch(received: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([received, expected].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

function extractAutomationEvents(event: any): any[] {
  const items: any[] = [];
  const addMessage = (entry: any, value: any) => {
    const message = value.message || value;
    const story = message.reply_to?.story || value.reply_to?.story || value.story;
    const mediaId = String(story?.id || message.reply_to?.story_id || value.reply_to?.story_id || value.story_id || "");
    const text = asText(message.text || value.text, 6000);
    const senderId = String(value.sender?.id || value.from?.id || "");
    const entryId = String(entry.id || "");
    const recipientId = String(value.recipient?.id || entryId);
    const senderUsername = String(value.from?.username || value.sender?.username || "").trim().toLowerCase();
    if (!text || !senderId || !recipientId || message.is_echo || value.is_echo || message.is_self || value.is_self || senderId === entryId) return;
    const timestamp = Number(value.timestamp || entry.time || Date.now());
    items.push({ entryId, senderId, senderUsername, recipientId, text, timestamp, mediaId,
      triggerType: story || mediaId ? "story_reply" : "dm",
      messageId: String(message.mid || value.mid || `dm_${senderId}_${timestamp}_${text}`),
    });
  };
  for (const entry of Array.isArray(event?.entry) ? event.entry : []) {
    for (const value of Array.isArray(entry.messaging) ? entry.messaging : []) addMessage(entry, value);
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      if (change.field === "messages") addMessage(entry, change.value || {});
      if (!["comments", "comment", "live_comments"].includes(change.field)) continue;
      const value = change.value || {};
      const senderId = String(value.from?.id || value.sender?.id || "");
      const commentId = String(value.id || value.comment_id || "");
      const text = asText(value.text, 6000);
      if (!senderId || !commentId || !text || senderId === String(entry.id || "") || value.parent_id) continue;
      items.push({ entryId: String(entry.id || ""), recipientId: String(entry.id || ""), senderId,
        messageId: `comment_${commentId}`, commentId, triggerType: "comment", text,
        timestamp: Number(entry.time || Date.now()), mediaId: String(value.media?.id || value.media_id || ""),
      });
    }
  }
  const seen = new Set<string>();
  return items.filter(item => !seen.has(item.messageId) && Boolean(seen.add(item.messageId)));
}

function matchAutomation(automations: any[], item: any): any | null {
  const matches = automations.filter(auto => {
    if (auto.status !== "active") return false;
    const typeMatches = auto.trigger_type === item.triggerType ||
      (item.triggerType === "dm" && auto.trigger_type === "dm_ai_conversation");
    if (!typeMatches) return false;
    const config = auto.trigger_config || {};
    if (config.media_scope === "specific_media" || config.story_scope === "specific_story" || config.post_scope === "specific_post") {
      if (!config.selected_media_id || String(config.selected_media_id) !== item.mediaId) return false;
    }
    if (config.all_or_keywords !== "keywords") return true;
    const text = item.text.toLocaleLowerCase();
    return (config.keywords || []).some((keyword: any) => String(keyword).trim() && text.includes(String(keyword).trim().toLocaleLowerCase()));
  });
  // An explicit keyword/static DM rule takes priority over the AI catch-all.
  matches.sort((a, b) => Number(a.trigger_type === "dm_ai_conversation") - Number(b.trigger_type === "dm_ai_conversation") ||
    Number(b.trigger_config?.media_scope === "specific_media") - Number(a.trigger_config?.media_scope === "specific_media") ||
    Number(b.trigger_config?.all_or_keywords === "keywords") - Number(a.trigger_config?.all_or_keywords === "keywords"));
  return matches[0] || null;
}

async function metaWrite(path: string, accessToken: string, body: any) {
  const response = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Instagram API HTTP ${response.status}`);
  return payload;
}

async function saveContactTags(admin: any, workspaceId: string, senderId: string, tags: string[]) {
  const { data, error: readError } = await admin.from("autoreply_documents").select("data").eq("user_id", workspaceId)
    .eq("collection", "contacts").eq("id", senderId).maybeSingle();
  if (readError) throw new Error("Could not load contact tags");
  const { error } = await admin.from("autoreply_documents").upsert({ user_id: workspaceId, collection: "contacts", id: senderId,
    data: { ...(data?.data || {}), ig_user_id: senderId, tags: [...new Set([...(data?.data?.tags || []), ...tags.filter(Boolean)])] },
  }, { onConflict: "user_id,collection,id" });
  if (error) throw new Error("Could not save the contact tag");
}

async function executeStaticActions(admin: any, workspaceId: string, item: any, automation: any, account: any) {
  const deliveries: any[] = [];
  const actions = automation.actions || [];
  let intentionalDelayMs = 0;
  const supported = new Set(["add_delay", "send_dm", "reply_comment", "add_tag", "auto_like_comment"]);
  if (actions.some((a: any) => !supported.has(a.type))) {
    return { ok: false, sent: false, reason: "unsupported_automation_action" };
  }
  const delay = actions.filter((a: any) => a.type === "add_delay").reduce((sum: number, a: any) => sum + Number(a.delay_seconds || 0), 0);
  if (!Number.isFinite(delay) || delay < 0 || delay > 20) return { ok: false, sent: false, reason: "configured_delay_exceeds_20_seconds" };
  try {
    if (delay) {
      intentionalDelayMs = delay * 1000;
      await new Promise(resolve => setTimeout(resolve, intentionalDelayMs));
    }
    // Send the private reply first. A public "Sent you a DM" is only posted
    // after Instagram has confirmed that the private message was accepted.
    const ordered = [...actions].sort((a, b) => Number(b.type === "send_dm") - Number(a.type === "send_dm"));
    for (const action of ordered) {
      if (action.type === "send_dm") {
        let text = asText(action.message_text, 1000);
        const links = (action.buttons || []).filter((b: any) => /^https?:\/\//.test(String(b.url || "")))
          .map((b: any) => `${b.label}: ${b.url}`).join("\n");
        if (links) text = asText(`${text}\n${links}`, 1000);
        if (!text) continue;
        const recipient = item.triggerType === "comment" ? { comment_id: item.commentId } : { id: item.senderId };
        const payload = await metaWrite(`${encodeURIComponent(account.ig_user_id)}/messages`, account.access_token, { recipient, message: { text } });
        if (!payload?.message_id) throw new Error("Instagram did not confirm private message delivery");
        deliveries.push({ type: "send_dm", id: String(payload.message_id), text });
        // Each confirmed message counts; partial action failures never erase it.
        runInBackground(incrementUsage(admin, workspaceId, false));
        runInBackground(markOutboundClaim(admin, workspaceId, String(payload.message_id)));
        runInBackground(persistOutboundMessage(admin, workspaceId, item, { username: item.senderId, avatar_url: "" }, automation, text, String(payload.message_id)));
      }
      if (action.type === "reply_comment" && item.triggerType === "comment" && action.comment_reply_text) {
        const payload = await metaWrite(`${encodeURIComponent(item.commentId)}/replies`, account.access_token, { message: asText(action.comment_reply_text, 1000) });
        if (!payload?.id) throw new Error("Instagram did not confirm comment reply");
        deliveries.push({ type: "reply_comment", id: String(payload.id) });
        runInBackground(incrementUsage(admin, workspaceId, false));
      }
      if (action.type === "add_tag" && action.tag_name) {
        await saveContactTags(admin, workspaceId, item.senderId, [action.tag_name]);
      }
    }
    if (!deliveries.length) return { ok: false, sent: false, reason: "no_reply_action", intentional_delay_ms: intentionalDelayMs };
    runInBackground(updateAutomationStats(admin, workspaceId, automation));
    return { ok: true, sent: true, deliveries, intentional_delay_ms: intentionalDelayMs,
      skipped_actions: actions.filter((a: any) => a.type === "auto_like_comment").map((a: any) => a.type) };
  } catch (error) {
    return { ok: false, sent: deliveries.length > 0, deliveries, reason: "automation_action_failed",
      error: error instanceof Error ? error.message : String(error), intentional_delay_ms: intentionalDelayMs };
  }
}

Deno.serve(async (req: Request) => {
  const edgeReceivedAt = Date.now();
  const verificationStart = performance.now();
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = String(url.searchParams.get("hub.mode") || "");
    const token = String(url.searchParams.get("hub.verify_token") || "");
    const challenge = String(url.searchParams.get("hub.challenge") || "");
    const configuredVerifyToken = cleanToken(
      Deno.env.get("WEBHOOK_VERIFY_TOKEN")
    );
    // Compatibility fallback for the existing Meta webhook token already used
    // by this project. The verify token only protects the GET handshake; POST
    // webhook authenticity is still enforced with the Meta app-secret HMAC.
    const acceptedVerifyTokens = new Set(
      [configuredVerifyToken, "nazha12"].filter(Boolean)
    );

    if (
      mode === "subscribe" &&
      token &&
      acceptedVerifyTokens.has(token)
    ) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (mode === "subscribe") {
      console.warn("[DIRECT_META_VERIFY_FAILED]", {
        tokenLength: token.length,
        configured: Boolean(configuredVerifyToken),
        challengePresent: Boolean(challenge),
      });
      return new Response("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.searchParams.get("check") === "runtime") {
      try {
        const { data, error } = await getAdminClient().rpc("autoreply_prepare_automation_event", {
          p_candidates: [], p_message_id: "", p_sender_id: "",
        });
        if (error || !data?.runtime_ready) throw new Error("Automation preparation unavailable");
        return reply(200, { ok: true, quotaReady: true, engineVersion: "2026-10-06-typing-lifecycle" });
      } catch {
        return reply(503, { ok: false, quotaReady: false });
      }
    }
    return reply(200, {
      ok: true,
      directMetaWebhookReady: Boolean(
        acceptedVerifyTokens.size &&
          cleanToken(Deno.env.get("INSTAGRAM_APP_SECRET"))
      ),
      verifyTokenConfigured: Boolean(configuredVerifyToken),
      openaiConfigured: Boolean(cleanToken(Deno.env.get("OPENAI_API_KEY"))),
    });
  }

  if (req.method !== "POST") {
    return reply(405, { ok: false, error: "Method Not Allowed" });
  }

  const rawBody = await req.text();

  let payload: any;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return reply(400, { ok: false, error: "Invalid JSON" });
  }

  const metaSignature = cleanToken(
    req.headers.get("x-hub-signature-256")
  );

  let event: any;
  let openaiKey = "";
  let relayReceivedAt = 0;

  if (metaSignature) {
    const appSecret = cleanToken(Deno.env.get("INSTAGRAM_APP_SECRET"));

    if (!appSecret) {
      return reply(503, {
        ok: false,
        error: "INSTAGRAM_APP_SECRET is not configured for direct webhook mode",
      });
    }

    const signatureOk = await verifyMetaHmac(
      rawBody,
      metaSignature,
      appSecret
    );

    if (!signatureOk) {
      return reply(403, { ok: false, error: "Invalid Meta signature" });
    }

    // Direct architecture: Meta -> Supabase Edge -> Instagram/OpenAI.
    event = payload;
    openaiKey = cleanToken(Deno.env.get("OPENAI_API_KEY"));
  } else {
    const relaySecret = cleanToken(Deno.env.get("INSTAGRAM_APP_SECRET"));
    if (!relaySecret || !payload?.metaAppSecret || !(await secretsMatch(String(payload.metaAppSecret), relaySecret))) {
      return reply(403, { ok: false, error: "Invalid relay authentication" });
    }
    // Backward-compatible architecture used by the current Vercel webhook.
    event = payload?.event;
    relayReceivedAt = Number(payload?.relayReceivedAt || 0);
    openaiKey = cleanToken(
      payload?.openaiKey || Deno.env.get("OPENAI_API_KEY")
    );
  }

  const verificationMs = Math.round(performance.now() - verificationStart);

  // If OpenAI is unavailable, the configured fallback message is still sent.
  const messages = extractAutomationEvents(event);
  if (!messages.length) {
    return reply(200, { ok: true, processed: 0, reason: "no_automation_events" });
  }

  const admin = getAdminClient();
  const results: any[] = [];

  for (const item of messages) {
    const totalStart = performance.now();
    const isGreeting = isConversationalGreeting(item.text);
    const instantReply = getInstantFastReply(item.text);
    const businessId = String(item.entryId || item.recipientId || "");
    const incomingTextKey = normalizeReplyCacheKey(item.text);
    const contextStart = performance.now();
    let context: any = null;
    let contextSource = "supabase_prepare_automation_event";
    let typingOnDispatchedMs: number | null = null;
    let typingContextSource: "edge_memory" | "supabase_runtime_context" | "full_context" | null = null;
    let typingAckMs: number | null = null;
    let typingApiMs: number | null = null;
    let typingAccepted = false;
    const batchWaitMs = Math.max(0, Date.now() - edgeReceivedAt - verificationMs);
    const metaIngressMs = Math.max(0, edgeReceivedAt - Number(item.timestamp || edgeReceivedAt));
    let typingStarted = false;
    let typingTask: Promise<any> = Promise.resolve(null);
    let typingSession: ReturnType<typeof createTypingSession> | null = null;

    const startTyping = (runtime: any, source: "edge_memory" | "supabase_runtime_context" | "full_context") => {
      if (typingStarted) return;

      // Never show Instagram's typing indicator unless an ACTIVE DM AI
      // Conversation automation has actually been resolved for this workspace.
      // A connected account/runtime context alone is not enough.
      const runtimeAutomation = runtime?.automation || null;
      const isActiveDmAiAutomation =
        runtimeAutomation?.trigger_type === "dm_ai_conversation" &&
        runtimeAutomation?.status === "active";
      if (!isActiveDmAiAutomation) return;

      const account = runtime?.account || null;
      const typingIgUserId = String(
        account?.ig_user_id || item.entryId || item.recipientId || ""
      );
      const typingAccessToken = cleanToken(account?.access_token);

      if (!typingIgUserId || !typingAccessToken || !item.senderId) return;

      typingStarted = true;
      typingContextSource = source;
      typingOnDispatchedMs = Math.round(performance.now() - totalStart);

      const typingStart = performance.now();
      typingSession = createTypingSession(`${typingIgUserId}:${item.senderId}`,
        (action, valid) => sendInstagramSenderAction(typingIgUserId, item.senderId, typingAccessToken, action, valid), result => {
        typingApiMs = Math.round(performance.now() - typingStart);
        typingAccepted = result !== null;
        if (typingAccepted) typingAckMs = Math.round(performance.now() - totalStart);
      });
      typingTask = typingSession.first;
      runInBackground(typingTask);
    };

    let typingStopRequested = false;
    const stopTyping = () => {
      if (!typingStarted || typingStopRequested) return;
      typingStopRequested = true;
      // Called after confirmed delivery or failure. The session suppresses stale
      // cleanup, serializes pending on/off, and cancels all refresh/retry work.
      if (typingSession) runInBackground(typingSession.stop());
    };

    try {
      context = await loadDmContext(admin, [item.entryId, item.recipientId], item.messageId, "", item.senderId, true);
    } catch {
      results.push({ messageId: item.messageId, ok: false, reason: "context_lookup_failed" });
      continue;
    }

    const contextMs = Math.round(performance.now() - contextStart);

    if (!context?.user_id || !context?.account?.access_token) {
      console.warn("[LIVE_DM_ACCOUNT_UNRESOLVED]", { entryId: item.entryId, recipientId: item.recipientId });
      results.push({
        messageId: item.messageId,
        ok: false,
        reason: "connected_account_not_found",
        contextMs,
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    const workspaceId = String(context.user_id);
    const account = context.account;
    const igUserId = String(
      account?.ig_user_id ||
        item.entryId ||
        item.recipientId
    );
    const accessToken = cleanToken(account?.access_token);
    const messageState = String(context?.message_state || "new");

    if (messageState === "outbound_echo") {
      console.log("[LIVE_DM_OUTBOUND_ECHO_IGNORED]", {
        messageId: item.messageId,
        senderId: item.senderId,
      });
      results.push({
        messageId: item.messageId,
        ok: true,
        ignored: true,
        reason: "outbound_echo",
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    if (messageState === "duplicate") {
      results.push({
        messageId: item.messageId,
        ok: true,
        duplicate: true,
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    // Meta can emit an outgoing event with a different scoped sender ID and
    // without is_echo. Accept only events addressed to this business; never
    // suppress a real customer's message just because its text matches a reply.
    if ((item.senderUsername && item.senderUsername === String(account.username || "").toLowerCase()) ||
        (item.triggerType !== "comment" && item.recipientId !== String(item.entryId) && item.recipientId !== igUserId)) {
      results.push({ messageId: item.messageId, ok: true, ignored: true, reason: "outgoing_message" });
      continue;
    }

    // Receiving a message is independent of reply rules, quota and Send API success.
    // Persist before every automation eligibility branch, without charging usage.
    try {
      await persistInboundMessage(admin, workspaceId, item, { username: item.senderId, avatar_url: "" });
    } catch {
      results.push({ messageId: item.messageId, ok: false, reason: "inbox_save_failed" });
      continue;
    }
    runInBackground((async () => {
      const profile = await getSenderProfile(item.senderId, accessToken);
      await persistInboundMessage(admin, workspaceId, item, profile, false);
    })());

    // The service-only RPC returns a single fresh snapshot. No additional
    // network reads stand between the durable claim and starting typing/AI.
    const eligibilityMs = 0, rulesMs = 0, quotaMs = 0;
    const automation = matchAutomation(context.automations || [], item);
    context.automation = automation;

    // Reply execution starts only after the incoming message is safely recorded.



    if (!automation) {
      runInBackground(
        logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
          status: "ignored",
          trigger_type: "dm_ai_conversation",
          sender_id: item.senderId,
          incoming_text: item.text,
          reason: "No matching active automation",
          context_ms: contextMs,
        })
      );
      results.push({
        messageId: item.messageId,
        ok: true,
        ignored: true,
        reason: "no_matching_automation",
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    if (!context.quota) {
      runInBackground(logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
        status: "failed", reason: "quota_check_failed", sender_id: item.senderId,
      }));
      results.push({ messageId: item.messageId, ok: false, reason: "quota_check_failed" });
      continue;
    }
    const quota = context.quota;
    if (quota.totalUsed >= quota.totalLimit) {
      results.push({ messageId:item.messageId, ok:true, ignored:true, reason:"monthly_message_limit_reached" });
      continue;
    }
    if (automation.trigger_type === "dm_ai_conversation" && quota.aiUsed >= quota.aiLimit) {
      results.push({ messageId:item.messageId, ok:true, ignored:true, reason:"monthly_ai_limit_reached" });
      continue;
    }

    if (automation.trigger_type !== "dm_ai_conversation") {
      const actionStart = performance.now();
      const outcome = await executeStaticActions(admin, workspaceId, item, automation, account);
      runInBackground(logEvent(admin, workspaceId, item.messageId, {
        ...outcome, status: outcome.ok ? "sent" : "failed", trigger_type: item.triggerType,
        automation_id: automation.id, automation_name: automation.name,
        context_ms: contextMs, action_ms: Math.round(performance.now() - actionStart),
        total_ms: Math.round(performance.now() - totalStart),
      }));
      results.push({ messageId: item.messageId, ...outcome, totalMs: Math.round(performance.now() - totalStart) });
      continue;
    }
    const extraDelay = (automation.actions || []).filter((a: any) => a.type === "add_delay")
      .reduce((sum: number, a: any) => sum + Number(a.delay_seconds || 0), 0);
    if (!Number.isFinite(extraDelay) || extraDelay < 0 || extraDelay > 20) {
      runInBackground(logEvent(admin, workspaceId, item.messageId, { status: "failed", reason: "configured_delay_exceeds_20_seconds" }));
      results.push({ messageId: item.messageId, ok: false, reason: "configured_delay_exceeds_20_seconds" });
      continue;
    }
    if (extraDelay) await new Promise(resolve => setTimeout(resolve, extraDelay * 1000));
    startTyping(context, "full_context");

    const aiAction = (automation?.actions || []).find(
      (a: any) => a?.type === "ai_chatbot"
    );
    const fallbackAction = (automation?.actions || []).find(
      (a: any) => a?.type === "send_dm"
    );

    const baseSystemPrompt = asText(
      aiAction?.ai_system_instruction ||
        "You are a helpful Instagram DM assistant. Reply naturally and briefly.",
      10000
    );
    const systemPrompt = asText(
      `${baseSystemPrompt}

Instagram DM style rules:
- Follow the business instructions above first.
- Never use a fixed canned greeting such as "Hi! How can I help you today?".
- For greetings/first-contact messages, write a fresh, short, human-sounding reply each time based on the business context.
- If the business sells products, naturally guide the customer toward choosing/buying and ask one relevant next question when useful.
- Use emojis generously and naturally in short replies, usually 2-4 suitable emojis, but avoid spammy emoji walls.
- Keep greetings and straightforward answers concise: usually 1-2 short sentences and at most one relevant question.
- Avoid repeating the customer's message, unnecessary introductions and extra sales questions. Give longer detail only when requested.
- Match the customer's language/style when possible.`,
      12000
    );
    const model = "gpt-4o-mini";

    let responseText = "";
    let aiError = "";
    let aiMs = 0;
    const history: any[] = Array.isArray(context?.history)
      ? context.history.slice(-10)
      : [];
    const historyMs = 0;
    let fastPath: string | null = null;
    const sharedReplyAllowed = false;
    const cachedReply = sharedReplyAllowed ? asText(context?.cached_reply, 1000) : "";

    if (instantReply) {
      responseText = instantReply;
      fastPath = "greeting";
      console.log("[LIVE_DM_FAST_PATH]", {
        type: fastPath,
        messageId: item.messageId,
      });
    } else if (cachedReply) {
      responseText = cachedReply;
      fastPath = "supabase_reply_cache";
      console.log("[LIVE_DM_FAST_PATH]", {
        type: fastPath,
        messageId: item.messageId,
      });
    } else {
      const aiStart = performance.now();

      try {
        responseText = await generateReply(
          openaiKey,
          model,
          systemPrompt,
          history,
          item.text,
          isGreeting
        );
      } catch (err) {
        aiError = err instanceof Error ? err.message : String(err);
        console.error("[LIVE_DM_OPENAI_FAILED]", aiError);

        responseText = asText(
          fallbackAction?.message_text ||
            "Thanks for your message! Our team will get back to you shortly.",
          1000
        );
      }

      aiMs = Math.round(performance.now() - aiStart);

      if (!aiError && responseText && sharedReplyAllowed) {
        runInBackground(
          saveReplyCache(
            admin,
            workspaceId,
            String(automation.id || ""),
            item.text,
            responseText
          )
        );
      }
    }

    const outgoingTextKey = normalizeReplyCacheKey(responseText);
    const outgoingMemoryKey = `${igUserId}:${outgoingTextKey}`;
    pendingOutboundMemory.set(outgoingMemoryKey, {
      recipientId: item.senderId,
      expiresAt: Date.now() + 10_000,
    });

    runInBackground(
      markPendingOutbound(
        admin,
        workspaceId,
        responseText,
        item.senderId
      )
    );

    const sendStartEpoch = Date.now();
    const metaDeliveryMs = Math.max(
      0,
      sendStartEpoch - Number(item.timestamp || sendStartEpoch)
    );
    const metaToRelayMs = relayReceivedAt > 0
      ? Math.max(0, relayReceivedAt - Number(item.timestamp || relayReceivedAt))
      : null;
    const relayToEdgeMs = relayReceivedAt > 0
      ? Math.max(0, edgeReceivedAt - relayReceivedAt)
      : null;
    const backendPreSendMs = Math.round(performance.now() - totalStart);
    const sendStart = performance.now();

    try {
      // This is the user-visible critical point. Everything expensive that does
      // not affect the reply itself is deferred until after the Send API call.
      const sendResult = await sendInstagramText(
        igUserId,
        item.senderId,
        accessToken,
        responseText
      );

      const sendMs = Math.round(performance.now() - sendStart);
      const instagramMessageId = String(sendResult?.message_id || "");
      runInBackground(incrementUsage(admin, workspaceId, true));
      const tagActions = (automation.actions || []).filter((a: any) => a.type === "add_tag");
      if (tagActions.length) runInBackground(saveContactTags(admin, workspaceId, item.senderId, tagActions.map((a: any) => a.tag_name)));
      runInBackground(syncAiLeadToGoogleSheet(admin, workspaceId, item.senderId, item.text, history, openaiKey));

      stopTyping();

      if (instagramMessageId) {
        runInBackground(
          markOutboundClaim(admin, workspaceId, instagramMessageId)
        );
      }

      const nextHistory = [
        ...history,
        { role: "user", content: item.text, at: item.timestamp },
        { role: "assistant", content: responseText, at: Date.now() },
      ];

      // Persist the new conversation before the next event in this batch.
      await saveHistory(admin, workspaceId, item.senderId, nextHistory);
      runInBackground(
        (async () => {
          await typingTask;
          let senderProfile = {
            username: item.senderId,
            avatar_url: "",
          };

          try {
            senderProfile = await getSenderProfile(item.senderId, accessToken);
          } catch (err) {
            console.warn("[LIVE_DM_PROFILE_BACKGROUND_WARN]", err);
          }

          await Promise.all([
            persistOutboundMessage(
              admin,
              workspaceId,
              item,
              senderProfile,
              automation,
              responseText,
              instagramMessageId
            ),
            updateAutomationStats(admin, workspaceId, automation),
            logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
              status: "sent",
              trigger_type: "dm_ai_conversation",
              automation_id: automation.id,
              automation_name: automation.name,
              sender_id: item.senderId,
              recipient_id: igUserId,
              incoming_text: item.text,
              reply_text: responseText,
              ai_model: model,
              ai_error: aiError || null,
              instagram_message_id: instagramMessageId || null,
              context_ms: contextMs,
              history_ms: historyMs,
              ai_ms: aiMs,
              send_ms: sendMs,
              backend_pre_send_ms: backendPreSendMs,
              meta_delivery_ms: metaDeliveryMs,
              meta_ingress_ms: metaIngressMs,
              verification_ms: verificationMs,
              batch_wait_ms: batchWaitMs,
              rules_ms: rulesMs, quota_ms: quotaMs, eligibility_ms: eligibilityMs,
              typing_api_ms: typingApiMs, typing_ack_ms: typingAckMs,
              typing_accepted: typingAccepted,
              message_to_send_ack_ms: metaDeliveryMs + sendMs,
              meta_to_relay_ms: metaToRelayMs,
              relay_to_edge_ms: relayToEdgeMs,
              fast_path: fastPath,
              context_source: contextSource,
              typing_on_dispatched_ms: typingOnDispatchedMs,
              typing_context_source: typingContextSource,
            }),
          ]);
        })()
      );

      results.push({
        messageId: item.messageId,
        ok: true,
        automationId: automation.id,
        sent: true,
        fallbackUsed: Boolean(aiError),
        contextMs,
        historyMs,
        aiMs,
        sendMs,
        backendPreSendMs,
        metaDeliveryMs,
        metaToRelayMs,
        relayToEdgeMs,
        fastPath,
        contextSource,
        typingOnDispatchedMs,
        typingContextSource,
        totalMs: Math.round(performance.now() - totalStart),
      });
    } catch (err) {
      const sendMs = Math.round(performance.now() - sendStart);
      const sendError = err instanceof Error ? err.message : String(err);

      stopTyping();
      console.error("[LIVE_DM_SEND_FAILED]", sendError);

      runInBackground(
        logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
          status: "failed",
          trigger_type: "dm_ai_conversation",
          automation_id: automation.id,
          automation_name: automation.name,
          sender_id: item.senderId,
          recipient_id: igUserId,
          incoming_text: item.text,
          ai_error: aiError || null,
          send_error: sendError,
          context_ms: contextMs,
          history_ms: historyMs,
          ai_ms: aiMs,
          send_ms: sendMs,
          backend_pre_send_ms: backendPreSendMs,
          meta_delivery_ms: metaDeliveryMs,
          meta_ingress_ms: metaIngressMs, verification_ms: verificationMs,
          batch_wait_ms: batchWaitMs, rules_ms: rulesMs, quota_ms: quotaMs,
          eligibility_ms: eligibilityMs, typing_api_ms: typingApiMs,
          typing_ack_ms: typingAckMs, typing_accepted: typingAccepted,
          meta_to_relay_ms: metaToRelayMs,
          relay_to_edge_ms: relayToEdgeMs,
          typing_on_dispatched_ms: typingOnDispatchedMs,
          typing_context_source: typingContextSource,
        })
      );

      results.push({
        messageId: item.messageId,
        ok: false,
        reason: "instagram_send_failed",
        error: sendError,
        contextMs,
        historyMs,
        aiMs,
        sendMs,
        backendPreSendMs,
        metaDeliveryMs,
        metaToRelayMs,
        relayToEdgeMs,
        typingOnDispatchedMs,
        typingContextSource,
        totalMs: Math.round(performance.now() - totalStart),
      });
    }
  }

  console.log("[LIVE_DM_BATCH_RESULT]", results.map(r => ({
    ok: r.ok, sent: Boolean(r.sent), reason: r.reason || null,
    duplicate: Boolean(r.duplicate), contextMs: r.contextMs,
    typingOnDispatchedMs: r.typingOnDispatchedMs, aiMs: r.aiMs, sendMs: r.sendMs,
  })));
  return reply(200, {
    ok: true,
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  });
});
