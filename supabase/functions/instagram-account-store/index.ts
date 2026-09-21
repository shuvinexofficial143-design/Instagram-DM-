import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && (
    /^guest_[a-f0-9-]{16,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
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

function safeAccount(account: any) {
  if (!account) return null;
  const { access_token: _token, ...safe } = account;
  return safe;
}

async function readInstagramProfile(accessToken: string) {
  const params = new URLSearchParams({
    fields: "id,username,name,profile_picture_url,followers_count",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/v21.0/me?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const body = await response.text();
  if (!response.ok) {
    console.error("[IG_STORE_META_VERIFY_FAILED]", response.status, body);
    throw new Error("Instagram access token could not be verified");
  }

  let profile: any = {};
  try {
    profile = JSON.parse(body);
  } catch {
    throw new Error("Instagram profile response was invalid");
  }

  if (!profile?.id || !profile?.username) {
    throw new Error("Instagram professional account details are incomplete");
  }

  return profile;
}

async function ensureWebhookSubscription(accessToken: string, igUserId: string) {
  const fields = "messages,messaging_postbacks,message_deliveries,message_reads,comments,mentions";
  const targets = [
    `https://graph.instagram.com/v25.0/${encodeURIComponent(igUserId)}/subscribed_apps`,
    "https://graph.instagram.com/v25.0/me/subscribed_apps",
  ];

  let lastError = "";
  for (const endpoint of targets) {
    const params = new URLSearchParams({
      subscribed_fields: fields,
      access_token: accessToken,
    });
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body: any = await response.json().catch(() => null);
      if (response.ok && (body?.success === true || body?.data)) {
        console.log("[IG_WEBHOOK_SUBSCRIPTION_OK]", { igUserId });
        return true;
      }
      lastError = String(body?.error?.message || `HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  console.warn("[IG_WEBHOOK_SUBSCRIPTION_WARN]", { igUserId, error: lastError });
  return false;
}

function normalizeMediaItem(item: any, forcedKind?: "STORY") {
  const mediaProductType = String(item?.media_product_type || "").toUpperCase();
  const permalink = String(item?.permalink || "");
  const rawType = String(item?.media_type || "").toUpperCase();

  let contentType = rawType || "UNKNOWN";
  if (forcedKind === "STORY") {
    contentType = "STORY";
  } else if (mediaProductType === "REELS" || permalink.includes("/reel/")) {
    contentType = "REEL";
  } else if (rawType === "CAROUSEL_ALBUM") {
    contentType = "POST";
  } else if (rawType === "IMAGE" || rawType === "VIDEO") {
    contentType = "POST";
  }

  return {
    id: String(item?.id || ""),
    media_type: rawType,
    media_product_type: mediaProductType,
    content_type: contentType,
    caption: String(item?.caption || ""),
    media_url: String(item?.media_url || ""),
    thumbnail_url: String(item?.thumbnail_url || item?.media_url || ""),
    permalink,
    timestamp: String(item?.timestamp || ""),
  };
}

async function fetchInstagramMedia(accessToken: string, kind: "comment" | "story") {
  const endpoint = kind === "story" ? "stories" : "media";
  const fields =
    kind === "story"
      ? "id,media_type,media_url,thumbnail_url,permalink,timestamp"
      : "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";

  const params = new URLSearchParams({
    fields,
    access_token: accessToken,
    limit: "50",
  });

  const response = await fetch(
    `https://graph.instagram.com/v21.0/me/${endpoint}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const body = await response.text();
  if (!response.ok) {
    console.error("[IG_STORE_MEDIA_FETCH_FAILED]", kind, response.status, body);
    throw new Error(
      kind === "story"
        ? "Active Instagram stories could not be loaded"
        : "Instagram posts and reels could not be loaded"
    );
  }

  let payload: any = {};
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Instagram media response was invalid");
  }

  const items = Array.isArray(payload?.data) ? payload.data : [];
  return items
    .map((item: any) => normalizeMediaItem(item, kind === "story" ? "STORY" : undefined))
    .filter((item: any) => item.id);
}

function looksLikeNumericId(value: unknown) {
  return /^\d{8,}$/.test(String(value || "").trim());
}

async function fetchMessagingUserProfile(accessToken: string, igsid: string) {
  const params = new URLSearchParams({
    fields: "id,name,username,profile_pic,follower_count",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/v25.0/${encodeURIComponent(igsid)}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    console.warn(
      "[IG_CONTACT_PROFILE_WARN]",
      igsid,
      response.status,
      payload?.error?.message || payload
    );
    return null;
  }

  return {
    id: String(payload?.id || igsid),
    username: String(payload?.username || payload?.name || "").trim(),
    name: String(payload?.name || "").trim(),
    profile_pic: String(payload?.profile_pic || "").trim(),
    follower_count: Number(payload?.follower_count || 0),
  };
}

async function refreshMissingContactProfiles(
  admin: any,
  workspaceId: string,
  accessToken: string
) {
  const { data: contacts, error: contactsError } = await admin
    .from("autoreply_documents")
    .select("id,data")
    .eq("user_id", workspaceId)
    .eq("collection", "contacts")
    .limit(100);

  if (contactsError) {
    console.error("[IG_CONTACT_REFRESH_LIST_FAILED]", contactsError);
    throw new Error("Contacts could not be loaded");
  }

  const targets = (contacts || []).filter((row: any) => {
    const data = row?.data || {};
    return (
      looksLikeNumericId(data?.ig_username) ||
      !String(data?.ig_username || "").trim() ||
      !String(data?.avatar_url || "").trim()
    );
  });

  let refreshed = 0;

  // Small batches avoid hammering Meta while still fixing the UI quickly.
  for (let offset = 0; offset < targets.length; offset += 5) {
    const batch = targets.slice(offset, offset + 5);

    await Promise.all(
      batch.map(async (row: any) => {
        const igsid = String(row?.data?.ig_user_id || row?.id || "").trim();
        if (!igsid) return;

        const profile = await fetchMessagingUserProfile(accessToken, igsid);
        if (!profile?.username && !profile?.profile_pic) return;

        const nextContact = {
          ...(row?.data || {}),
          id: igsid,
          ig_user_id: igsid,
          ig_username: profile.username || row?.data?.ig_username || igsid,
          avatar_url: profile.profile_pic || row?.data?.avatar_url || "",
          full_name: profile.name || row?.data?.full_name || "",
          follower_count:
            profile.follower_count || Number(row?.data?.follower_count || 0),
        };

        const { error: contactUpdateError } = await admin
          .from("autoreply_documents")
          .update({ data: nextContact })
          .eq("user_id", workspaceId)
          .eq("collection", "contacts")
          .eq("id", row.id);

        if (contactUpdateError) {
          console.warn(
            "[IG_CONTACT_REFRESH_UPDATE_FAILED]",
            igsid,
            contactUpdateError
          );
          return;
        }

        const { data: messageRows, error: messageListError } = await admin
          .from("autoreply_documents")
          .select("id,data")
          .eq("user_id", workspaceId)
          .eq("collection", "inbox_messages")
          .contains("data", { from_ig_id: igsid });

        if (!messageListError && messageRows?.length) {
          await Promise.all(
            messageRows.map(async (msg: any) => {
              const nextMessage = {
                ...(msg?.data || {}),
                from_username:
                  profile.username || msg?.data?.from_username || igsid,
                from_avatar:
                  profile.profile_pic || msg?.data?.from_avatar || "",
              };

              await admin
                .from("autoreply_documents")
                .update({ data: nextMessage })
                .eq("user_id", workspaceId)
                .eq("collection", "inbox_messages")
                .eq("id", msg.id);
            })
          );
        }

        refreshed += 1;
      })
    );
  }

  return refreshed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: jsonHeaders });

  if (req.method === "GET") {
    try {
      const admin = getAdminClient();
      const { error, count } = await admin
        .from("autoreply_instagram_tokens")
        .select("user_id", { head: true, count: "exact" });

      if (error) {
        console.error("[IG_STORE_HEALTH_DB_FAILED]", error);
        return reply(500, {
          ok: false,
          adminCredentials: true,
          database: false,
          error: error.message,
        });
      }

      return reply(200, {
        ok: true,
        adminCredentials: true,
        database: true,
        storedAccounts: count ?? 0,
      });
    } catch (err) {
      console.error("[IG_STORE_HEALTH_FATAL]", err);
      return reply(500, {
        ok: false,
        adminCredentials: false,
        database: false,
        error: err instanceof Error ? err.message : "Health check failed",
      });
    }
  }

  if (req.method !== "POST") {
    return reply(405, { ok: false, error: "Method Not Allowed" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { ok: false, error: "Invalid JSON" });
  }

  const action = String(payload?.action || "");
  const workspaceId = payload?.workspaceId;

  // Admin V2: return only aggregate/platform-safe data after verifying the
  // caller's real Supabase session. Never return Instagram access tokens.
  if (action === "admin_overview") {
    const authHeader = String(req.headers.get("authorization") || "");
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return reply(401, { ok: false, error: "Authentication required" });

    const admin = getAdminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const email = String(authData?.user?.email || "").trim().toLowerCase();
    const configuredAdmins = String(Deno.env.get("ADMIN_EMAILS") || "")
      .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const allowed = new Set(["devsinghparmar9589@gmail.com", ...configuredAdmins]);
    if (authError || !authData?.user || !allowed.has(email)) {
      return reply(403, { ok: false, error: "Administrator access required" });
    }

    const [profilesRes, accountsRes, automationsRes, usageRes, plansRes, auditRes, dmHistoryRes, claimsRes, documentsRes, runtimeRes] = await Promise.all([
      admin.from("autoreply_profiles").select("user_id,email,display_name,avatar_url,role,last_login_at,last_active_at,created_at,updated_at").order("created_at", { ascending: false }),
      admin.from("autoreply_instagram_tokens").select("user_id,account,created_at,updated_at"),
      admin.from("autoreply_active_automations").select("user_id,automation_id,data,updated_at"),
      admin.from("autoreply_usage_monthly").select("user_id,month_key,total_messages,ai_replies,updated_at"),
      admin.from("autoreply_plans").select("id,name,price_inr,total_messages,ai_replies,instagram_accounts,automations_limit,billing_days,is_active,sort_order,updated_at").order("sort_order"),
      admin.from("autoreply_admin_audit_logs").select("id,admin_email,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("autoreply_dm_history").select("user_id,sender_id,messages,updated_at").order("updated_at", { ascending: false }).limit(250),
      admin.from("autoreply_message_claims").select("user_id,message_id,direction,status,created_at,expires_at").order("created_at", { ascending: false }).limit(500),
      admin.from("autoreply_documents").select("user_id,collection,id,created_at,updated_at").order("updated_at", { ascending: false }).limit(500),
      admin.from("autoreply_runtime_context").select("ig_user_id,user_id,automation_id,automation,updated_at").order("updated_at", { ascending: false }).limit(100),
    ]);
    const firstError = profilesRes.error || accountsRes.error || automationsRes.error || usageRes.error || plansRes.error || auditRes.error || dmHistoryRes.error || claimsRes.error || documentsRes.error || runtimeRes.error;
    if (firstError) throw firstError;

    const accounts = (accountsRes.data || []).map((row: any) => ({
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      account: safeAccount(row.account),
    }));
    return reply(200, {
      ok: true,
      profiles: profilesRes.data || [],
      instagramAccounts: accounts,
      activeAutomations: automationsRes.data || [],
      usageMonthly: usageRes.data || [],
      plans: plansRes.data || [],
      auditLogs: auditRes.data || [],
      dmHistory: dmHistoryRes.data || [],
      messageClaims: claimsRes.data || [],
      documents: documentsRes.data || [],
      runtimeContexts: (runtimeRes.data || []).map((row: any) => ({ ...row, automation: row.automation ? { id: row.automation.id, name: row.automation.name, status: row.automation.status, trigger_type: row.automation.trigger_type } : null })),
    });
  }

  if (action === "admin_update_plan") {
    const authHeader = String(req.headers.get("authorization") || "");
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return reply(401, { ok: false, error: "Authentication required" });
    const admin = getAdminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const email = String(authData?.user?.email || "").trim().toLowerCase();
    const configuredAdmins = String(Deno.env.get("ADMIN_EMAILS") || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    const allowed = new Set(["devsinghparmar9589@gmail.com", ...configuredAdmins]);
    if (authError || !authData?.user || !allowed.has(email)) return reply(403, { ok: false, error: "Administrator access required" });

    const plan = payload?.plan || {};
    const id = String(plan.id || "").trim();
    if (!id) return reply(400, { ok: false, error: "Plan ID required" });
    const { data: before } = await admin.from("autoreply_plans").select("*").eq("id", id).maybeSingle();
    const update = {
      name: String(plan.name || before?.name || id),
      price_inr: Math.max(0, Number(plan.price_inr) || 0),
      total_messages: Math.max(0, Number(plan.total_messages) || 0),
      ai_replies: Math.max(0, Number(plan.ai_replies) || 0),
      instagram_accounts: Math.max(0, Number(plan.instagram_accounts) || 0),
      automations_limit: plan.automations_limit === null || plan.automations_limit === "" ? null : Math.max(0, Number(plan.automations_limit) || 0),
      billing_days: Math.max(1, Number(plan.billing_days) || 30),
      is_active: Boolean(plan.is_active),
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = await admin.from("autoreply_plans").update(update).eq("id", id).select().single();
    if (saveError) throw saveError;
    await admin.from("autoreply_admin_audit_logs").insert({ admin_user_id: authData.user.id, admin_email: email, action: "update_plan", entity_type: "plan", entity_id: id, before_data: before, after_data: saved });
    return reply(200, { ok: true, plan: saved });
  }

  if (!isWorkspaceId(workspaceId)) {
    return reply(400, { ok: false, error: "Invalid workspace" });
  }

  const admin = getAdminClient();

  try {
    if (action === "refresh_contact_profiles") {
      const { data, error } = await admin
        .from("autoreply_instagram_tokens")
        .select("account")
        .eq("user_id", workspaceId)
        .maybeSingle();

      if (error) {
        console.error("[IG_CONTACT_REFRESH_ACCOUNT_FAILED]", error);
        return reply(500, { ok: false, error: "Instagram account could not be loaded" });
      }

      const account: any = data?.account || null;
      const accessToken = String(account?.access_token || "").trim();
      if (!accessToken) {
        return reply(404, { ok: false, error: "No connected Instagram account found" });
      }

      const refreshed = await refreshMissingContactProfiles(
        admin,
        workspaceId,
        accessToken
      );

      return reply(200, { ok: true, refreshed });
    }

    if (action === "list_workspace_data") {
      const collections = [
        "automations",
        "contacts",
        "inbox_messages",
      ];

      const { data, error } = await admin
        .from("autoreply_documents")
        .select("collection,id,data,created_at,updated_at")
        .eq("user_id", workspaceId)
        .in("collection", collections)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[WORKSPACE_DATA_LIST_FAILED]", error);
        return reply(500, { ok: false, error: "Workspace data could not be loaded" });
      }

      const result: Record<string, any[]> = {
        automations: [],
        contacts: [],
        inbox_messages: [],
      };

      for (const row of data || []) {
        const collection = String(row?.collection || "");
        if (!Array.isArray(result[collection])) continue;
        result[collection].push({
          id: String(row?.id || ""),
          ...(row?.data || {}),
          created_at: row?.data?.created_at || row?.created_at || undefined,
          updated_at: row?.data?.updated_at || row?.updated_at || undefined,
        });
      }

      return reply(200, {
        ok: true,
        automations: result.automations,
        contacts: result.contacts,
        inboxMessages: result.inbox_messages,
      });
    }

    if (action === "list_automations") {
      const { data, error } = await admin
        .from("autoreply_documents")
        .select("id,data,created_at,updated_at")
        .eq("user_id", workspaceId)
        .eq("collection", "automations")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("[AUTOMATION_LIST_FAILED]", error);
        return reply(500, { ok: false, error: "Automations could not be loaded" });
      }

      const automations = (data || []).map((row: any) => ({
        id: String(row?.id || ""),
        ...(row?.data || {}),
        created_at: row?.data?.created_at || row?.created_at || new Date().toISOString(),
        updated_at: row?.data?.updated_at || row?.updated_at || new Date().toISOString(),
      }));

      return reply(200, { ok: true, automations });
    }

    if (action === "save_automation") {
      const automation = payload?.automation;
      const id = String(automation?.id || "").trim();
      const normalizedName = String(automation?.name || "").trim();
      const normalizedNameLower = normalizedName.toLocaleLowerCase();

      if (!id || !/^auto_[a-zA-Z0-9_-]{4,}$/.test(id)) {
        return reply(400, { ok: false, error: "Invalid automation id" });
      }

      if (!normalizedName || !automation?.trigger_type || !Array.isArray(automation?.actions)) {
        return reply(400, { ok: false, error: "Automation data is incomplete" });
      }

      const serialized = JSON.stringify(automation);
      if (serialized.length > 100000) {
        return reply(413, { ok: false, error: "Automation is too large" });
      }

      const { data: existingRows, error: existingError } = await admin
        .from("autoreply_documents")
        .select("id,data,updated_at")
        .eq("user_id", workspaceId)
        .eq("collection", "automations");

      if (existingError) {
        console.error("[AUTOMATION_VALIDATION_LOAD_FAILED]", existingError);
        return reply(500, { ok: false, error: "Automation validation failed" });
      }

      const duplicateName = (existingRows || []).find((row: any) => {
        if (String(row?.id || "") === id) return false;
        return String(row?.data?.name || "").trim().toLocaleLowerCase() === normalizedNameLower;
      });

      if (duplicateName) {
        return reply(409, {
          ok: false,
          code: "AUTOMATION_NAME_EXISTS",
          error: "Another automation already uses this name. Choose a different name.",
        });
      }

      const pausedAutomationIds: string[] = [];

      // Only one live DM AI Conversation is allowed per workspace.
      if (
        automation?.trigger_type === "dm_ai_conversation" &&
        automation?.status === "active"
      ) {
        for (const row of existingRows || []) {
          const rowId = String(row?.id || "");
          const rowData = row?.data || {};

          if (
            rowId !== id &&
            rowData?.trigger_type === "dm_ai_conversation" &&
            rowData?.status === "active"
          ) {
            const pausedData = {
              ...rowData,
              status: "paused",
              updated_at: new Date().toISOString(),
            };

            const { error: pauseError } = await admin
              .from("autoreply_documents")
              .update({ data: pausedData })
              .eq("user_id", workspaceId)
              .eq("collection", "automations")
              .eq("id", rowId);

            if (pauseError) {
              console.error("[AUTOMATION_AUTO_PAUSE_FAILED]", rowId, pauseError);
              return reply(500, {
                ok: false,
                error: "Could not pause the previous DM AI Conversation automation.",
              });
            }

            pausedAutomationIds.push(rowId);
          }
        }
      }

      const { id: _id, ...automationDataRaw } = automation;
      const automationData = {
        ...automationDataRaw,
        name: normalizedName,
        updated_at: automation?.updated_at || new Date().toISOString(),
      };

      const { error } = await admin
        .from("autoreply_documents")
        .upsert(
          {
            user_id: workspaceId,
            collection: "automations",
            id,
            data: automationData,
          },
          { onConflict: "user_id,collection,id" }
        );

      if (error) {
        console.error("[AUTOMATION_SAVE_FAILED]", error);
        return reply(500, {
          ok: false,
          error: "Automation could not be saved",
          detail: error.message,
        });
      }

      return reply(200, {
        ok: true,
        automation: { id, ...automationData },
        pausedAutomationIds,
      });
    }

    if (action === "delete_automation") {
      const id = String(payload?.automationId || "").trim();
      if (!id) {
        return reply(400, { ok: false, error: "Automation id is required" });
      }

      const { error } = await admin
        .from("autoreply_documents")
        .delete()
        .eq("user_id", workspaceId)
        .eq("collection", "automations")
        .eq("id", id);

      if (error) {
        console.error("[AUTOMATION_DELETE_FAILED]", error);
        return reply(500, { ok: false, error: "Automation could not be deleted" });
      }

      return reply(200, { ok: true, automationId: id });
    }

    if (action === "list_media") {
      const { data, error } = await admin
        .from("autoreply_instagram_tokens")
        .select("account")
        .eq("user_id", workspaceId)
        .maybeSingle();

      if (error) {
        console.error("[IG_STORE_MEDIA_ACCOUNT_LOAD_FAILED]", error);
        return reply(500, { ok: false, error: "Instagram account could not be loaded" });
      }

      const account: any = data?.account || null;
      const accessToken = String(account?.access_token || "").trim();
      if (!accessToken) {
        return reply(404, { ok: false, error: "No connected Instagram account found" });
      }

      const requestedKind = String(payload?.kind || "comment");
      const kind: "comment" | "story" = requestedKind === "story" ? "story" : "comment";

      // Self-heal Meta webhook delivery whenever the authenticated dashboard
      // loads Instagram media. This does not sit in the incoming-DM reply path.
      const igUserId = String(account?.ig_user_id || "").trim();
      if (igUserId) {
        await ensureWebhookSubscription(accessToken, igUserId);
      }

      const items = await fetchInstagramMedia(accessToken, kind);

      return reply(200, {
        ok: true,
        kind,
        username: String(account?.username || ""),
        items,
      });
    }

    if (action === "save") {
      const accessToken = String(payload?.accessToken || "").trim();
      if (!accessToken) {
        return reply(400, { ok: false, error: "Instagram access token is missing" });
      }

      const me = await readInstagramProfile(accessToken);
      const now = new Date();
      const account = {
        id: "primary",
        ig_user_id: String(me.id),
        username: String(me.username).trim(),
        profile_pic_url:
          String(me?.profile_picture_url || "").trim() ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(String(me.username))}`,
        followers_count: Number(me?.followers_count || 0),
        access_token: accessToken,
        token_expires_at: new Date(
          now.getTime() + 60 * 24 * 60 * 60 * 1000
        ).toISOString(),
        connected_at: now.toISOString(),
        status: "connected",
      };

      const { error: tokenError } = await admin
        .from("autoreply_instagram_tokens")
        .upsert({ user_id: workspaceId, account }, { onConflict: "user_id" });

      if (tokenError) {
        console.error("[IG_STORE_TOKEN_UPSERT_FAILED]", tokenError);
        return reply(500, {
          ok: false,
          error: "Instagram token storage failed",
          detail: tokenError.message,
        });
      }

      const { error: docError } = await admin
        .from("autoreply_documents")
        .upsert(
          {
            user_id: workspaceId,
            collection: "instagram_account",
            id: "primary",
            data: safeAccount(account),
          },
          { onConflict: "user_id,collection,id" }
        );

      if (docError) {
        console.error("[IG_STORE_DOCUMENT_UPSERT_FAILED]", docError);
        return reply(500, {
          ok: false,
          error: "Instagram account storage failed",
          detail: docError.message,
        });
      }

      return reply(200, { ok: true, account: safeAccount(account) });
    }

    if (action === "load") {
      const { data, error } = await admin
        .from("autoreply_instagram_tokens")
        .select("account")
        .eq("user_id", workspaceId)
        .maybeSingle();

      if (error) {
        console.error("[IG_STORE_LOAD_FAILED]", error);
        return reply(500, { ok: false, error: "Instagram account load failed" });
      }

      const account = data?.account || null;
      return reply(200, {
        ok: true,
        account: account?.username ? safeAccount(account) : null,
      });
    }

    if (action === "delete") {
      const [tokenResult, docResult] = await Promise.all([
        admin.from("autoreply_instagram_tokens").delete().eq("user_id", workspaceId),
        admin
          .from("autoreply_documents")
          .delete()
          .eq("user_id", workspaceId)
          .eq("collection", "instagram_account")
          .eq("id", "primary"),
      ]);

      if (tokenResult.error || docResult.error) {
        console.error(
          "[IG_STORE_DELETE_FAILED]",
          tokenResult.error,
          docResult.error
        );
        return reply(500, { ok: false, error: "Instagram account delete failed" });
      }

      return reply(200, { ok: true, account: null });
    }

    return reply(400, { ok: false, error: "Unsupported action" });
  } catch (err) {
    console.error("[IG_STORE_FATAL]", err);
    return reply(500, {
      ok: false,
      error: err instanceof Error ? err.message : "Instagram storage failed",
    });
  }
});
