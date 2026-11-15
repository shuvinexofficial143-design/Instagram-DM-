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
  if item.key<>all(array['name','phone','email','product','quantity','address','city','district','state','pincode','landmark','preferences']) then continue;end if;
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

-- The budget is deliberately a conservative UTF-8 byte bound. Leave room for
-- the complete business prompt, canonical facts and a protected recent window.
do $block$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='public.autoreply_memory_settings'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%input_token_budget%' loop
  execute format('alter table public.autoreply_memory_settings drop constraint %I',c.conname);
 end loop;
end;
$block$;
alter table public.autoreply_memory_settings add constraint autoreply_memory_settings_input_budget_check check(input_token_budget between 8192 and 262144);
alter table public.autoreply_memory_settings alter column input_token_budget set default 131072;
update public.autoreply_memory_settings set input_token_budget=131072,updated_at=now() where workspace_id='745f218a-462d-44f0-856b-6af95a7e0b65' and input_token_budget<131072;

-- Invalidate only fields derived from a removed source; preserve unrelated facts.
create or replace function public.autoreply_invalidate_customer_fact_source()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
 if old.collection<>'inbox_messages' then return old;end if;
 update public.autoreply_documents d set data=jsonb_set(d.data,'{facts}',
  coalesce((select jsonb_object_agg(f.key,f.value) from jsonb_each(coalesce(d.data->'facts','{}'::jsonb)) f
   where f.value->>'source_message_id'<>old.id),'{}'::jsonb)),updated_at=now()
 where d.user_id=old.user_id and d.collection='customer_facts'
  and exists(select 1 from jsonb_each(coalesce(d.data->'facts','{}'::jsonb)) f where f.value->>'source_message_id'=old.id);
 return old;
end;
$function$;
revoke all on function public.autoreply_invalidate_customer_fact_source() from public,anon,authenticated;
grant execute on function public.autoreply_invalidate_customer_fact_source() to service_role;
create or replace trigger invalidate_customer_fact_source after delete on public.autoreply_documents for each row execute function public.autoreply_invalidate_customer_fact_source();
