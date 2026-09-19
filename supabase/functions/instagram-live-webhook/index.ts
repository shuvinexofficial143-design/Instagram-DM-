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
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
  } else {
    task.catch((err) => console.warn("[BACKGROUND_TASK_WARN]", err));
  }
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

  const expiresAt = Date.now() + 30_000;
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

  const { data, error } = await admin.rpc("autoreply_claim_dm_context_v4", {
    p_candidates: candidates,
    p_message_id: String(messageId || ""),
    p_query_key: normalizeReplyCacheKey(incomingText),
    p_sender_id: String(senderId || ""),
    p_include_history: Boolean(includeHistory),
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
    p_query_key: normalizeReplyCacheKey(incomingText),
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
      username: String(payload?.username || payload?.name || senderId),
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
  profile: { username: string; avatar_url: string }
) {
  const nowIso = new Date(
    Number.isFinite(item?.timestamp) ? item.timestamp : Date.now()
  ).toISOString();
  const messageId =
    String(item?.messageId || "").trim() ||
    `in_${item.senderId}_${item.timestamp || Date.now()}`;

  const { data: existingContact } = await admin
    .from("autoreply_documents")
    .select("data")
    .eq("user_id", workspaceId)
    .eq("collection", "contacts")
    .eq("id", item.senderId)
    .maybeSingle();

  const existing = existingContact?.data || {};
  const interactions = existing?.interactions || {};

  const contact = {
    id: item.senderId,
    ig_username: profile.username || item.senderId,
    ig_user_id: item.senderId,
    avatar_url: profile.avatar_url || existing?.avatar_url || "",
    first_interaction_at: existing?.first_interaction_at || nowIso,
    last_interaction_at: nowIso,
    interactions: {
      comments: Number(interactions?.comments || 0),
      dms: Number(interactions?.dms || 0) + 1,
      stories: Number(interactions?.stories || 0),
    },
    tags: Array.isArray(existing?.tags) ? existing.tags : [],
    status: existing?.status || "lead",
  };

  const inbox = {
    id: messageId,
    from_ig_id: item.senderId,
    from_username: profile.username || item.senderId,
    from_avatar: profile.avatar_url || "",
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
          id: item.senderId,
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

function getInstantFastReply(incomingText: string): string | null {
  const clean = String(incomingText || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[!.?]+$/g, "")
    .replace(/\s+/g, " ");

  // These messages do not need an LLM round trip. This keeps common first-contact
  // greetings as fast as the Instagram Send API itself.
  if (/^(hi+|hii+|hiii+|hello+|hey+|hey there|hello there|hlo+|hy+)$/.test(clean)) {
    return "Hi! How can I help you today?";
  }

  if (/^(namaste|namaskar)$/.test(clean)) {
    return "Namaste! Main aapki kaise help kar sakta hoon?";
  }

  if (/^(good morning|good afternoon|good evening)$/.test(clean)) {
    return "Hello! How can I help you today?";
  }

  return null;
}

async function generateReply(
  openaiKey: string,
  model: string,
  systemPrompt: string,
  history: any[],
  incomingText: string
) {
  if (!openaiKey) throw new Error("OPENAI_API_KEY is missing");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

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
        temperature: 0.3,
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

async function sendInstagramSenderAction(
  igUserId: string,
  recipientId: string,
  accessToken: string,
  action: "typing_on" | "typing_off"
) {
  if (!igUserId || !recipientId || !accessToken) return null;

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
      return null;
    }

    return await response.json().catch(() => ({}));
  } catch (err) {
    console.warn("[LIVE_DM_SENDER_ACTION_ERROR]", {
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
    }
  );

  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Instagram Send API HTTP ${response.status}`
    );
  }

  return payload;
}

Deno.serve(async (req: Request) => {
  const edgeReceivedAt = Date.now();
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
    // Backward-compatible architecture used by the current Vercel webhook.
    event = payload?.event;
    relayReceivedAt = Number(payload?.relayReceivedAt || 0);
    openaiKey = cleanToken(
      payload?.openaiKey || Deno.env.get("OPENAI_API_KEY")
    );
  }

  // If OpenAI is unavailable, the configured fallback message is still sent.
  const messages = extractDirectMessages(event);
  if (!messages.length) {
    return reply(200, { ok: true, processed: 0, reason: "no_text_dm_events" });
  }

  const admin = getAdminClient();
  const results: any[] = [];

  for (const item of messages) {
    const totalStart = performance.now();
    const instantReply = getInstantFastReply(item.text);
    const businessId = String(item.entryId || item.recipientId || "");
    const incomingTextKey = normalizeReplyCacheKey(item.text);
    const memoryKey = `${businessId}:${incomingTextKey}`;
    const pendingMemory = pendingOutboundMemory.get(memoryKey);

    if (pendingMemory && pendingMemory.expiresAt <= Date.now()) {
      pendingOutboundMemory.delete(memoryKey);
    } else if (
      pendingMemory &&
      pendingMemory.recipientId !== String(item.senderId || "")
    ) {
      results.push({
        messageId: item.messageId,
        ok: true,
        ignored: true,
        reason: "outbound_echo_memory",
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    const contextStart = performance.now();
    let context: any = null;
    let contextSource = "supabase_runtime_context_v4";
    let typingOnDispatchedMs: number | null = null;
    let typingContextSource: "edge_memory" | "supabase_runtime_context" | "full_context" | null = null;
    let typingStarted = false;

    const startTyping = (runtime: any, source: "edge_memory" | "supabase_runtime_context" | "full_context") => {
      if (typingStarted) return;
      const account = runtime?.account || null;
      const typingIgUserId = String(
        account?.ig_user_id || item.entryId || item.recipientId || ""
      );
      const typingAccessToken = cleanToken(account?.access_token);

      if (!typingIgUserId || !typingAccessToken || !item.senderId) return;

      typingStarted = true;
      typingContextSource = source;
      typingOnDispatchedMs = Math.round(performance.now() - totalStart);

      runInBackground(
        sendInstagramSenderAction(
          typingIgUserId,
          item.senderId,
          typingAccessToken,
          "typing_on"
        )
      );
    };

    const warmRuntime = runtimeContextMemory.get(businessId);
    const warmRuntimeValid = Boolean(
      warmRuntime && warmRuntime.expiresAt > Date.now()
    );

    if (warmRuntimeValid) {
      startTyping(warmRuntime!.value, "edge_memory");
    }

    // Cold isolates still launch a tiny indexed runtime-context lookup in
    // parallel with the full dedupe/cache/history RPC. It exists only so
    // typing_on can be dispatched as early as possible.
    const typingContextPromise = warmRuntimeValid
      ? Promise.resolve(warmRuntime!.value)
      : loadTypingRuntimeContext(
          admin,
          [item.entryId, item.recipientId]
        ).then((runtime) => {
          if (runtime) {
            startTyping(runtime, "supabase_runtime_context");
          }
          return runtime;
        });
    const warmAutomationId = String(
      warmRuntime?.value?.automation?.id || ""
    );
    const warmReplyKey =
      warmRuntime?.value?.user_id && warmAutomationId && incomingTextKey
        ? `${warmRuntime.value.user_id}:${warmAutomationId}:${incomingTextKey}`
        : "";
    const warmReply = warmReplyKey
      ? replyCacheMemory.get(warmReplyKey)
      : undefined;
    const warmReplyValid = Boolean(
      warmReply && warmReply.expiresAt > Date.now()
    );
    const warmHistoryKey =
      warmRuntime?.value?.user_id && item.senderId
        ? `${warmRuntime.value.user_id}:${item.senderId}`
        : "";
    const warmHistory = warmHistoryKey
      ? historyCache.get(warmHistoryKey)
      : undefined;
    const warmHistoryValid = Boolean(
      warmHistory && warmHistory.expiresAt > Date.now()
    );

    if (
      warmRuntimeValid &&
      (instantReply || warmReplyValid || warmHistoryValid)
    ) {
      const workspaceId = String(warmRuntime!.value.user_id || "");
      const claimKey = `${workspaceId}:${item.messageId}`;
      const existingClaimExpiry = messageClaimMemory.get(claimKey) || 0;
      const messageState =
        item.messageId && existingClaimExpiry > Date.now()
          ? "duplicate"
          : "new";

      if (item.messageId && messageState === "new") {
        messageClaimMemory.set(claimKey, Date.now() + 30 * 60 * 1000);
      }

      context = {
        ...warmRuntime!.value,
        cached_reply: warmReplyValid ? warmReply!.responseText : null,
        history: warmHistoryValid ? warmHistory!.messages.slice(-10) : [],
        message_state: messageState,
      };
      contextSource = "edge_memory";

      // Persist dedupe state cross-isolate without making the visible reply wait.
      if (messageState === "new") {
        runInBackground(
          claimMessageOnly(
            admin,
            workspaceId,
            item.messageId,
            item.text,
            item.senderId
          )
        );
      }
    } else {
      const fullContextPromise = loadDmContext(
        admin,
        [item.entryId, item.recipientId],
        item.messageId,
        item.text,
        item.senderId,
        !instantReply
      );

      // Both requests are already in flight. Await the full context needed for
      // reply correctness, while typing_on may already be travelling to Meta.
      context = await fullContextPromise;

      if (context?.user_id && context?.account?.access_token) {
        if (!typingStarted) {
          startTyping(context, "full_context");
        }
        const runtimeValue = {
          user_id: context.user_id,
          account: context.account,
          automation: context.automation || null,
        };
        const expiresAt = Date.now() + 15_000;
        const accountIgId = String(context?.account?.ig_user_id || businessId);

        if (businessId) {
          runtimeContextMemory.set(businessId, {
            expiresAt,
            value: runtimeValue,
          });
        }
        if (accountIgId && accountIgId !== businessId) {
          runtimeContextMemory.set(accountIgId, {
            expiresAt,
            value: runtimeValue,
          });
        }

        if (item.messageId) {
          // Remember every observed message id locally. Whether Supabase marked
          // it new, duplicate, or outbound-echo, seeing it again on this warm
          // isolate should never trigger another reply.
          messageClaimMemory.set(
            `${context.user_id}:${item.messageId}`,
            Date.now() + 30 * 60 * 1000
          );
        }

        const automationId = String(context?.automation?.id || "");
        if (automationId && context?.cached_reply && incomingTextKey) {
          replyCacheMemory.set(
            `${context.user_id}:${automationId}:${incomingTextKey}`,
            {
              responseText: String(context.cached_reply),
              expiresAt: Date.now() + 60 * 60 * 1000,
            }
          );
        }

        if (item.senderId) {
          historyCache.set(
            `${context.user_id}:${item.senderId}`,
            {
              messages: Array.isArray(context?.history)
                ? context.history.slice(-10)
                : [],
              expiresAt: Date.now() + 60_000,
            }
          );
        }
      }
    }

    // Keep the lightweight typing lookup detached from the visible reply path.
    void typingContextPromise;

    const contextMs = Math.round(performance.now() - contextStart);

    if (!context?.user_id || !context?.account?.access_token) {
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
    const automation = context.automation || null;
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

    // Profile/contact/inbox work is intentionally deferred until after the
    // Instagram Send API call so it cannot slow the visible reply.



    if (!automation) {
      runInBackground(
        logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
          status: "ignored",
          trigger_type: "dm_ai_conversation",
          sender_id: item.senderId,
          incoming_text: item.text,
          reason: "No active DM AI Conversation automation",
          context_ms: contextMs,
        })
      );
      results.push({
        messageId: item.messageId,
        ok: true,
        ignored: true,
        reason: "no_active_dm_ai_automation",
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    const aiAction = (automation?.actions || []).find(
      (a: any) => a?.type === "ai_chatbot"
    );
    const fallbackAction = (automation?.actions || []).find(
      (a: any) => a?.type === "send_dm"
    );

    const systemPrompt = asText(
      aiAction?.ai_system_instruction ||
        "You are a helpful Instagram DM assistant. Reply naturally and briefly.",
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
    const cachedReply = asText(context?.cached_reply, 1000);

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
          item.text
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

      if (!aiError && responseText) {
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

      if (typingStarted) {
        runInBackground(
          sendInstagramSenderAction(
            igUserId,
            item.senderId,
            accessToken,
            "typing_off"
          )
        );
      }

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

      runInBackground(
        (async () => {
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
            persistInboundMessage(
              admin,
              workspaceId,
              item,
              senderProfile
            ),
            saveHistory(admin, workspaceId, item.senderId, nextHistory),
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

      if (typingStarted) {
        runInBackground(
          sendInstagramSenderAction(
            igUserId,
            item.senderId,
            accessToken,
            "typing_off"
          )
        );
      }
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

  return reply(200, {
    ok: true,
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  });
});
