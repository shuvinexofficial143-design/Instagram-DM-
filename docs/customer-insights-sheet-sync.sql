create or replace function public.autoreply_save_customer_insight(p_user_id text,p_contact_id text,p_data jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
if coalesce(p_data->>'stage','') not in ('new','ready','interested','low','customer','repeat','support') or coalesce(p_data->>'priority','') not in ('high','normal','low') or coalesce(p_data->>'source','') not in ('automatic','manual') then raise exception 'Invalid customer insight'; end if;
insert into public.autoreply_documents(user_id,collection,id,data) values(p_user_id,'customer_insights',p_contact_id,p_data)
on conflict(user_id,collection,id) do update set data=case when autoreply_documents.data->>'source'='manual' and excluded.data->>'source'<>'manual' then autoreply_documents.data else excluded.data end,updated_at=now();
end $$;
revoke all on function public.autoreply_save_customer_insight(text,text,jsonb) from public,anon;
grant execute on function public.autoreply_save_customer_insight(text,text,jsonb) to authenticated,service_role;
create table public.autoreply_sheet_sync_leases(workspace_id text not null,automation_id text not null,owner_id text not null,expires_at timestamptz not null,primary key(workspace_id,automation_id));
alter table public.autoreply_sheet_sync_leases enable row level security;
revoke all on public.autoreply_sheet_sync_leases from public,anon,authenticated;
grant all on public.autoreply_sheet_sync_leases to service_role;
create function public.autoreply_claim_sheet_sync(p_workspace_id text,p_automation_id text,p_owner_id text) returns boolean language plpgsql security invoker set search_path='' as $$
declare changed int;
begin
insert into public.autoreply_sheet_sync_leases values(p_workspace_id,p_automation_id,p_owner_id,now()+interval '90 seconds')
on conflict(workspace_id,automation_id) do update set owner_id=excluded.owner_id,expires_at=excluded.expires_at where autoreply_sheet_sync_leases.expires_at<now() or autoreply_sheet_sync_leases.owner_id=p_owner_id;
get diagnostics changed=row_count;return changed=1;
end $$;
revoke all on function public.autoreply_claim_sheet_sync(text,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_claim_sheet_sync(text,text,text) to service_role;
-- Preserve existing automations' previously connected sheets.
insert into public.autoreply_documents(user_id,collection,id,data)
select a.user_id,'google_sheets_automations',a.id,jsonb_build_object('spreadsheet_id',c.data->>'spreadsheet_id','spreadsheet_url',c.data->>'spreadsheet_url','sheet_name',coalesce(c.data->>'sheet_name','Leads'),'fields',coalesce(c.data->'fields','[]'::jsonb),'state','legacy','title',a.data->>'name','created_at',now())
from public.autoreply_documents a join public.autoreply_documents c on c.user_id=a.user_id and c.collection='google_sheets_connections' and c.id='primary'
where a.collection='automations' and a.data->>'trigger_type'='dm_ai_conversation' and coalesce(c.data->>'spreadsheet_id','')<>'' on conflict do nothing;
