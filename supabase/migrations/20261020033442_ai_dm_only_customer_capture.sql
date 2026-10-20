
-- Customer detail extraction is supported only by AI DM Conversation.
create function public.autoreply_ai_dm_capture_config() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if NEW.collection='automations' and NEW.data->>'trigger_type' is distinct from 'dm_ai_conversation' then
   NEW.data:=jsonb_set(NEW.data,'{trigger_config}',
     (case when jsonb_typeof(NEW.data->'trigger_config')='object' then NEW.data->'trigger_config' else '{}'::jsonb end
      -'data_fields'-'sheet_fields'-'data_capture_enabled')||'{"data_capture_enabled":false}'::jsonb,true);
 end if;
 return NEW;
end $$;
revoke all on function public.autoreply_ai_dm_capture_config() from public,anon,authenticated;
create trigger autoreply_ai_dm_capture_config before insert or update on public.autoreply_documents
for each row execute function public.autoreply_ai_dm_capture_config();
CREATE OR REPLACE FUNCTION public.autoreply_customer_collection_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare requested jsonb; combined jsonb; current_table public.autoreply_data_collections; enabled boolean; edited boolean:=false; source_name text:=''; source_id text:='';
begin
 if TG_OP='DELETE' then
  if OLD.collection='automations' then
   update public.autoreply_data_collections set active=false,automation_status='deleted',automation_deleted_at=now(),updated_at=now() where workspace_id=OLD.user_id and automation_id=OLD.id;
  end if;return OLD;
 end if;
 if NEW.collection<>'automations' then return NEW;end if;
 if TG_OP='UPDATE' then
  if (OLD.data-'stats'-'updated_at') is not distinct from (NEW.data-'stats'-'updated_at') then return NEW;end if;
  edited:=(OLD.data-'stats'-'updated_at'-'status') is distinct from (NEW.data-'stats'-'updated_at'-'status');
 end if;
 enabled:=coalesce(NEW.data->>'trigger_type'='dm_ai_conversation',false) and coalesce((NEW.data->'trigger_config'->>'data_capture_enabled')::boolean,true);
 perform pg_advisory_xact_lock(hashtextextended(NEW.user_id||':'||NEW.id,0));
 select * into current_table from public.autoreply_data_collections where workspace_id=NEW.user_id and automation_id=NEW.id order by version desc limit 1 for update;
 select coalesce(m.profile->>'username',''),m.ig_user_id into source_name,source_id from public.autoreply_instagram_memberships m where m.workspace_id=NEW.user_id limit 1;
 requested:=public.autoreply_customer_fields(coalesce(NEW.data->'trigger_config','{}'::jsonb));
 if current_table.id is null or current_table.automation_deleted_at is not null then
  if enabled then
   insert into public.autoreply_data_collections(workspace_id,automation_id,automation_name,version,fields,automation_status,instagram_username,instagram_id)
   values(NEW.user_id,NEW.id,coalesce(nullif(NEW.data->>'name',''),'Untitled automation'),coalesce(current_table.version,0)+1,requested,coalesce(NEW.data->>'status','paused'),coalesce(source_name,''),coalesce(source_id,''));
  end if;return NEW;
 end if;
 -- Append newly configured columns. Removing a configured field never erases
 -- historical columns or customer values. Archived earlier versions are untouched.
 select coalesce(jsonb_agg(label order by pos),'[]'::jsonb) into combined from (
 select label,min(pos) pos from jsonb_array_elements_text(current_table.fields||requested) with ordinality as f(label,pos) group by label
 ) f;
 update public.autoreply_data_collections set
 fields=combined,schema_revision=schema_revision+case when fields is distinct from combined then 1 else 0 end,
 automation_name=coalesce(nullif(NEW.data->>'name',''),'Untitled automation'),
 automation_status=coalesce(NEW.data->>'status','paused'),active=enabled,
 automation_updated_at=case when edited then now() else automation_updated_at end,
 instagram_username=coalesce(nullif(source_name,''),instagram_username),instagram_id=coalesce(nullif(source_id,''),instagram_id),updated_at=now()
 where id=current_table.id;
 -- Older schemas share the automation's current run state, but keep their data.
 update public.autoreply_data_collections set automation_status=coalesce(NEW.data->>'status','paused') where workspace_id=NEW.user_id and automation_id=NEW.id and id<>current_table.id and automation_deleted_at is null;
 return NEW;
end;
$function$;
CREATE OR REPLACE FUNCTION public.autoreply_capture_customer(p_workspace text, p_automation text, p_fields jsonb, p_customer text, p_username text, p_values jsonb, p_message text, p_at timestamp with time zone, p_event jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.autoreply_data_collections; saved public.autoreply_customer_records; pair record; clean jsonb:='{}'; stamps jsonb:='{}'; event_at timestamptz; purchase boolean;
begin
 if not exists(select 1 from public.autoreply_documents d where d.user_id=p_workspace and d.collection='automations' and d.id=p_automation and d.data->>'trigger_type'='dm_ai_conversation' and coalesce(d.data->'trigger_config'->>'data_capture_enabled','true')<>'false') then return null;end if;
 if p_customer is null or length(p_customer)<1 or length(p_customer)>200 or jsonb_typeof(p_values)<>'object' then raise exception 'Invalid customer data';end if;
 select * into target from public.autoreply_data_collections where workspace_id=p_workspace and automation_id=p_automation and active and automation_deleted_at is null order by version desc limit 1 for share;
 if target.id is null then return null;end if;
 event_at:=least(coalesce(p_at,now()),clock_timestamp());
 purchase:=coalesce(p_event->>'purchase_reported','false')='true';
 insert into public.autoreply_customer_records(workspace_id,collection_id,customer_key,username,updated_at,first_seen_at,last_seen_at)
 values(p_workspace,target.id,p_customer,left(coalesce(p_username,''),200),event_at,event_at,event_at)
 on conflict(collection_id,customer_key) do nothing;
 select * into saved from public.autoreply_customer_records where collection_id=target.id and customer_key=p_customer for update;
 for pair in select key,value from jsonb_each_text(p_values) loop
  if target.fields ? pair.key and p_fields ? pair.key and nullif(btrim(pair.value),'') is not null and
   (saved.field_timestamps->>pair.key is null or (saved.field_timestamps->>pair.key)::timestamptz<=event_at) then
   clean:=clean||jsonb_build_object(pair.key,left(btrim(pair.value),2000));stamps:=stamps||jsonb_build_object(pair.key,event_at);
  end if;
 end loop;
 update public.autoreply_customer_records set data=data||clean,field_timestamps=field_timestamps||stamps,
 username=case when nullif(p_username,'') is not null and event_at>=updated_at then left(p_username,200) else username end,
 first_seen_at=least(coalesce(first_seen_at,event_at),event_at),last_seen_at=greatest(coalesce(last_seen_at,event_at),event_at),
 instagram_id=case when instagram_id='' or instagram_id=p_customer or event_at>=coalesce(last_seen_at,event_at) then coalesce(nullif(left(p_event->>'customer_instagram_id',200),''),nullif(instagram_id,''),p_customer) else instagram_id end,
 source_instagram_username=coalesce(nullif(p_event->>'source_username',''),nullif(source_instagram_username,''),target.instagram_username),
 source_instagram_id=coalesce(nullif(p_event->>'source_id',''),nullif(source_instagram_id,''),target.instagram_id),
 purchase_reported_at=case when purchase then greatest(coalesce(purchase_reported_at,event_at),event_at) else purchase_reported_at end,
 purchase_product=case when purchase and (purchase_reported_at is null or event_at>=purchase_reported_at) then left(coalesce(nullif(p_event->>'purchase_product',''),nullif(clean->>'Product',''),nullif(data->>'Product',''),purchase_product),200) else purchase_product end,
 last_message_id=case when event_at>=updated_at then left(coalesce(p_message,''),300) else last_message_id end,
 updated_at=greatest(updated_at,event_at) where id=saved.id;
 return saved.id;
end;
$function$;

-- Normalize existing non-AI rules and stop their existing capture collections.
update public.autoreply_documents set data=data
where collection='automations' and data->>'trigger_type' is distinct from 'dm_ai_conversation'
 and coalesce(data->'trigger_config','{}'::jsonb) ?| array['data_capture_enabled','data_fields','sheet_fields'];
update public.autoreply_data_collections c set active=false,updated_at=now()
from public.autoreply_documents d where d.user_id=c.workspace_id and d.id=c.automation_id
and d.collection='automations' and d.data->>'trigger_type' is distinct from 'dm_ai_conversation' and c.active;
notify pgrst,'reload schema';

