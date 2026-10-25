-- 2026-10-25: repair authenticated Inbox writes/reads after the generated
-- autoreply_documents.message_time column began calling this immutable helper.
-- The helper only parses caller-supplied text into a timestamp and does NOT
-- read customer or workspace data. The original campaign, memory, and delivery
-- RPCs remain private; this grant does not bypass RLS or expose any records.
-- Its earlier service_role-only EXECUTE grant caused PG 42501 when an
-- authenticated owner updated an Inbox document (e.g. mark read).
revoke all on function public.autoreply_campaign_message_time(text) from public, anon;
grant execute on function public.autoreply_campaign_message_time(text) to authenticated, service_role;

-- Stay explicit about all other campaign endpoints being service-only.
-- Do not grant any campaign worker/eligibility/reservation RPC to the browser.
notify pgrst, 'reload schema';
