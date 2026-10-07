-- These runtime routines are used only by trusted server/Edge Function clients.
-- A browser must not claim other workspaces' events, read context/tokens or change usage.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in (
 'autoreply_automation_cache_trigger','autoreply_claim_dm_context','autoreply_claim_dm_context_v2','autoreply_claim_dm_context_v3','autoreply_claim_dm_context_v4',
 'autoreply_claim_message_only','autoreply_get_usage','autoreply_increment_usage','autoreply_mark_outbound_message','autoreply_mark_pending_outbound',
 'autoreply_refresh_active_automation','autoreply_refresh_runtime_context','autoreply_resolve_dm_context','autoreply_runtime_context_automation_trigger','autoreply_runtime_context_token_trigger'
 ) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
alter function public.set_autoreply_updated_at() set search_path = '';
