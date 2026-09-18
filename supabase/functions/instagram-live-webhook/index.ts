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

async function resolveDmContext(
  admin: any,
  candidates: string[],
  messageId: string
) {
  const cleanCandidates = [...new Set(
    (candidates || []).map((id) => String(id || "").trim()).filter(Boolean)
  )];

  const { data, error } = await admin.rpc("autoreply_resolve_dm_context", {
    p_candidates: cleanCandidates,
    p_message_id: String(messageId || ""),
  });

  if (error) {
    console.error("[LIVE_DM_CONTEXT_RPC_FAILED]", error);
    throw new Error("Could not resolve DM context");
  }

  return data || null;
}


type RedisConfig = { restUrl: string; restToken: string };
let redisConfigCache: { expiresAt: number; value: RedisConfig | null } = {
  expiresAt: 0,
  value: null,
};
type RuntimeSecrets = {
  appSecret: string;
  verifyToken: string;
  openaiKey: string;
};
let runtimeSecretsCache: { expiresAt: number; value: RuntimeSecrets | null } = {
  expiresAt: 0,
  value: null,
};

async function getRuntimeSecrets(admin: any): Promise<RuntimeSecrets | null> {
  if (runtimeSecretsCache.expiresAt > Date.now()) {
    return runtimeSecretsCache.value;
  }

  const { data, error } = await admin
    .from("autoreply_integrations")
    .select("config")
    .eq("provider", "runtime_secrets")
    .maybeSingle();

  if (error) {
    console.warn("[RUNTIME_SECRETS_LOAD_WARN]", error.message || error);
    runtimeSecretsCache = { expiresAt: Date.now() + 5_000, value: null };
    return null;
  }

  const value = data?.config
    ? {
        appSecret: cleanToken(data.config.app_secret),
        verifyToken: cleanToken(data.config.verify_token),
        openaiKey: cleanToken(data.config.openai_key),
      }
    : null;

  runtimeSecretsCache = { expiresAt: Date.now() + 3_600_000, value };
  return value;
}

async function persistRuntimeSecrets(
  admin: any,
  values: Partial<RuntimeSecrets>
) {
  const current = (await getRuntimeSecrets(admin)) || {
    appSecret: "",
    verifyToken: "",
    openaiKey: "",
  };

  const merged = {
    appSecret: cleanToken(values.appSecret || current.appSecret),
    verifyToken: cleanToken(values.verifyToken || current.verifyToken),
    openaiKey: cleanToken(values.openaiKey || current.openaiKey),
  };

  if (!merged.appSecret && !merged.openaiKey && !merged.verifyToken) return;

  const { error } = await admin
    .from("autoreply_integrations")
    .upsert(
      {
        provider: "runtime_secrets",
        config: {
          app_secret: merged.appSecret,
          verify_token: merged.verifyToken,
          openai_key: merged.openaiKey,
        },
      },
      { onConflict: "provider" }
    );

  if (error) {
    console.warn("[RUNTIME_SECRETS_SAVE_WARN]", error.message || error);
    return;
  }

  runtimeSecretsCache = {
    expiresAt: Date.now() + 3_600_000,
    value: merged,
  };
}


async function getRedisConfig(admin: any): Promise<RedisConfig | null> {
  if (redisConfigCache.expiresAt > Date.now()) return redisConfigCache.value;

  const { data, error } = await admin
    .from("autoreply_integrations")
    .select("config")
    .eq("provider", "upstash_redis")
    .maybeSingle();

  if (error) {
    console.warn("[REDIS_CONFIG_LOAD_WARN]", error.message || error);
    redisConfigCache = { expiresAt: Date.now() + 60_000, value: null };
    return null;
  }

  const restUrl = String(data?.config?.rest_url || "").replace(/\/$/, "");
  const restToken = String(data?.config?.rest_token || "").trim();
  const value = restUrl && restToken ? { restUrl, restToken } : null;
  redisConfigCache = { expiresAt: Date.now() + 3_600_000, value };
  return value;
}

async function redisCommand(
  admin: any,
  command: Array<string | number>
): Promise<{ available: boolean; result: any }> {
  const config = await getRedisConfig(admin);
  if (!config) return { available: false, result: null };

  try {
    const response = await fetch(config.restUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command.map((part) => String(part))),
    });

    const payload: any = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn("[REDIS_COMMAND_WARN]", response.status, payload?.error || "request failed");
      return { available: false, result: null };
    }
    return { available: true, result: payload?.result ?? null };
  } catch (err) {
    console.warn("[REDIS_COMMAND_ERROR]", err);
    return { available: false, result: null };
  }
}

async function redisPipeline(
  admin: any,
  commands: Array<Array<string | number>>
): Promise<{ available: boolean; results: any[] }> {
  const config = await getRedisConfig(admin);
  if (!config) return { available: false, results: [] };

  try {
    const response = await fetch(`${config.restUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        commands.map((command) => command.map((part) => String(part)))
      ),
    });

    const payload: any = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload)) {
      console.warn("[REDIS_PIPELINE_WARN]", response.status);
      return { available: false, results: [] };
    }

    return {
      available: true,
      results: payload.map((item: any) => item?.result ?? null),
    };
  } catch (err) {
    console.warn("[REDIS_PIPELINE_ERROR]", err);
    return { available: false, results: [] };
  }
}

function textFingerprint(value: string) {
  let hash = 2166136261;
  const text = String(value || "").trim().toLocaleLowerCase();
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function runInBackground(task: Promise<unknown>) {
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
  } else {
    task.catch((err) => console.warn("[BACKGROUND_TASK_WARN]", err));
  }
}

async function redisGetJson(admin: any, key: string) {
  const response = await redisCommand(admin, ["GET", key]);
  if (!response.available || typeof response.result !== "string") {
    return { available: response.available, value: null };
  }

  try {
    return { available: true, value: JSON.parse(response.result) };
  } catch {
    return { available: true, value: null };
  }
}

async function redisSetJson(admin: any, key: string, value: any, ttlSeconds: number) {
  return redisCommand(admin, [
    "SET",
    key,
    JSON.stringify(value),
    "EX",
    Math.max(1, Math.floor(ttlSeconds)),
  ]);
}

async function markOutboundMessage(
  admin: any,
  workspaceId: string,
  messageId: string
) {
  if (!messageId) return;
  await redisCommand(admin, [
    "SET",
    `ar:v1:msg:${workspaceId}:${messageId}`,
    "out",
    "EX",
    "900",
  ]);
}

async function markPendingOutbound(
  admin: any,
  workspaceId: string,
  responseText: string,
  recipientId: string
) {
  if (!responseText || !recipientId) return;
  await redisCommand(admin, [
    "SET",
    `ar:v1:pendingout:${workspaceId}:${textFingerprint(responseText)}`,
    recipientId,
    "EX",
    "20",
  ]);
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

async function findWorkspaceByInstagramIds(admin: any, ids: string[]) {
  const candidates = [...new Set(
    (ids || []).map((id) => String(id || "").trim()).filter(Boolean)
  )];

  if (!candidates.length) return null;

  // Hottest path first: a warm Edge isolate can resolve the account without
  // any Redis/Postgres round-trip.
  if (
    accountRowsCache.rows.length &&
    accountRowsCache.expiresAt > Date.now()
  ) {
    const warmMatch = accountRowsCache.rows.find((row: any) =>
      candidates.includes(String(row?.account?.ig_user_id || ""))
    );
    if (warmMatch?.user_id && warmMatch?.account?.access_token) {
      return {
        ...warmMatch,
        matchedInstagramId: String(warmMatch?.account?.ig_user_id || ""),
        _cache: "memory",
      };
    }
  }

  // On a cold isolate, the authoritative account table lives in the same
  // Supabase region. One small DB read is cheaper than first loading Redis
  // credentials and then making a second network request.
  const { data, error } = await admin
    .from("autoreply_instagram_tokens")
    .select("user_id,account")
    .limit(100);

  if (error) {
    console.error("[LIVE_DM_ACCOUNT_SCAN_FAILED]", error);
    return null;
  }

  const rows = data || [];
  accountRowsCache = {
    rows,
    expiresAt: Date.now() + 3_600_000,
  };

  // Populate Redis after the critical lookup; future workers can use it for
  // recovery/other paths without making this reply wait.
  runInBackground(
    Promise.all(
      rows
        .filter((row: any) => row?.user_id && row?.account?.access_token)
        .map((row: any) =>
          redisSetJson(
            admin,
            `ar:v1:account:ig:${String(row?.account?.ig_user_id || "")}`,
            row,
            3600
          )
        )
    )
  );

  const matched = rows.find((row: any) =>
    candidates.includes(String(row?.account?.ig_user_id || ""))
  );

  if (matched?.user_id && matched?.account?.access_token) {
    return {
      ...matched,
      matchedInstagramId: String(matched?.account?.ig_user_id || ""),
      _cache: "db",
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
      _cache: "single_fallback",
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

  const redisCached = await redisGetJson(admin, `ar:v1:automation:${workspaceId}`);
  if (redisCached.value) {
    const automation = redisCached.value?._cache_none ? null : redisCached.value;
    automationCache.set(workspaceId, {
      automation,
      expiresAt: Date.now() + 60_000,
    });
    return automation;
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
    expiresAt: Date.now() + 60_000,
  });

  runInBackground(
    redisSetJson(
      admin,
      `ar:v1:automation:${workspaceId}`,
      automation || { _cache_none: true },
      60
    )
  );

  return automation;
}
async function classifyMessageId(
  admin: any,
  workspaceId: string,
  item: any
): Promise<"new" | "outbound_echo" | "duplicate"> {
  const messageId = String(item?.messageId || "");
  if (!messageId) return "new";

  const redisKey = `ar:v1:msg:${workspaceId}:${messageId}`;
  const pendingKey =
    `ar:v1:pendingout:${workspaceId}:${textFingerprint(String(item?.text || ""))}`;

  const pipeline = await redisPipeline(admin, [
    ["SET", redisKey, "in", "NX", "EX", "900"],
    ["GET", pendingKey],
  ]);

  if (pipeline.available) {
    const claimed = pipeline.results[0];
    const pendingRecipient = String(pipeline.results[1] || "");

    if (
      pendingRecipient &&
      pendingRecipient !== String(item?.senderId || "")
    ) {
      runInBackground(
        redisCommand(admin, ["SET", redisKey, "out", "EX", "900"])
      );
      return "outbound_echo";
    }

    if (claimed === "OK") return "new";

    const existing = await redisCommand(admin, ["GET", redisKey]);
    if (existing.available) {
      return existing.result === "out" ? "outbound_echo" : "duplicate";
    }
  }

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
  const key = `ar:v1:history:${workspaceId}:${senderId}`;
  const cached = await redisGetJson(admin, key);
  if (Array.isArray(cached.value)) return cached.value.slice(-10);

  const { data } = await admin
    .from("autoreply_documents")
    .select("data")
    .eq("user_id", workspaceId)
    .eq("collection", "dm_history")
    .eq("id", senderId)
    .maybeSingle();

  const messages = Array.isArray(data?.data?.messages)
    ? data.data.messages.slice(-10)
    : [];

  runInBackground(redisSetJson(admin, key, messages, 3600));
  return messages;
}

async function saveHistory(
  admin: any,
  workspaceId: string,
  senderId: string,
  history: any[]
) {
  const messages = history.slice(-12);
  const key = `ar:v1:history:${workspaceId}:${senderId}`;

  await Promise.all([
    redisSetJson(admin, key, messages, 3600),
    admin
      .from("autoreply_documents")
      .upsert(
        {
          user_id: workspaceId,
          collection: "dm_history",
          id: senderId,
          data: { messages, updated_at: new Date().toISOString() },
        },
        { onConflict: "user_id,collection,id" }
      ),
  ]);
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
  admin: any,
  workspaceId: string,
  item: any,
  profile: { username: string },
  status: "triggered" | "ignored" | "error" | "success",
  automation?: any,
  responseText?: string,
  error?: string
) {
  const id = String(item?.messageId || `log_${crypto.randomUUID()}`);
  const data = {
    id,
    timestamp: new Date().toISOString(),
    trigger_type: "dm_ai_conversation",
    from_username: profile.username || item.senderId,
    incoming_text: item.text,
    status,
    matched_automation_name: automation?.name || "",
    response_sent: responseText || "",
    api_response: error ? { error } : undefined,
  };

  const { error: saveError } = await admin
    .from("autoreply_documents")
    .upsert(
      {
        user_id: workspaceId,
        collection: "webhook_logs",
        id,
        data,
      },
      { onConflict: "user_id,collection,id" }
    );

  if (saveError) {
    console.error("[LIVE_DM_WEBHOOK_LOG_SAVE_FAILED]", saveError);
  }
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
  const timeout = setTimeout(() => controller.abort(), 18000);

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
            .filter((m: any) => m?.role && m?.content)
            .map((m: any) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: asText(m.content, 4000),
            })),
          { role: "user", content: incomingText },
        ],
        temperature: 0.3,
        max_tokens: 160,
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

    const visibleCustomEnvKeys = Object.keys(Deno.env.toObject())
      .filter((key) =>
        key.includes("INSTAGRAM") ||
        key.includes("WEBHOOK") ||
        key.includes("OPENAI")
      )
      .sort();

    const healthAdmin = getAdminClient();
    const [redisPing, storedSecrets] = await Promise.all([
      redisCommand(healthAdmin, ["PING"]),
      getRuntimeSecrets(healthAdmin),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        directMetaWebhookReady: Boolean(
          acceptedVerifyTokens.size &&
            (
              cleanToken(Deno.env.get("INSTAGRAM_APP_SECRET")) ||
              storedSecrets?.appSecret
            )
        ),
        verifyTokenConfigured: Boolean(
          configuredVerifyToken || storedSecrets?.verifyToken || "nazha12"
        ),
        openaiConfigured: Boolean(
          cleanToken(Deno.env.get("OPENAI_API_KEY")) ||
          storedSecrets?.openaiKey
        ),
        redisReady: redisPing.available && redisPing.result === "PONG",
        visibleCustomEnvKeys,
        deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID") || null,
        region: Deno.env.get("SB_REGION") || null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
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
  let forwardedAppSecret = "";
  let forwardedVerifyToken = "";

  if (metaSignature) {
    const directAdmin = getAdminClient();
    const storedSecrets = await getRuntimeSecrets(directAdmin);
    const appSecret = cleanToken(
      Deno.env.get("INSTAGRAM_APP_SECRET") || storedSecrets?.appSecret
    );

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
    openaiKey = cleanToken(
      Deno.env.get("OPENAI_API_KEY") || storedSecrets?.openaiKey
    );
  } else {
    // Backward-compatible architecture used by the current Vercel webhook.
    event = payload?.event;
    relayReceivedAt = Number(payload?.relayReceivedAt || 0);
    forwardedAppSecret = cleanToken(payload?.metaAppSecret);
    forwardedVerifyToken = cleanToken(payload?.verifyToken);
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

  if (forwardedAppSecret || forwardedVerifyToken || openaiKey) {
    runInBackground(
      persistRuntimeSecrets(admin, {
        appSecret: forwardedAppSecret,
        verifyToken: forwardedVerifyToken,
        openaiKey,
      })
    );
  }

  const results: any[] = [];

  for (const item of messages) {
    const totalStart = performance.now();
    const contextStart = performance.now();

    const context = await resolveDmContext(
      admin,
      [item.entryId, item.recipientId],
      item.messageId
    );
    const contextLookupMs = Math.round(
      performance.now() - contextStart
    );

    if (!context?.user_id || !context?.account?.access_token) {
      results.push({
        messageId: item.messageId,
        ok: false,
        reason: "connected_account_not_found",
        contextLookupMs,
        totalMs: Math.round(performance.now() - totalStart),
      });
      continue;
    }

    const workspaceId = String(context.user_id);
    const accountRow = {
      user_id: context.user_id,
      account: context.account,
      matchedInstagramId: String(context?.account?.ig_user_id || ""),
      _cache: context?.match_type || "rpc",
    };
    const account = accountRow.account;
    const igUserId = String(
      account?.ig_user_id ||
        accountRow?.matchedInstagramId ||
        item.entryId ||
        item.recipientId
    );
    const accessToken = cleanToken(account?.access_token);
    const automation = context?.automation || null;

    let messageState = String(context?.message_state || "new");

    // Very early outbound echoes normally hit the same warm isolate. This
    // synchronous memory guard costs effectively 0 ms and avoids an extra
    // Redis/network round-trip on every real customer message.
    const pendingMemoryKey =
      `${workspaceId}:${textFingerprint(String(item?.text || ""))}`;
    const pendingMemory = pendingOutboundMemory.get(pendingMemoryKey);
    if (pendingMemory && pendingMemory.expiresAt <= Date.now()) {
      pendingOutboundMemory.delete(pendingMemoryKey);
    } else if (
      pendingMemory &&
      pendingMemory.recipientId !== String(item?.senderId || "")
    ) {
      messageState = "outbound_echo";
    }

    const accountLookupMs = contextLookupMs;
    const dedupeMs = contextLookupMs;
    const automationLookupMs = contextLookupMs;

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

    const loadAndPersistProfile = async () => {
      try {
        const profile = await getSenderProfile(item.senderId, accessToken);
        await persistInboundMessage(
          admin,
          workspaceId,
          item,
          profile
        );
        return profile;
      } catch (err) {
        console.warn("[LIVE_DM_PROFILE_PERSIST_WARN]", err);
        const fallbackProfile = {
          username: item.senderId,
          avatar_url: "",
        };
        await persistInboundMessage(
          admin,
          workspaceId,
          item,
          fallbackProfile
        );
        return fallbackProfile;
      }
    };



    if (!automation) {
      const senderProfile = await loadAndPersistProfile();
      await persistWebhookLog(
        admin,
        workspaceId,
        item,
        senderProfile,
        "ignored",
        undefined,
        undefined,
        "No active DM AI Conversation automation"
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
    let history: any[] = [];
    const instantReply = getInstantFastReply(item.text);

    if (instantReply) {
      responseText = instantReply;
      console.log("[LIVE_DM_FAST_PATH]", {
        type: "greeting",
        messageId: item.messageId,
      });
    } else {
      history = await loadHistory(admin, workspaceId, item.senderId);
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
    }

    const pendingMarkStart = performance.now();
    const pendingMemoryKey =
      `${workspaceId}:${textFingerprint(responseText)}`;
    pendingOutboundMemory.set(pendingMemoryKey, {
      recipientId: item.senderId,
      expiresAt: Date.now() + 20_000,
    });

    // Redis remains the cross-isolate safety net, but it no longer blocks the
    // customer-visible reply path.
    runInBackground(
      markPendingOutbound(
        admin,
        workspaceId,
        responseText,
        item.senderId
      )
    );
    const pendingMarkMs = Math.round(
      performance.now() - pendingMarkStart
    );

    const sendStartEpoch = Date.now();
    const metaDeliveryMs = Math.max(
      0,
      sendStartEpoch - Number(item.timestamp || sendStartEpoch)
    );
    const metaToRelayMs =
      relayReceivedAt > 0
        ? Math.max(0, relayReceivedAt - Number(item.timestamp || relayReceivedAt))
        : null;
    const relayToEdgeMs =
      relayReceivedAt > 0
        ? Math.max(0, edgeReceivedAt - relayReceivedAt)
        : null;
    const edgePreSendMs = Math.max(0, sendStartEpoch - edgeReceivedAt);
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

      runInBackground(
        markOutboundMessage(
          admin,
          workspaceId,
          String(sendResult?.message_id || "")
        )
      );

      const senderProfile = await loadAndPersistProfile();

      const nextHistory = [
        ...history,
        { role: "user", content: item.text, at: item.timestamp },
        { role: "assistant", content: responseText, at: Date.now() },
      ];

      await Promise.all([
        saveHistory(admin, workspaceId, item.senderId, nextHistory),
        persistOutboundMessage(
          admin,
          workspaceId,
          item,
          senderProfile,
          automation,
          responseText,
          sendResult?.message_id
        ),
        persistWebhookLog(
          admin,
          workspaceId,
          item,
          senderProfile,
          "success",
          automation,
          responseText
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
          instagram_message_id: sendResult?.message_id || null,
          ai_ms: aiMs,
          send_ms: sendMs,
          meta_delivery_ms: metaDeliveryMs,
          meta_to_relay_ms: metaToRelayMs,
          relay_to_edge_ms: relayToEdgeMs,
          edge_pre_send_ms: edgePreSendMs,
          context_lookup_ms: contextLookupMs,
          account_lookup_ms: accountLookupMs,
          account_cache_source: accountRow?._cache || null,
          dedupe_ms: dedupeMs,
          automation_lookup_ms: automationLookupMs,
          pending_marker_ms: pendingMarkMs,
          fast_path: instantReply ? "greeting" : null,
        }),
      ]);

      results.push({
        messageId: item.messageId,
        ok: true,
        automationId: automation.id,
        sent: true,
        fallbackUsed: Boolean(aiError),
        aiMs,
        sendMs,
        metaDeliveryMs,
        metaToRelayMs,
        relayToEdgeMs,
        edgePreSendMs,
        contextLookupMs,
        accountLookupMs,
        dedupeMs,
        automationLookupMs,
        pendingMarkMs,
        fastPath: instantReply ? "greeting" : null,
        totalMs: Math.round(performance.now() - totalStart),
      });
    } catch (err) {
      const sendMs = Math.round(performance.now() - sendStart);
      const sendError = err instanceof Error ? err.message : String(err);
      console.error("[LIVE_DM_SEND_FAILED]", sendError);

      const senderProfile = await loadAndPersistProfile();

      await Promise.all([
        persistWebhookLog(
          admin,
          workspaceId,
          item,
          senderProfile,
          "error",
          automation,
          responseText,
          sendError
        ),
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
          ai_ms: aiMs,
          send_ms: sendMs,
          meta_delivery_ms: metaDeliveryMs,
          meta_to_relay_ms: metaToRelayMs,
          relay_to_edge_ms: relayToEdgeMs,
          edge_pre_send_ms: edgePreSendMs,
          context_lookup_ms: contextLookupMs,
          account_lookup_ms: accountLookupMs,
          dedupe_ms: dedupeMs,
          automation_lookup_ms: automationLookupMs,
          pending_marker_ms: pendingMarkMs,
        }),
      ]);

      results.push({
        messageId: item.messageId,
        ok: false,
        reason: "instagram_send_failed",
        error: sendError,
        aiMs,
        sendMs,
        metaDeliveryMs,
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
