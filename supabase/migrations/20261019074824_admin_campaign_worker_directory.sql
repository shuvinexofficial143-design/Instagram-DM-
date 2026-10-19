-- A dedicated vaulted cron capability; plaintext never goes into source or API responses.
do $$begin
 if not exists(select 1 from vault.secrets where name='autoreply_campaign_worker_secret') then perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'autoreply_campaign_worker_secret');end if;
end $$;
create or replace function public.autoreply_campaign_worker_authorized(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select p_secret is not null and length(p_secret)>40 and exists(select 1 from vault.decrypted_secrets where name='autoreply_campaign_worker_secret' and decrypted_secret=p_secret);
$$;
revoke all on function public.autoreply_campaign_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.autoreply_campaign_worker_authorized(text) to service_role;
create or replace function public.autoreply_dispatch_campaign_worker() returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.autoreply_campaigns where status='running') then
 perform net.http_post(url:='https://dwgxmmftybxwpurgsxkx.supabase.co/functions/v1/instagram-campaign-worker',headers:=jsonb_build_object('Content-Type','application/json','x-campaign-cron',(select decrypted_secret from vault.decrypted_secrets where name='autoreply_campaign_worker_secret')),body:='{}'::jsonb,timeout_milliseconds:=90000);
 end if;
end $$;
revoke all on function public.autoreply_dispatch_campaign_worker() from public,anon,authenticated;
grant execute on function public.autoreply_dispatch_campaign_worker() to service_role;
select cron.schedule('autoreply-campaign-worker','* * * * *','select public.autoreply_dispatch_campaign_worker()');
notify pgrst,'reload schema';
create or replace function public.autoreply_admin_workspace_directory(p_query text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 with directory as (
 select m.workspace_id,m.owner_user_id,p.email,p.display_name,m.profile-'access_token' as account,(t.user_id is not null) as connected
 from public.autoreply_instagram_memberships m left join public.autoreply_profiles p on p.user_id=m.owner_user_id left join public.autoreply_instagram_tokens t on t.user_id=m.workspace_id
 union all select p.user_id,p.user_id,p.email,p.display_name,'{}'::jsonb,false from public.autoreply_profiles p where not exists(select 1 from public.autoreply_instagram_memberships m where m.owner_user_id=p.user_id)
 ),filtered as (select * from directory where coalesce(email,'') ilike '%'||left(p_query,120)||'%' or coalesce(account->>'username','') ilike '%'||left(p_query,120)||'%' or coalesce(display_name,'') ilike '%'||left(p_query,120)||'%')
 select jsonb_build_object('ok',true,'total',(select count(*) from filtered),'workspaces',coalesce((select jsonb_agg(to_jsonb(r)) from(select * from filtered order by email,workspace_id limit 50 offset greatest(0,p_offset))r),'[]'::jsonb));
$$;
revoke all on function public.autoreply_admin_workspace_directory(text,integer) from public,anon,authenticated;
grant execute on function public.autoreply_admin_workspace_directory(text,integer) to service_role;

