-- Customer Data is retained independently of automation documents.
create table public.autoreply_data_collections (
 id uuid primary key default gen_random_uuid(), workspace_id text not null,
 automation_id text not null, automation_name text not null,
 version integer not null check(version>0), fields jsonb not null check(jsonb_typeof(fields)='array'),
 active boolean not null default true, automation_deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,automation_id,version)
);
create index autoreply_data_collections_workspace on public.autoreply_data_collections(workspace_id,updated_at desc);
create unique index autoreply_data_collections_current on public.autoreply_data_collections(workspace_id,automation_id) where active;
create table public.autoreply_customer_records (
 id uuid primary key default gen_random_uuid(), workspace_id text not null,
 collection_id uuid not null references public.autoreply_data_collections(id) on delete restrict,
 customer_key text not null, username text not null default '', data jsonb not null default '{}',
 field_timestamps jsonb not null default '{}', last_message_id text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 search_text text generated always as (data::text || ' ' || username || ' ' || customer_key) stored,
 unique(collection_id,customer_key), check(jsonb_typeof(data)='object')
);
create index autoreply_customer_records_workspace on public.autoreply_customer_records(workspace_id,collection_id,updated_at desc);
alter table public.autoreply_data_collections enable row level security;
alter table public.autoreply_customer_records enable row level security;
revoke all on public.autoreply_data_collections,public.autoreply_customer_records from public,anon,authenticated;
grant select on public.autoreply_data_collections,public.autoreply_customer_records to authenticated;
grant all on public.autoreply_data_collections,public.autoreply_customer_records to service_role;
create policy customer_collections_owner_read on public.autoreply_data_collections for select to authenticated using (
 workspace_id=(select auth.uid())::text or workspace_id in(select m.workspace_id from public.autoreply_instagram_memberships m where m.owner_user_id=(select auth.uid())::text)
);
create policy customer_records_owner_read on public.autoreply_customer_records for select to authenticated using (
 workspace_id=(select auth.uid())::text or workspace_id in(select m.workspace_id from public.autoreply_instagram_memberships m where m.owner_user_id=(select auth.uid())::text)
);

create function public.autoreply_customer_fields(config jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(label order by position),'["Name","Phone","Email","City","Product"]'::jsonb) from (
 select left(btrim(value),60) label,min(ordinality) position from jsonb_array_elements_text(
 case when jsonb_typeof(config->'data_fields')='array' then config->'data_fields'
 when jsonb_typeof(config->'sheet_fields')='array' and jsonb_array_length(config->'sheet_fields')>0 then config->'sheet_fields'
 else '["Name","Phone","Email","City","Product"]'::jsonb end) with ordinality
 where btrim(value)<>'' group by left(btrim(value),60) order by min(ordinality) limit 30
 ) labels;
$$;
create function public.autoreply_customer_collection_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare doc record; schema_fields jsonb; current_table public.autoreply_data_collections; next_version int; enabled boolean;
begin
 if TG_OP='DELETE' then
  if OLD.collection='automations' then
   update public.autoreply_data_collections set active=false,automation_deleted_at=now(),updated_at=now() where workspace_id=OLD.user_id and automation_id=OLD.id;
  end if;
  return OLD;
 end if;
 if NEW.collection<>'automations' then return NEW; end if;
 enabled:=coalesce((NEW.data->'trigger_config'->>'data_capture_enabled')::boolean,NEW.data->>'trigger_type'='dm_ai_conversation',false);
 if not enabled then
  update public.autoreply_data_collections set active=false,updated_at=now() where workspace_id=NEW.user_id and automation_id=NEW.id and active;
  return NEW;
 end if;
 schema_fields:=public.autoreply_customer_fields(coalesce(NEW.data->'trigger_config','{}'::jsonb));
 perform pg_advisory_xact_lock(hashtextextended(NEW.user_id||':'||NEW.id,0));
 select * into current_table from public.autoreply_data_collections where workspace_id=NEW.user_id and automation_id=NEW.id order by version desc limit 1 for update;
 if current_table.id is not null and current_table.fields=schema_fields and current_table.automation_deleted_at is null then
  update public.autoreply_data_collections set automation_name=coalesce(nullif(NEW.data->>'name',''),'Untitled automation'),active=true,updated_at=now() where id=current_table.id;
 else
  next_version:=coalesce(current_table.version,0)+1;
  update public.autoreply_data_collections set active=false where workspace_id=NEW.user_id and automation_id=NEW.id and active;
  insert into public.autoreply_data_collections(workspace_id,automation_id,automation_name,version,fields)
  values(NEW.user_id,NEW.id,coalesce(nullif(NEW.data->>'name',''),'Untitled automation'),next_version,schema_fields);
 end if;
 return NEW;
end;
$$;
revoke all on function public.autoreply_customer_collection_sync() from public,anon,authenticated;
create trigger autoreply_customer_collection_sync after insert or update or delete on public.autoreply_documents for each row execute function public.autoreply_customer_collection_sync();

-- Service-only atomic merge. Each field has its own event time, so a late task
-- can fill missing details without overwriting a newer correction.
create function public.autoreply_capture_customer(p_workspace text,p_automation text,p_fields jsonb,p_customer text,p_username text,p_values jsonb,p_message text,p_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.autoreply_data_collections; saved public.autoreply_customer_records; pair record; clean jsonb:='{}'; stamps jsonb:='{}'; event_at timestamptz;
begin
 if length(p_customer)<1 or length(p_customer)>200 or jsonb_typeof(p_values)<>'object' then raise exception 'Invalid customer data'; end if;
 select * into target from public.autoreply_data_collections where workspace_id=p_workspace and automation_id=p_automation and fields=p_fields and automation_deleted_at is null order by version desc limit 1;
 if target.id is null then return null; end if;
 -- Capture must still be enabled, including while an older schema task finishes.
 if not exists(select 1 from public.autoreply_data_collections where workspace_id=p_workspace and automation_id=p_automation and active) then return null; end if;
 event_at:=least(coalesce(p_at,now()),now());
 insert into public.autoreply_customer_records(workspace_id,collection_id,customer_key,username,updated_at)
 values(p_workspace,target.id,p_customer,left(coalesce(p_username,''),200),event_at)
 on conflict(collection_id,customer_key) do nothing;
 select * into saved from public.autoreply_customer_records where collection_id=target.id and customer_key=p_customer for update;
 for pair in select key,value from jsonb_each_text(p_values) loop
  if target.fields ? pair.key and nullif(btrim(pair.value),'') is not null and
   (saved.field_timestamps->>pair.key is null or (saved.field_timestamps->>pair.key)::timestamptz<=event_at) then
   clean:=clean||jsonb_build_object(pair.key,left(btrim(pair.value),2000));
   stamps:=stamps||jsonb_build_object(pair.key,event_at);
  end if;
 end loop;
 update public.autoreply_customer_records set data=data||clean,field_timestamps=field_timestamps||stamps,
 username=case when nullif(p_username,'') is not null and event_at>=updated_at then left(p_username,200) else username end,
 last_message_id=case when event_at>=updated_at then left(coalesce(p_message,''),300) else last_message_id end,
 updated_at=greatest(updated_at,event_at) where id=saved.id;
 return saved.id;
end;
$$;
revoke all on function public.autoreply_capture_customer(text,text,jsonb,text,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.autoreply_capture_customer(text,text,jsonb,text,text,jsonb,text,timestamptz) to service_role;
-- Provision empty logical tables for existing eligible automations; no chat backfill.
update public.autoreply_documents set data=data where collection='automations';
