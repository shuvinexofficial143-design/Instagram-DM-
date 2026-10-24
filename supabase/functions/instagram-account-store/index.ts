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

// Only the server that checked ADMIN_EMAILS can relay administrator actions.
// The signature is bound to the verified session, action and a short expiry.
async function verifyAdminRelay(req: Request, action: string, jwt: string): Promise<boolean> {
  const secret = String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim().replace(/^(["'])(.*)\1$/, "$2");
  const timestamp = String(req.headers.get("x-autoreply-admin-time") || "");
  const signature = String(req.headers.get("x-autoreply-admin-signature") || "");
  if (!secret || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, Uint8Array.from(signature.match(/.{2}/g)!, value=>parseInt(value,16)), encoder.encode(`${action}\n${jwt}\n${timestamp}`));
}

async function readInstagramProfile(accessToken: string) {
  const params = new URLSearchParams({
    fields: "id,user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,account_type",
    access_token: accessToken,
  });

  const response = await fetch(
    `https://graph.instagram.com/v25.0/me?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) }
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
  const fields = "messages,messaging_postbacks,messaging_seen,comments,live_comments,mentions";
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
        signal: AbortSignal.timeout(8000),
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

async function fetchInstagramMedia(accessToken: string, kind: "comment" | "story", igUserId = "me") {
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

  const url = `https://graph.instagram.com/v25.0/${encodeURIComponent(igUserId)}/${endpoint}?${params.toString()}`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000) });
      if (response.status >= 500 && attempt === 0) { await response.body?.cancel(); continue; }
      break;
    } catch (error) {
      if (attempt === 1) throw new Error("Instagram media service could not be reached. Please try again.");
    }
  }
  if (!response) throw new Error("Instagram media service could not be reached");

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
      signal: AbortSignal.timeout(5000),
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
    username: String(payload?.username || "").trim(),
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
      !String(data?.avatar_url || "").trim() ||
      !data?.profile_refreshed_at || Date.now() - Date.parse(data.profile_refreshed_at) > 24 * 60 * 60 * 1000
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
          id: row.id,
          ig_user_id: igsid,
          ig_username: profile.username || row?.data?.ig_username || igsid,
          avatar_url: profile.profile_pic || row?.data?.avatar_url || "",
          profile_refreshed_at: new Date().toISOString(),
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

        const {error: enrichmentError} = await admin.rpc("autoreply_enrich_instagram_contact", {
          p_workspace: workspaceId, p_sender: igsid, p_username: profile.username,
          p_avatar: profile.profile_pic,
        });
        if (enrichmentError) console.warn("[IG_CONTACT_ENRICH_FAILED]", enrichmentError.code);

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
  let workspaceId = payload?.workspaceId;

  let handoffAdmin:any=null;
  if(action === "admin_handoff_reply"){
    const jwt=String(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
    const service=getAdminClient();const {data:identity,error}=await service.auth.getUser(jwt);
    if(error||!identity?.user?.email_confirmed_at||identity.user.is_anonymous||!await verifyAdminRelay(req,action,jwt))return reply(403,{ok:false,error:"Administrator access required"});
    const {data:handoff,error:readError}=await service.from("autoreply_human_handoffs").select("id,workspace_id,sender_id,status").eq("id",String(payload.handoffId||"")).maybeSingle();
    if(readError||!handoff)return reply(404,{ok:false,error:"Handoff not found"});
    if(handoff.status==="resumed")return reply(409,{ok:false,error:"This conversation has already resumed AI. Take over from Inbox before replying manually."});
    workspaceId=handoff.workspace_id;payload.recipientUsername=handoff.sender_id;handoffAdmin=identity.user;
  }

  // Guest workspaces are bearer-cookie capabilities, not Supabase JWT users.
  // Browser clients must go through the Vercel API, which validates the
  // HttpOnly guest cookie and authenticates to this Edge service privately.
  // Otherwise a leaked guest workspace ID could be used directly here.
  if (String(workspaceId || "").startsWith("guest_") && action !== "save" && action !== "admin_handoff_reply") {
    const supplied = String(req.headers.get("x-autoreply-guest-secret") || "");
    const expected = String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim();
    if (!expected || supplied.length !== expected.length) {
      return reply(401, { ok: false, error: "Guest workspace server authorization required" });
    }
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) {
      return reply(401, { ok: false, error: "Guest workspace server authorization required" });
    }
  }

  if (action === "list_accounts") {
    const admin = getAdminClient();
    const jwt = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { data: identity, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !identity?.user) return reply(401, {ok:false,error:"Authentication required"});
    const { data: memberships, error } = await admin.from("autoreply_instagram_memberships")
      .select("workspace_id,profile,created_at").eq("owner_user_id",identity.user.id).eq("connection_archived",false).order("created_at");
    if (error) throw error;
    const ids = (memberships || []).map((row:any)=>row.workspace_id);
    const {data:tokens,error:tokenError} = ids.length ? await admin.from("autoreply_instagram_tokens").select("user_id,account").in("user_id",ids) : {data:[],error:null};
    if (tokenError) throw tokenError;
    return reply(200,{ok:true,accounts:(memberships||[]).flatMap((row:any)=>{
      const token = (tokens||[]).find((item:any)=>item.user_id===row.workspace_id);
      if (!token?.account?.access_token) return [];
      return [{workspaceId:row.workspace_id,account:{...safeAccount(token.account),status:token.account.status || "connected"}}];
    })});
  }
  if (["send_dm","load","delete","list_media","list_workspace_data","list_inbox_page","inbox_analytics","mark_inbox_read","list_automations","set_automation_status","save_automation","delete_automation","refresh_contact_profiles","create_catalog_upload"].includes(action) && (action === "create_catalog_upload" || !String(workspaceId || "").startsWith("guest_"))) {
    const jwt = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const admin = getAdminClient();
    const {data:identity,error:authError} = await admin.auth.getUser(jwt);
    if (authError || !identity?.user) return reply(401,{ok:false,error:"Authentication required"});
    if (workspaceId !== identity.user.id) {
      const {data:membership,error} = await admin.from("autoreply_instagram_memberships").select("workspace_id")
        .eq("workspace_id",workspaceId).eq("owner_user_id",identity.user.id).maybeSingle();
      if (error || !membership) return reply(403,{ok:false,error:"This Instagram account does not belong to your login"});
    }
  }

  // Admin V2: return only aggregate/platform-safe data after verifying the
  // caller's real Supabase session. Never return Instagram access tokens.
  if (action === "admin_overview") {
    const authHeader = String(req.headers.get("authorization") || "");
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return reply(401, { ok: false, error: "Authentication required" });

    const admin = getAdminClient();
    const { data: authData, error: authError } = await admin.auth.getUser(jwt);
    const email = String(authData?.user?.email || "").trim().toLowerCase();
    if (authError || !authData?.user?.email_confirmed_at || authData.user.is_anonymous || !email || !(await verifyAdminRelay(req, action, jwt))) {
      return reply(403, { ok: false, error: "Administrator access required" });
    }

    // Admin totals must not silently stop at PostgREST's 1,000-row default.
    const pagedAdminRows=async (table:string,columns:string,orderColumn:string)=>{
      const rows:any[]=[];
      for(let offset=0;offset<100000;offset+=500){
        const {data,error}=await admin.from(table).select(columns).order(orderColumn,{ascending:true}).range(offset,offset+499);
        if(error)throw error;
        rows.push(...(data||[]));
        if((data||[]).length<500)return {data:rows,error:null};
      }
      throw new Error("Administrator overview exceeds the safe 100,000-record retrieval limit.");
    };
    const [profilesRes, accountsRes, automationsRes, usageRes, plansRes, auditRes, dmHistoryRes, claimsRes, documentsRes, runtimeRes, paymentsRes, contactsRes] = await Promise.all([
      pagedAdminRows("autoreply_profiles","user_id,email,display_name,avatar_url,role,last_login_at,last_active_at,created_at,updated_at","user_id"),
      pagedAdminRows("autoreply_instagram_tokens","user_id,account,created_at,updated_at","user_id"),
      pagedAdminRows("autoreply_active_automations","user_id,automation_id,data,updated_at","automation_id"),
      pagedAdminRows("autoreply_usage_monthly","user_id,month_key,total_messages,ai_replies,updated_at","user_id"),
      admin.from("autoreply_plans").select("id,name,price_inr,total_messages,ai_replies,instagram_accounts,automations_limit,billing_days,is_active,sort_order,updated_at").order("sort_order"),
      admin.from("autoreply_admin_audit_logs").select("id,admin_email,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("autoreply_dm_history").select("user_id,sender_id,messages,updated_at").order("updated_at", { ascending: false }).limit(250),
      admin.from("autoreply_message_claims").select("user_id,message_id,direction,status,created_at,expires_at").order("created_at", { ascending: false }).limit(500),
      admin.from("autoreply_documents").select("user_id,collection,id,created_at,updated_at").order("updated_at", { ascending: false }).limit(500),
      admin.from("autoreply_runtime_context").select("ig_user_id,user_id,automation_id,automation,updated_at").order("updated_at", { ascending: false }).limit(100),
      admin.from("autoreply_billing_orders").select("order_id,owner_user_id,plan_id,amount_inr,currency,environment,status,activation_status,created_at,paid_at,access_expires_at").order("created_at",{ascending:false}).limit(100),
      // Counts are owner-scoped and include all workspaces. A truncated
      // 500-document overview must NEVER be presented as an exact count.
      admin.rpc("autoreply_admin_contact_counts"),
    ]);
    const firstError = profilesRes.error || accountsRes.error || automationsRes.error || usageRes.error || plansRes.error || auditRes.error || dmHistoryRes.error || claimsRes.error || documentsRes.error || runtimeRes.error || paymentsRes.error || contactsRes.error;
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
      contactCounts: contactsRes.data || [],
      billingOrders: paymentsRes.data || [],
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
    if (authError || !authData?.user?.email_confirmed_at || authData.user.is_anonymous || !email || !(await verifyAdminRelay(req, action, jwt))) return reply(403, { ok: false, error: "Administrator access required" });

    const plan = payload?.plan || {};
    const id = String(plan.id || "").trim();
    if (!["free","starter","pro","business"].includes(id)) return reply(400,{ok:false,error:"Unknown plan"});
    const { data: before, error: beforeError } = await admin.from("autoreply_plans").select("*").eq("id", id).maybeSingle();
    if(beforeError || !before) return reply(404,{ok:false,error:"Plan not found"});
    const validInt=(value:any,min:number,max:number)=>Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
    const name=String(plan.name??before.name).trim();
    const auto=plan.automations_limit===null||plan.automations_limit===""?null:Number(plan.automations_limit);
    if(name.length<2||name.length>64||
       !validInt(plan.price_inr,id==="free"?0:1,id==="free"?0:1000000)||
       !validInt(plan.total_messages,0,100000000)||
       !validInt(plan.ai_replies,0,100000000)||
       !validInt(plan.instagram_accounts,1,100)||
       (auto!==null&&!validInt(auto,0,100000))||
       !validInt(plan.billing_days,1,366))
      return reply(400,{ok:false,error:"Enter valid plan details, price, billing days and separate reply limits."});
    const update = {
      name,
      price_inr: Number(plan.price_inr),
      total_messages: Number(plan.total_messages),
      ai_replies: Number(plan.ai_replies),
      instagram_accounts: Number(plan.instagram_accounts),
      automations_limit: auto,
      billing_days: Number(plan.billing_days),
      is_active: id==="free"?true:Boolean(plan.is_active),
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
    if (action === "create_catalog_upload") {
      const catalogId=String(payload.catalogId || ""), mimeType=String(payload.mimeType || ""), size=Number(payload.size);
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(catalogId) || !["image/jpeg","image/png","image/webp"].includes(mimeType) || !Number.isInteger(size) || size <= 0 || size > 5*1024*1024)
        return reply(400,{ok:false,error:"Use JPG, PNG or WebP images, up to 5 MB each."});
      const bucket="catalog-images";
      const found=await admin.storage.getBucket(bucket);
      if (found.error) {
        if (![404,"404"].includes(found.error.status) && !/not found/i.test(found.error.message || "")) throw found.error;
        const created=await admin.storage.createBucket(bucket,{public:true,fileSizeLimit:5*1024*1024,allowedMimeTypes:["image/jpeg","image/png","image/webp"]});
        // Concurrent first uploads may race to create the same bucket.
        if (created.error && !/already exists|duplicate/i.test(created.error.message || "")) throw created.error;
      }
      const extension= mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
      const path=`${workspaceId}/${catalogId}/${crypto.randomUUID()}.${extension}`;
      const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(path);
      if(error || !data?.token) throw error || new Error("Could not create upload permission");
      const publicUrl=admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      return reply(200,{ok:true,path,token:data.token,publicUrl});
    }
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

    if (["list_inbox_page","inbox_analytics","mark_inbox_read"].includes(action)) {
      const args=action==="inbox_analytics"?{p_workspace:workspaceId,p_start:payload.start,p_end:payload.end,p_timezone:String(payload.timezone||'UTC')}:action==="mark_inbox_read"?{p_workspace:workspaceId,p_sender:String(payload.sender||''),p_read:payload.read!==false}:{p_workspace:workspaceId,p_sender:String(payload.sender||''),p_before_time:payload.before_time||null,p_before_id:payload.before_id||null,p_limit:50};
      const {data,error}=await admin.rpc(action==="list_inbox_page"?'autoreply_inbox_page':action==="inbox_analytics"?'autoreply_inbox_analytics':'autoreply_mark_inbox_read',args);
      if(error)return reply(500,{ok:false,error:'Inbox data could not be loaded.'});
      return reply(200,{ok:true,...data});
    }
    if (action === "list_workspace_data") {
      const collections = [
        "automations",
        "contacts",
      ];

      const data:any[]=[];
      for(let offset=0;offset<100000;offset+=500){
        const {data:batch,error} = await admin.from("autoreply_documents")
          .select("collection,id,data,created_at,updated_at").eq("user_id",workspaceId)
          .in("collection",collections).order("id",{ascending:true}).range(offset,offset+499);
        if(error){console.error("[WORKSPACE_DATA_LIST_FAILED]",error);return reply(500,{ok:false,error:"Workspace data could not be loaded"});}
        data.push(...(batch||[]));
        if((batch||[]).length<500)break;
        if(offset+500>=100000)return reply(503,{ok:false,error:"Workspace records exceed the safe retrieval limit."});
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

      const {data:page,error:pageError}=await admin.rpc('autoreply_inbox_page',{p_workspace:workspaceId,p_limit:50});
      if(pageError)return reply(500,{ok:false,error:'Inbox could not be loaded.'});
      return reply(200, {
        ok: true,
        inboxUnreadCounts:page?.unread_counts||{},
        automations: result.automations,
        contacts: result.contacts,
        inboxMessages: page?.messages||[],
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

    if (action === "set_automation_status") {
      const id=String(payload?.automationId || "");
      const status=String(payload?.status || "");
      if (!/^auto_[a-zA-Z0-9_-]{4,}$/.test(id) || !["active","paused"].includes(status))
        return reply(400,{ok:false,error:"Invalid automation status change"});
      const {data,error}=await admin.rpc("autoreply_set_automation_status",{p_user_id:workspaceId,p_automation_id:id,p_status:status});
      if(error) return reply(503,{ok:false,error:"Could not save automation status. Please retry."});
      if(!data?.ok) return reply(404,{ok:false,error:"Automation no longer exists"});
      return reply(200,data);
    }

    if (action === "save_automation") {
      const automation = payload?.automation;
      const id = String(automation?.id || "").trim();
      const normalizedName = String(automation?.name || "").trim();
      if (!/^auto_[a-zA-Z0-9_-]{4,}$/.test(id) || !normalizedName || !["dm","comment","story_reply","dm_ai_conversation"].includes(automation?.trigger_type) || !["active","paused"].includes(automation?.status) || !Array.isArray(automation?.actions))
        return reply(400,{ok:false,error:"Automation data is incomplete"});
      if(JSON.stringify(automation).length>100000)return reply(413,{ok:false,error:"Automation is too large"});
      const {data,error}=await admin.rpc("autoreply_save_automation",{p_user_id:workspaceId,p_automation:{...automation,id,name:normalizedName}});
      if(error)return reply(503,{ok:false,error:"Automation could not be saved. Your draft is still available; please retry."});
      if(!data?.ok)return reply(Number(data?.status||500),data||{ok:false,error:"Automation could not be saved"});
      return reply(200,data);
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

      const items = await fetchInstagramMedia(accessToken, kind, igUserId || "me");

      return reply(200, {
        ok: true,
        kind,
        username: String(account?.username || ""),
        items,
      });
    }

    if (action === "send_dm" || action === "admin_handoff_reply") {
      const username = String(payload?.recipientUsername || "").replace(/^@/, "").trim().toLowerCase();
      const text = String(payload?.messageText || "").trim();
      if (!username || !text || text.length > 1000) return reply(400, {ok:false, sent:false, error:"A recipient and message of 1–1000 characters are required"});
      const {data:stored,error:accountError} = await admin.from("autoreply_instagram_tokens").select("account").eq("user_id",workspaceId).maybeSingle();
      if (accountError) throw accountError;
      const account = stored?.account;
      if (!account?.access_token) return reply(409,{ok:false,sent:false,error:"Connect Instagram before sending a reply"});
      // Resolve only this workspace's real messaging-scoped contact ID.
      // A username or a synthetic ig_usr_* value is never a Meta recipient ID.
      const {data:rows,error:contactsError} = await admin.from("autoreply_documents").select("id,data")
        .eq("user_id",workspaceId).eq("collection","contacts");
      if (contactsError) throw contactsError;
      const matches = (rows || []).filter((row:any) => [row.data?.ig_username,row.data?.ig_user_id,...(row.data?.ig_user_ids || [])]
        .some((value:any) => String(value || "").replace(/^@/, "").toLowerCase() === username));
      const recipients = [...new Set(matches.map((row:any)=>String(row.data?.ig_user_id || row.id || "")).filter((id:string)=>/^\d+$/.test(id)))];
      if (recipients.length !== 1) return reply(409,{ok:false,sent:false,error:"No unique Instagram conversation found for this contact. Ask them to send a new DM first."});
      const recipientId = String(recipients[0]);
      // The standard Instagram messaging window is opened by the customer's
      // inbound message, never by the business's last outbound or a comment.
      // This untagged send path does not claim the HUMAN_AGENT/ads exemption.
      const {data:inbound,error:windowError}=await admin.from("autoreply_documents")
        .select("id,message_time").eq("user_id",workspaceId).eq("collection","inbox_messages")
        .eq("data->>from_ig_id",recipientId).eq("data->>direction","in")
        .order("message_time",{ascending:false}).limit(1);
      if(windowError)return reply(503,{ok:false,sent:false,error:"Could not verify the Instagram messaging window. Please retry."});
      const lastInbound=inbound?.[0]?.message_time?Date.parse(String(inbound[0].message_time)):NaN;
      if(!Number.isFinite(lastInbound)||lastInbound<Date.now()-24*60*60*1000){
        return reply(409,{ok:false,sent:false,error:"This customer is outside the standard 24-hour DM window. Ask them to send a fresh message."});
      }
      // A manual reply is a durable human takeover, even after a reload.
      const {error:pauseError}=await admin.rpc("autoreply_set_thread_control",{p_workspace:workspaceId,p_sender:recipientId,p_paused:true,p_username:username,p_handoff_id:action==="admin_handoff_reply"?payload.handoffId:null});
      if(pauseError) return reply(503,{ok:false,sent:false,error:"Could not pause AI replies for this conversation. Please retry."});
      if(handoffAdmin){const {error:auditError}=await admin.from("autoreply_admin_audit_logs").insert({admin_user_id:handoffAdmin.id,admin_email:handoffAdmin.email,action:"handoff_manual_reply",entity_type:"human_handoff",entity_id:payload.handoffId});if(auditError)return reply(503,{ok:false,sent:false,error:"Could not record administrator action"});}
      let response: Response;
      try {
        // Never retry an ambiguous message write: Meta may already have accepted it.
        response = await fetch("https://graph.instagram.com/v25.0/me/messages", {
          method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${account.access_token}`},
          body:JSON.stringify({recipient:{id:recipientId},message:{text}}),signal:AbortSignal.timeout(12000),
        });
      } catch {
        return reply(502,{ok:false,sent:false,error:"Instagram delivery could not be confirmed. Check Instagram before retrying."});
      }
      const result:any = await response.json().catch(()=>null);
      if (!response.ok || result?.error || !result?.message_id) {
        return reply(502,{ok:false,sent:false,error:String(result?.error?.message || "Instagram did not confirm the message"),meta_code:result?.error?.code || null});
      }
      const message = {id:String(result.message_id),from_ig_id:recipientId,from_username:matches.find((row:any)=>row.data?.ig_username && !/^\d+$/.test(row.data.ig_username))?.data.ig_username || username,
        message_text:text,direction:"out",is_automated:false,is_read:true,delivery_status:"sent",timestamp:new Date().toISOString()};
      const {error:saveError} = await admin.from("autoreply_documents").upsert({user_id:workspaceId,collection:"inbox_messages",id:message.id,data:message},{onConflict:"user_id,collection,id"});
      if (saveError) console.warn("[MANUAL_DM_INBOX_SAVE_FAILED]",{workspaceId,messageId:message.id});
      // Delivery remains confirmed even if the Inbox write needs reconciliation.
      return reply(200,{ok:true,sent:true,message_id:message.id,message,inbox_saved:!saveError});
    }

    if (action === "save") {
      const registrationSecret = String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim();
      if (!registrationSecret || req.headers.get("x-autoreply-oauth-secret") !== registrationSecret)
        return reply(401,{ok:false,error:"Account registration requires a verified OAuth callback"});
      const accessToken = String(payload?.accessToken || "").trim();
      if (!accessToken) {
        return reply(400, { ok: false, error: "Instagram access token is missing" });
      }

      const me = await readInstagramProfile(accessToken);
      const now = new Date();
      const account = {
        id: "primary",
        // Meta profile id is app-scoped; user_id is the professional ID in webhooks.
        ig_user_id: String(me.user_id || me.id),
        ig_scoped_id: String(me.id),
        username: String(me.username).trim(),
        profile_pic_url:
          String(me?.profile_picture_url || "").trim() ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(String(me.username))}`,
        followers_count: Number(me?.followers_count || 0),
        following_count: Number(me?.follows_count || 0),
        media_count: Number(me?.media_count || 0),
        account_type: String(me?.account_type || "").trim(),
        access_token: accessToken,
        token_expires_at: new Date(
          now.getTime() + 60 * 24 * 60 * 60 * 1000
        ).toISOString(),
        connected_at: now.toISOString(),
        status: "connected",
      };

      const ownerId = String(payload?.ownerId || "");
      if (ownerId) {
        const secret = String(Deno.env.get("INSTAGRAM_APP_SECRET") || "").trim();
        if (!secret || req.headers.get("x-autoreply-oauth-secret") !== secret || !isWorkspaceId(ownerId))
          return reply(401,{ok:false,error:"Invalid account registration authorization"});
        const {data:registered,error:registrationError} = await admin.rpc("autoreply_connect_instagram_account", {
          p_owner_id:ownerId,p_workspace_id:workspaceId,p_account:account,
          p_started_at:payload.connectionStartedAt,p_reconnect:payload.reconnect === true,
        });
        if (registrationError) throw registrationError;
        if (!registered?.ok) return reply(Number(registered?.status || 500), registered || {ok:false,error:"Instagram connection could not be saved"});
        return reply(200, registered);
      }
      // Preserve verified business sender scopes only for this exact account.
      // These aliases prevent unflagged self echoes from becoming customers.
      const { data: previousToken, error: previousTokenError } = await admin
        .from("autoreply_instagram_tokens").select("account")
        .eq("user_id", workspaceId).maybeSingle();
      if (previousTokenError) throw previousTokenError;
      if ([account.ig_user_id, account.ig_scoped_id].includes(String(previousToken?.account?.ig_user_id || "")) &&
          Array.isArray(previousToken?.account?.own_sender_ids)) {
        (account as any).own_sender_ids = previousToken.account.own_sender_ids
          .map(String).filter((id: string) => /^\d+$/.test(id));
      }
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

      return reply(200, { ok: true, workspaceId, account: safeAccount(account) });
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

      let account: any = data?.account || null;
      const accessToken = String(account?.access_token || "").trim();

      let webhookSubscribed = false;
      if (account?.ig_user_id && accessToken) {
        webhookSubscribed = await ensureWebhookSubscription(accessToken, String(account.ig_user_id));
      }

      // Refresh public professional-profile metrics on normal account load so
      // existing connections receive new fields without forcing reconnect.
      if (account?.username && accessToken) {
        try {
          const me = await readInstagramProfile(accessToken);
          account = {
            ...account,
            ig_user_id: String(me.user_id || me.id),
            ig_scoped_id: String(me.id),
            username: String(me?.username || account.username).trim(),
            profile_pic_url: String(me?.profile_picture_url || account.profile_pic_url || "").trim(),
            followers_count: Number(me?.followers_count ?? account.followers_count ?? 0),
            following_count: Number(me?.follows_count ?? account.following_count ?? 0),
            media_count: Number(me?.media_count ?? account.media_count ?? 0),
            account_type: String(me?.account_type || account.account_type || "").trim(),
          };

          await Promise.all([
            admin.from("autoreply_instagram_tokens").update({ account }).eq("user_id", workspaceId),
            admin.from("autoreply_instagram_memberships").update({ig_user_id:account.ig_user_id,profile:safeAccount(account)}).eq("workspace_id",workspaceId),
            admin.from("autoreply_documents").update({data:safeAccount(account)})
              .eq("user_id",workspaceId).eq("collection","instagram_account").eq("id","primary"),
          ]);
        } catch (refreshError) {
          console.warn("[IG_STORE_PROFILE_REFRESH_WARN]", refreshError);
        }
      }

      return reply(200, {
        ok: true,
        account: account?.username ? safeAccount(account) : null,
        webhookSubscribed,
      });
    }

    if (action === "delete") {
      const {data:removed,error} = await admin.rpc("autoreply_disconnect_instagram_connection", {p_workspace_id:workspaceId});
      if (error || !removed?.ok) return reply(500,{ok:false,error:"Instagram disconnect could not be saved. Please try again."});
      return reply(200, {ok:true,account:null});
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
