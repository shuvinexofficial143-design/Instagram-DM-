-- Service-only, durable revisions shared by concurrent webhook instances.
create or replace function public.autoreply_dm_turn(p_workspace text,p_sender text,p_action text,p_message text default '',p_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare identity jsonb; customer_key text; saved jsonb; revision bigint; pending jsonb; seen jsonb; latest boolean; ready boolean; quiet_ms integer; claimed boolean:=false;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 if nullif(p_workspace,'') is null or nullif(p_sender,'') is null or p_action<>all(array['register','observe','claim','finish','drop']) then raise exception 'Invalid conversation turn';end if;
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);customer_key:=coalesce(identity->>'conversation_id',p_sender);
 perform pg_advisory_xact_lock(hashtextextended(p_workspace||':dm_turn:'||customer_key,0));
 select data into saved from public.autoreply_documents where user_id=p_workspace and collection='dm_reply_turns' and id=customer_key;
 saved:=coalesce(saved,'{}'::jsonb);revision:=coalesce((saved->>'revision')::bigint,0);seen:=coalesce(saved->'seen','{}'::jsonb);pending:=coalesce(saved->'pending_ids','[]'::jsonb);
 if p_action='register' then
  if length(p_message) not between 1 and 1000 then raise exception 'Invalid source message';end if;
  if seen ? p_message then return jsonb_build_object('revision',(seen->>p_message)::bigint,'pending_ids',pending,'latest',(seen->>p_message)::bigint=revision);end if;
  revision:=revision+1;seen:=seen||jsonb_build_object(p_message,revision);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into seen from (select key,value from jsonb_each(seen) order by (value::text)::bigint desc limit 100) s;
  pending:=pending||jsonb_build_array(p_message);
  saved:=saved||jsonb_build_object('revision',revision,'pending_ids',pending,'seen',seen,'phase','collecting','quiet_until',clock_timestamp()+interval '1200 milliseconds');
 end if;
 if p_action='drop' and not exists(select 1 from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and id=p_message) then
  select coalesce(jsonb_agg(value),'[]'::jsonb) into pending from jsonb_array_elements(pending) value where value#>>'{}'<>p_message;
  saved:=jsonb_set(saved,'{pending_ids}',pending);
 end if;
 latest:=coalesce(p_revision=revision,false);
 quiet_ms:=greatest(0,ceil(extract(epoch from (coalesce((saved->>'quiet_until')::timestamptz,clock_timestamp())-clock_timestamp()))*1000)::integer);
 select not exists(select 1 from jsonb_array_elements_text(pending) x where not exists(select 1 from public.autoreply_documents d where d.user_id=p_workspace and d.collection='inbox_messages' and d.id=x and d.data->>'direction'='in')) into ready;
 if p_action='claim' and latest and ready and quiet_ms=0 and coalesce(saved->>'phase','')='collecting' then saved:=saved||jsonb_build_object('phase','sending');claimed:=true;end if;
 if p_action='finish' and latest then saved:=saved||jsonb_build_object('phase','sent','pending_ids','[]'::jsonb);end if;
 if p_action<>'observe' then
  insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'dm_reply_turns',customer_key,saved)
  on conflict(user_id,collection,id) do update set data=excluded.data,updated_at=now();
 end if;
 return jsonb_build_object('revision',revision,'latest',latest,'ready',ready,'quiet_ms',quiet_ms,'pending_ids',pending,'claimed',claimed,'phase',saved->>'phase');
end;
$function$;
revoke all on function public.autoreply_dm_turn(text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.autoreply_dm_turn(text,text,text,text,bigint) to service_role;

alter table public.autoreply_customer_records add column if not exists address_components jsonb not null default '{}'::jsonb;

-- Evidence-backed customer details. Stored separately from lossy conversation summaries.
create or replace function public.autoreply_merge_customer_facts(p_workspace text,p_sender text,p_facts jsonb,p_issues jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare saved jsonb; merged jsonb; item record; src public.autoreply_documents%rowtype; old jsonb; incoming jsonb; aliases text[]; clean_value text; identity jsonb; customer_key text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 if p_workspace is null or p_sender is null or jsonb_typeof(p_facts)<>'object' or octet_length(p_facts::text)>60000 then raise exception 'Invalid customer facts';end if;
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);
 customer_key:=coalesce(identity->>'conversation_id',p_sender);
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace||':customer_facts:'||customer_key,0));
 select data into saved from public.autoreply_documents where user_id=p_workspace and collection='customer_facts' and id=customer_key;
 merged:=coalesce(saved->'facts','{}'::jsonb);
 for item in select key,value from jsonb_each(p_facts) loop
  if item.key<>all(array['name','phone','email','product','quantity','address','house_number','road','area','city','district','state','pincode','landmark','preferences']) then continue;end if;
  if jsonb_typeof(item.value)<>'object' or length(coalesce(item.value->>'value','')) not between 1 and 2000 or length(coalesce(item.value->>'evidence','')) not between 1 and 6000 then continue;end if;
  select * into src from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages' and id=item.value->>'source_message_id'
   and data->>'direction'='in' and data->>'from_ig_id'=any(coalesce(aliases,array[p_sender])) and coalesce(data->>'is_test','false')<>'true';
  if not found or strpos(coalesce(src.data->>'message_text',''),item.value->>'evidence')=0 then continue;end if;
  clean_value:=regexp_replace(item.value->>'evidence','[​-‏﻿]','','g');
  if strpos(lower(clean_value),lower(item.value->>'value'))=0 then continue;end if;
  if item.key='pincode' and item.value->>'value'!~'^[1-9][0-9]{5}$' then continue;end if;
  if item.key='phone' and regexp_replace(item.value->>'value','[ ()-]','','g')!~'^(\+91)?[6-9][0-9]{9}$' then continue;end if;
  old:=merged->item.key;
  if old is not null and (old->>'source_timestamp')::timestamptz>coalesce(src.message_time,src.created_at) then continue;end if;
  if item.key='name' and old is not null and lower(old->>'value')<>lower(item.value->>'value')
   and coalesce(src.data->>'message_text','')!~*'(my (correct |full )?name|mera (sahi |poora )?naam|मेरा (सही |पूरा )?नाम|नाम.{0,15}(बदल|सुधार)|name.{0,15}(correct|change))' then continue;end if;
  incoming:=jsonb_build_object('value',item.value->>'value','evidence',item.value->>'evidence','source_message_id',src.id,'source_timestamp',coalesce(src.message_time,src.created_at));
  merged:=jsonb_set(merged,array[item.key],incoming);
 end loop;
 saved:=jsonb_build_object('facts',merged,'issues',case when jsonb_typeof(p_issues)='array' and jsonb_array_length(p_issues)<=4 then p_issues else '[]'::jsonb end,'updated_at',now());
 insert into public.autoreply_documents(user_id,collection,id,data) values(p_workspace,'customer_facts',customer_key,saved)
 on conflict(user_id,collection,id) do update set data=excluded.data,updated_at=now();
 return saved;
end;
$function$;
revoke all on function public.autoreply_merge_customer_facts(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.autoreply_merge_customer_facts(text,text,jsonb,jsonb) to service_role;


create or replace function public.autoreply_invalidate_customer_fact_source()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
 if old.collection<>'inbox_messages' then return old;end if;
 update public.autoreply_documents d set data=jsonb_set(d.data,'{facts}',
  coalesce((select jsonb_object_agg(f.key,f.value) from jsonb_each(coalesce(d.data->'facts','{}'::jsonb)) f
   where f.value->>'source_message_id'<>old.id),'{}'::jsonb)),updated_at=now()
 where d.user_id=old.user_id and d.collection='customer_facts'
  and exists(select 1 from jsonb_each(coalesce(d.data->'facts','{}'::jsonb)) f where f.value->>'source_message_id'=old.id);
 update public.autoreply_documents d set data=jsonb_set(d.data,'{pending_ids}',
  coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(d.data->'pending_ids','[]'::jsonb)) value where value#>>'{}'<>old.id),'[]'::jsonb))
  ||jsonb_build_object('revision',coalesce((d.data->>'revision')::bigint,0)+1,'phase','collecting','quiet_until',clock_timestamp()),updated_at=now()
 where d.user_id=old.user_id and d.collection='dm_reply_turns' and coalesce(d.data->'pending_ids','[]'::jsonb) ? old.id;
 return old;
end;
$function$;
