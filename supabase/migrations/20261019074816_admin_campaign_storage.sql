create table public.autoreply_campaigns(
 id uuid primary key,created_by uuid not null,workspace_id text not null,name text not null,message text not null,
 prompt text not null default '',followup_enabled boolean not null default false,
 status text not null default 'draft' check(status in ('draft','running','paused','completed','stopped')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.autoreply_campaign_recipients(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.autoreply_campaigns(id) on delete cascade,
 identifier text not null,sender_id text,username text,status text not null check(status in ('queued','dispatching','sent','failed','skipped','unknown')),
 reason text not null default '',message_id text,sent_at timestamptz,replied_at timestamptz,lease_id uuid,lease_until timestamptz,
 unique(campaign_id,identifier)
);
alter table public.autoreply_campaigns enable row level security;
alter table public.autoreply_campaign_recipients enable row level security;
revoke all on public.autoreply_campaigns,public.autoreply_campaign_recipients from public,anon,authenticated;
grant all on public.autoreply_campaigns,public.autoreply_campaign_recipients to service_role;
create index campaign_recipient_queue on public.autoreply_campaign_recipients(campaign_id,status);
create index campaign_recipient_sender on public.autoreply_campaign_recipients(sender_id,campaign_id) where status='sent';
create index campaigns_owner on public.autoreply_campaigns(created_by,created_at desc);

create or replace function public.autoreply_campaign_message_time(p_value text) returns timestamptz language plpgsql immutable security invoker set search_path='' as $$
begin return p_value::timestamptz; exception when others then return null; end $$;
revoke all on function public.autoreply_campaign_message_time(text) from public,anon,authenticated;
grant execute on function public.autoreply_campaign_message_time(text) to service_role;
create or replace function public.autoreply_campaign_eligibility(p_workspace text,p_identifiers text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_item text; v_sender text; v_username text; v_time timestamptz; v_result jsonb:='[]'; v_seen text[]:=array[]::text[]; v_count integer;
begin
 if cardinality(p_identifiers) is null or cardinality(p_identifiers)<1 or cardinality(p_identifiers)>500 then raise exception 'Paste between 1 and 500 recipients'; end if;
 foreach v_item in array p_identifiers loop
   v_item:=lower(trim(ltrim(v_item,'@')));v_sender:=null;v_username:=null;v_time:=null;
   select count(distinct coalesce(nullif(data->>'ig_user_id',''),id)),min(coalesce(nullif(data->>'ig_user_id',''),id)),min(data->>'ig_username') into v_count,v_sender,v_username
     from public.autoreply_documents where user_id=p_workspace and collection='contacts'
       and (lower(data->>'ig_username')=v_item or data->>'ig_user_id'=v_item or id=v_item);
   if v_count=1 and v_sender ~ '^\d+$' then
     select max(public.autoreply_campaign_message_time(data->>'timestamp')) into v_time from public.autoreply_documents
       where user_id=p_workspace and collection='inbox_messages' and data->>'direction'='in' and data->>'from_ig_id'=v_sender and coalesce(data->>'is_test','false')<>'true';
   end if;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('identifier',v_item,'sender_id',v_sender,'username',v_username,'eligible',
     v_count=1 and v_sender ~ '^\d+$' and v_time>now()-interval '24 hours' and v_time<=now()+interval '5 minutes' and not(v_sender=any(v_seen)),
     'reason',case when v_count<>1 or v_sender is null or v_sender !~ '^\d+$' then 'No unique existing Instagram conversation' when v_sender=any(v_seen) then 'Duplicate recipient' when v_time is null or v_time<=now()-interval '24 hours' or v_time>now()+interval '5 minutes' then 'Outside the supported messaging window' else '' end));
   if v_sender is not null then v_seen:=array_append(v_seen,v_sender); end if;
 end loop;
 return v_result;
end $$;
revoke all on function public.autoreply_campaign_eligibility(text,text[]) from public,anon,authenticated;
grant execute on function public.autoreply_campaign_eligibility(text,text[]) to service_role;

create or replace function public.autoreply_create_campaign(p_actor uuid,p_id uuid,p_workspace text,p_name text,p_message text,p_prompt text,p_followup boolean,p_identifiers text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_rows jsonb; v_row jsonb; v_existing public.autoreply_campaigns%rowtype;
begin
 select * into v_existing from public.autoreply_campaigns where id=p_id;
 if found then if v_existing.created_by<>p_actor then raise exception 'Campaign belongs to another administrator'; end if;return jsonb_build_object('ok',true,'id',p_id);end if;
 if not exists(select 1 from public.autoreply_instagram_memberships m join public.autoreply_instagram_tokens t on t.user_id=m.workspace_id where m.workspace_id=p_workspace and m.owner_user_id=p_actor::text and nullif(t.account->>'access_token','') is not null) then raise exception 'Select your own connected Instagram account'; end if;
 if length(trim(p_name)) not between 1 and 120 or length(trim(p_message)) not between 1 and 1000 or length(p_prompt)>10000 or (p_followup and length(trim(p_prompt))=0) then raise exception 'Enter a campaign name, message and AI instructions';end if;
 v_rows:=public.autoreply_campaign_eligibility(p_workspace,p_identifiers);
 insert into public.autoreply_campaigns(id,created_by,workspace_id,name,message,prompt,followup_enabled) values(p_id,p_actor,p_workspace,trim(p_name),trim(p_message),p_prompt,p_followup);
 for v_row in select value from jsonb_array_elements(v_rows) loop
   insert into public.autoreply_campaign_recipients(campaign_id,identifier,sender_id,username,status,reason)
    values(p_id,v_row->>'identifier',v_row->>'sender_id',v_row->>'username',case when v_row->'eligible'='true'::jsonb then 'queued' else 'skipped' end,v_row->>'reason') on conflict do nothing;
 end loop;
 return jsonb_build_object('ok',true,'id',p_id);
end $$;
revoke all on function public.autoreply_create_campaign(uuid,uuid,text,text,text,text,boolean,text[]) from public,anon,authenticated;
grant execute on function public.autoreply_create_campaign(uuid,uuid,text,text,text,text,boolean,text[]) to service_role;

