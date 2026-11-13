-- Conversation navigation is derived from retained scoped messages, never an order-placement claim.
create or replace function public.autoreply_conversation_continuity(p_workspace text,p_sender text,p_exclude_message text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare identity jsonb; aliases text[]; acknowledged record; remembered record; is_returning boolean; discussed boolean; stage text;
begin
 identity:=public.autoreply_memory_identity(p_workspace,p_sender);
 select array_agg(value) into aliases from jsonb_array_elements_text(identity->'aliases') value;
 select exists(select 1 from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
  and data->>'from_ig_id'=any(aliases) and id<>coalesce(p_exclude_message,'') and data->>'direction' in ('in','out')
  and coalesce(data->>'delivery_status','sent')='sent' and coalesce(data->>'is_test','false')<>'true'
  and nullif(trim(data->>'message_text'),'') is not null) into is_returning;
 if exists(select 1 from public.autoreply_memory_settings where workspace_id=p_workspace and not enabled)
  or not coalesce((select enabled from public.autoreply_memory_runtime where id=1),true) then
  return jsonb_build_object('returning',is_returning,'stage',case when is_returning then 'returning' else 'new' end,'placement_status','not_verified','acknowledgement',null);
 end if;
 select id,data,message_time into acknowledged from public.autoreply_documents where user_id=p_workspace and collection='inbox_messages'
  and data->>'from_ig_id'=any(aliases) and data->>'direction'='out' and coalesce(data->>'is_test','false')<>'true'
  and coalesce(data->>'delivery_status','sent')='sent'
  and data->>'message_text' ~* '(your[[:space:]]+order([[:space:]]+request)?|order[[:space:]]+request).{0,35}(is|was|has been|successfully).{0,15}(confirmed|accepted)|आपका.{0,15}(ऑर्डर|आर्डर).{0,25}(कन्फर्म|कंफर्म|पुष्टि).{0,20}(हो गया|हो चुका|है)'
  and data->>'message_text' !~* '[?]|क्या|\m(if|not|never|will|would|could)\M|नहीं|हो जाएगा|करेंगे'
  order by message_time desc,id desc limit 1;
 select summary,facts into remembered from public.autoreply_customer_memory where workspace_id=p_workspace
  and account_id=identity->>'account_id' and (conversation_id=identity->>'conversation_id' or conversation_id=any(aliases))
  order by (conversation_id=identity->>'conversation_id') desc,summary_checkpoint desc limit 1;
 is_returning:=is_returning or nullif(remembered.summary,'') is not null or coalesce(remembered.facts<>'{}'::jsonb,false);
 discussed:=coalesce(remembered.facts ? 'order_details',false) or coalesce(remembered.summary ~* '\morder\M|ऑर्डर|आर्डर',false);
 stage:=case when acknowledged.id is not null then 'order_request_acknowledged' when discussed then 'order_discussed' when is_returning then 'returning' else 'new' end;
 return jsonb_build_object('returning',is_returning,'stage',stage,'placement_status','not_verified',
  'acknowledgement',case when acknowledged.id is not null then jsonb_build_object('source_message_id',acknowledged.id,'at',acknowledged.message_time,
   'source_role',case when acknowledged.data->'is_automated'='true'::jsonb then 'ai' else 'owner' end,'text',left(acknowledged.data->>'message_text',500)) else null end);
end $$;
revoke all on function public.autoreply_conversation_continuity(text,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_conversation_continuity(text,text,text) to service_role;

-- Preserve all current context/scoping/CAS behavior; add lifecycle evidence to its existing snapshot.
do $$
declare definition text; old_stage text:=$old$stage:=case when m.facts ? 'order_details'$old$;
begin
 select pg_get_functiondef('public.autoreply_conversation_context(text,text,text)'::regprocedure) into definition;
 if strpos(definition,$old$'memory_identity',identity,$old$)=0 then raise exception 'Unexpected conversation context definition';end if;
 definition:=replace(definition,$old$'memory_identity',identity,$old$,$new$'continuity',public.autoreply_conversation_continuity(p_workspace,p_sender,p_exclude_message),'memory_identity',identity,$new$);
 execute definition;
 select pg_get_functiondef('public.autoreply_finish_memory_job(text,text,text,uuid,bigint,jsonb,text,text[],text,jsonb)'::regprocedure) into definition;
 if strpos(definition,old_stage)=0 or strpos(definition,$old$lead_state=jsonb_build_object('stage',stage,'source','saved_customer_facts','updated_at',now())$old$)=0 then raise exception 'Unexpected memory completion definition';end if;
 definition:=replace(definition,old_stage,$new$stage:=case when public.autoreply_conversation_continuity(p_workspace,j.sender_id,'')->>'stage'='order_request_acknowledged' then 'order_request_acknowledged'
  when m.summary ~* '\morder\M|ऑर्डर|आर्डर' then 'order_discussed' when m.facts ? 'order_details'$new$);
 definition:=replace(definition,$old$lead_state=jsonb_build_object('stage',stage,'source','saved_customer_facts','updated_at',now())$old$,
  $new$lead_state=public.autoreply_conversation_continuity(p_workspace,j.sender_id,'')||jsonb_build_object('stage',stage,'source','conversation_evidence','updated_at',now())$new$);
 execute definition;
end $$;
