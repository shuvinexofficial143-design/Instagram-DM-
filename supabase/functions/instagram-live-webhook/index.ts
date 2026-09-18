import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };
const GRAPH_VERSION = "v25.0";

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

  // Webhook payloads may place the connected Instagram professional account id
  // in entry.id while recipient.id can be a different scoped identifier.
  // Try every candidate instead of assuming recipient.id is always the account.
  for (const igUserId of candidates) {
    const { data, error } = await admin
      .from("autoreply_instagram_tokens")
      .select("user_id,account")
      .contains("account", { ig_user_id: igUserId })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[LIVE_DM_ACCOUNT_LOOKUP_FAILED]", igUserId, error);
    }

    if (data?.user_id && data?.account?.access_token) {
      return { ...data, matchedInstagramId: igUserId };
    }
  }

  // Fallback for older rows / JSON containment differences.
  const { data: rows, error: rowsError } = await admin
    .from("autoreply_instagram_tokens")
    .select("user_id,account")
    .limit(100);

  if (rowsError) {
    console.error("[LIVE_DM_ACCOUNT_SCAN_FAILED]", rowsError);
    return null;
  }

  const matched = (rows || []).find((row: any) =>
    candidates.includes(String(row?.account?.ig_user_id || ""))
  );

  if (matched) {
    return {
      ...matched,
      matchedInstagramId: String(matched?.account?.ig_user_id || ""),
    };
  }

  // If this project has exactly one connected Instagram account, use it as a
  // safe compatibility fallback. Some Instagram webhook variants expose a
  // scoped recipient id that differs from the id returned by /me.
  const usableRows = (rows || []).filter(
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
    connectedAccounts: (rows || []).map((row: any) => ({
      user_id: row?.user_id || null,
      ig_user_id: row?.account?.ig_user_id || null,
      username: row?.account?.username || null,
    })),
  });

  return null;
}

async function loadActiveDmAiAutomation(admin: any, workspaceId: string) {
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

  if (!active.length) return null;

  // Self-heal: only the newest DM AI Conversation is allowed to stay active.
  if (active.length > 1) {
    for (const stale of active.slice(1)) {
      const paused = {
        ...stale,
        status: "paused",
        updated_at: new Date().toISOString(),
      };
      delete paused._updated_at;

      await admin
        .from("autoreply_documents")
        .update({ data: paused })
        .eq("user_id", workspaceId)
        .eq("collection", "automations")
        .eq("id", stale.id);
    }
  }

  return active[0];
}

async function isKnownOutboundMessage(
  admin: any,
  workspaceId: string,
  messageId: string
) {
  if (!messageId) return false;

  // First check Inbox by exact Meta message id. Outbound replies are saved using
  // the Send API message_id, and Meta can later echo that same message back
  // without setting message.is_echo=true.
  const { data: inboxRow } = await admin
    .from("autoreply_documents")
    .select("data")
    .eq("user_id", workspaceId)
    .eq("collection", "inbox_messages")
    .eq("id", messageId)
    .maybeSingle();

  if (inboxRow?.data?.direction === "out") {
    return true;
  }

  // Compatibility check: successful inbound event logs also store the outbound
  // Instagram message id in data.instagram_message_id.
  const { data: sentEvents, error } = await admin
    .from("autoreply_documents")
    .select("id,data")
    .eq("user_id", workspaceId)
    .eq("collection", "webhook_events")
    .contains("data", { instagram_message_id: messageId })
    .limit(1);

  if (error) {
    console.warn("[LIVE_DM_OUTBOUND_ECHO_LOOKUP_WARN]", error);
    return false;
  }

  return Boolean(sentEvents?.length);
}

async function alreadyProcessed(
  admin: any,
  workspaceId: string,
  messageId: string
) {
  if (!messageId) return false;

  const { data } = await admin
    .from("autoreply_documents")
    .select("id,data")
    .eq("user_id", workspaceId)
    .eq("collection", "webhook_events")
    .eq("id", messageId)
    .maybeSingle();

  return Boolean(data?.data?.status === "sent");
}

async function loadHistory(admin: any, workspaceId: string, senderId: string) {
  const { data } = await admin
    .from("autoreply_documents")
    .select("data")
    .eq("user_id", workspaceId)
    .eq("collection", "dm_history")
    .eq("id", senderId)
    .maybeSingle();

  return Array.isArray(data?.data?.messages)
    ? data.data.messages.slice(-10)
    : [];
}

async function saveHistory(
  admin: any,
  workspaceId: string,
  senderId: string,
  history: any[]
) {
  await admin
    .from("autoreply_documents")
    .upsert(
      {
        user_id: workspaceId,
        collection: "dm_history",
        id: senderId,
        data: { messages: history.slice(-12), updated_at: new Date().toISOString() },
      },
      { onConflict: "user_id,collection,id" }
    );
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
    fields: "id,username,name,profile_picture_url",
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
      avatar_url: String(payload?.profile_picture_url || ""),
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
        temperature: 0.45,
        max_tokens: 180,
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
  if (req.method !== "POST") {
    return reply(405, { ok: false, error: "Method Not Allowed" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { ok: false, error: "Invalid JSON" });
  }

  const openaiKey = cleanToken(payload?.openaiKey);
  const event = payload?.event;

  // The Vercel webhook sends the OpenAI key server-to-server when configured.
  // If it is missing or rejected, we still send the automation fallback message
  // instead of leaving the Instagram customer without any response.
  const messages = extractDirectMessages(event);
  if (!messages.length) {
    return reply(200, { ok: true, processed: 0, reason: "no_text_dm_events" });
  }

  const admin = getAdminClient();
  const results: any[] = [];

  for (const item of messages) {
    const accountRow = await findWorkspaceByInstagramIds(admin, [
      item.entryId,
      item.recipientId,
    ]);

    if (!accountRow?.user_id || !accountRow?.account?.access_token) {
      results.push({
        messageId: item.messageId,
        ok: false,
        reason: "connected_account_not_found",
      });
      continue;
    }

    const workspaceId = String(accountRow.user_id);
    const account = accountRow.account;
    const igUserId = String(
      account?.ig_user_id ||
        accountRow?.matchedInstagramId ||
        item.entryId ||
        item.recipientId
    );
    const accessToken = cleanToken(account?.access_token);

    // Instagram may echo our own Send API reply back as a new webhook without
    // message.is_echo=true. Detect it by the exact outbound Meta message id
    // BEFORE writing Inbox/Contacts, otherwise our own reply becomes a fake
    // customer message and can trigger an AI reply loop.
    if (await isKnownOutboundMessage(admin, workspaceId, item.messageId)) {
      console.log("[LIVE_DM_OUTBOUND_ECHO_IGNORED]", {
        messageId: item.messageId,
        senderId: item.senderId,
      });
      results.push({
        messageId: item.messageId,
        ok: true,
        ignored: true,
        reason: "outbound_echo",
      });
      continue;
    }

    const senderProfile = await getSenderProfile(item.senderId, accessToken);

    // Store every real customer DM/contact before automation matching so Inbox
    // and Contacts stay accurate even if AI generation or reply sending fails.
    await persistInboundMessage(
      admin,
      workspaceId,
      item,
      senderProfile
    );

    if (await alreadyProcessed(admin, workspaceId, item.messageId)) {
      results.push({ messageId: item.messageId, ok: true, duplicate: true });
      continue;
    }

    const automation = await loadActiveDmAiAutomation(admin, workspaceId);
    if (!automation) {
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
    const model =
      String(aiAction?.ai_model || "gpt-4o-mini") === "gpt-4o-mini"
        ? "gpt-4o-mini"
        : "gpt-4o-mini";

    const history = await loadHistory(admin, workspaceId, item.senderId);

    let responseText = "";
    let aiError = "";

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

    try {
      const sendResult = await sendInstagramText(
        igUserId,
        item.senderId,
        accessToken,
        responseText
      );

      const nextHistory = [
        ...history,
        { role: "user", content: item.text, at: item.timestamp },
        { role: "assistant", content: responseText, at: Date.now() },
      ];

      await saveHistory(admin, workspaceId, item.senderId, nextHistory);
      await persistOutboundMessage(
        admin,
        workspaceId,
        item,
        senderProfile,
        automation,
        responseText,
        sendResult?.message_id
      );
      await persistWebhookLog(
        admin,
        workspaceId,
        item,
        senderProfile,
        "success",
        automation,
        responseText
      );
      await updateAutomationStats(admin, workspaceId, automation);

      await logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
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
      });

      results.push({
        messageId: item.messageId,
        ok: true,
        automationId: automation.id,
        sent: true,
        fallbackUsed: Boolean(aiError),
      });
    } catch (err) {
      const sendError = err instanceof Error ? err.message : String(err);
      console.error("[LIVE_DM_SEND_FAILED]", sendError);

      await persistWebhookLog(
        admin,
        workspaceId,
        item,
        senderProfile,
        "error",
        automation,
        responseText,
        sendError
      );

      await logEvent(admin, workspaceId, item.messageId || crypto.randomUUID(), {
        status: "failed",
        trigger_type: "dm_ai_conversation",
        automation_id: automation.id,
        automation_name: automation.name,
        sender_id: item.senderId,
        recipient_id: igUserId,
        incoming_text: item.text,
        ai_error: aiError || null,
        send_error: sendError,
      });

      results.push({
        messageId: item.messageId,
        ok: false,
        reason: "instagram_send_failed",
        error: sendError,
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
