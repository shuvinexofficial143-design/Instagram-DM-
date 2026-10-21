CREATE OR REPLACE FUNCTION public.autoreply_claim_dm_context_v4(p_candidates text[], p_message_id text, p_query_key text, p_sender_id text, p_include_history boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    declare
      v_user_id text;
      v_account jsonb;
      v_automation_id text;
      v_automation jsonb;
      v_cached_reply text;
      v_history jsonb := '[]'::jsonb;
      v_message_state text := 'new';
    begin
      -- A disconnected/foreign entry must never inherit the sole connected workspace.
      with resolved as (
        select r.* from public.autoreply_runtime_context r
        join public.autoreply_instagram_tokens t on t.user_id=r.user_id
        where nullif(t.account->>'access_token','') is not null and (
          r.ig_user_id=any(p_candidates)
          or t.account->>'ig_scoped_id'=any(p_candidates)
          or t.account->>'user_id'=any(p_candidates)
          or exists(select 1 from unnest(p_candidates) candidate
             where coalesce(t.account->'own_sender_ids','[]'::jsonb) ? candidate)
        )
      )
      select r.user_id,r.account,r.automation_id,r.automation
      into v_user_id,v_account,v_automation_id,v_automation
      from resolved r where (select count(*) from resolved)=1;

      if v_user_id is null then return null; end if;

      v_message_state := public.autoreply_claim_message_only(
        v_user_id,p_message_id,p_query_key,p_sender_id
      );

      if v_message_state='new'
         and v_automation_id is not null
         and nullif(p_query_key,'') is not null then
        select response_text into v_cached_reply
        from public.autoreply_reply_cache
        where user_id=v_user_id
          and automation_id=v_automation_id
          and query_key=p_query_key
          and expires_at>now()
        limit 1;
      end if;

      if p_include_history
         and v_message_state='new'
         and v_cached_reply is null
         and nullif(p_sender_id,'') is not null then
        select messages into v_history
        from public.autoreply_dm_history
        where user_id=v_user_id and sender_id=p_sender_id;
        v_history := coalesce(v_history,'[]'::jsonb);
      end if;

      return jsonb_build_object(
        'user_id',v_user_id,
        'account',v_account,
        'automation',
          case when v_automation_id is null then null
               else coalesce(v_automation,'{}'::jsonb)
                 || jsonb_build_object('id',v_automation_id)
          end,
        'cached_reply',v_cached_reply,
        'history',v_history,
        'message_state',v_message_state
      );
    end;
    $function$
;

create or replace function public.autoreply_record_instagram_outbound(
 p_business_id text,p_sender_id text,p_recipient_id text,p_message_id text,
 p_text text,p_timestamp timestamptz,p_is_echo boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare workspace text; account jsonb; matches jsonb; username text; contact_id text; inserted integer;
begin
 if nullif(p_business_id,'') is null or p_recipient_id is null or p_recipient_id !~ '^\d{5,30}$'
    or nullif(p_message_id,'') is null or length(p_message_id)>2000 or nullif(trim(p_text),'') is null
    or p_timestamp is null or p_timestamp>now()+interval '5 minutes' then
   return jsonb_build_object('recorded',false,'reason','invalid_outgoing_message');
 end if;
 -- Resolve ONLY the verified event's business entry, never the recipient or a
 -- single-account fallback. This keeps two connected accounts' chats separate.
 select jsonb_agg(jsonb_build_object('workspace',r.user_id,'account',t.account)) into matches
 from public.autoreply_runtime_context r join public.autoreply_instagram_tokens t on t.user_id=r.user_id
 where (r.ig_user_id=p_business_id or t.account->>'id'=p_business_id or t.account->>'user_id'=p_business_id or t.account->>'ig_scoped_id'=p_business_id
   or coalesce(t.account->'own_sender_ids','[]'::jsonb) ? p_business_id)
   and nullif(t.account->>'access_token','') is not null;
 if coalesce(jsonb_array_length(matches),0)<>1 then
   return jsonb_build_object('recorded',false,'reason','unresolved_business_entry');
 end if;
 workspace:=matches->0->>'workspace';account:=matches->0->'account';
 if workspace is null then return jsonb_build_object('recorded',false,'reason','connected_account_not_found');end if;
 if p_recipient_id in (p_business_id,account->>'ig_user_id',account->>'id',account->>'user_id',account->>'ig_scoped_id')
    or coalesce(account->'own_sender_ids','[]'::jsonb) ? p_recipient_id then
   return jsonb_build_object('recorded',false,'reason','self_message');
 end if;
 if not coalesce(p_is_echo,false) and p_sender_id is distinct from p_business_id
    and p_sender_id is distinct from account->>'ig_user_id' and p_sender_id is distinct from account->>'ig_scoped_id'
    and not(coalesce(account->'own_sender_ids','[]'::jsonb) ? coalesce(p_sender_id,'')) then
   return jsonb_build_object('recorded',false,'reason','not_business_outgoing');
 end if;
 if public.autoreply_campaign_message_time(account->>'connection_history_start_at')>p_timestamp then
   return jsonb_build_object('recorded',false,'reason','before_connection_history_boundary');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||workspace||':'||p_recipient_id,0));
 select id,data->>'ig_username' into contact_id,username from public.autoreply_documents
 where user_id=workspace and collection='contacts' and (id=p_recipient_id or data->>'ig_user_id'=p_recipient_id
   or coalesce(data->'ig_user_ids','[]'::jsonb) ? p_recipient_id)
 order by (coalesce(data->>'ig_username','') ~ '^[0-9]+$'),id limit 1;
 contact_id:=coalesce(contact_id,p_recipient_id);
 insert into public.autoreply_documents(user_id,collection,id,data) values(workspace,'inbox_messages',p_message_id,
   jsonb_build_object('from_ig_id',p_recipient_id,'from_username',coalesce(nullif(username,''),p_recipient_id),
     'message_text',left(p_text,6000),'direction','out','is_automated',false,'is_read',true,
     'delivery_status','sent','source','instagram_echo','timestamp',to_char(p_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 on conflict(user_id,collection,id) do nothing;
 get diagnostics inserted=row_count;
 -- Preserve API/campaign attribution if Meta echoes a message already saved by
 -- our sender. Retried echoes cannot duplicate or overwrite it.
 insert into public.autoreply_documents(user_id,collection,id,data) values(workspace,'contacts',contact_id,
   jsonb_build_object('id',contact_id,'ig_user_id',p_recipient_id,'ig_username',coalesce(nullif(username,''),p_recipient_id),
     'created_at',to_char(p_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 on conflict(user_id,collection,id) do nothing;
 return jsonb_build_object('recorded',true,'duplicate',inserted=0,'workspace_id',workspace);
end $$;

-- Meta profile enrichment changes identity fields atomically, never transcript/control fields.
create function public.autoreply_enrich_instagram_contact(p_workspace text,p_sender text,p_username text,p_avatar text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids text[]; username text:=lower(regexp_replace(btrim(p_username),'^@','')); changed integer;
begin
 if username is null or username !~ '^[a-z0-9._]{1,30}$' or username ~ '^[0-9]+$' then
  return jsonb_build_object('ok',false,'reason','username_unavailable');end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||p_workspace||':'||p_sender,0));
 select array_agg(distinct value) into ids from public.autoreply_documents d cross join lateral
   jsonb_array_elements_text(jsonb_build_array(d.id,d.data->>'ig_user_id')||coalesce(d.data->'ig_user_ids','[]'::jsonb)) value
 where user_id=p_workspace and collection='contacts' and (id=p_sender or data->>'ig_user_id'=p_sender or coalesce(data->'ig_user_ids','[]'::jsonb) ? p_sender);
 ids:=coalesce(ids,array[p_sender]);
 update public.autoreply_documents set data=data||jsonb_build_object('ig_username',username,'profile_refreshed_at',now())||
   case when nullif(p_avatar,'') is not null then jsonb_build_object('avatar_url',p_avatar) else '{}'::jsonb end
 where user_id=p_workspace and collection='contacts' and (id=any(ids) or data->>'ig_user_id'=any(ids));
 update public.autoreply_documents set data=data||jsonb_build_object('from_username',username)||
   case when nullif(p_avatar,'') is not null then jsonb_build_object('from_avatar',p_avatar) else '{}'::jsonb end
 where user_id=p_workspace and collection='inbox_messages' and data->>'from_ig_id'=any(ids);
 get diagnostics changed=row_count;
 return jsonb_build_object('ok',true,'messagesUpdated',changed);
end $$;
revoke all on function public.autoreply_enrich_instagram_contact(text,text,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_enrich_instagram_contact(text,text,text,text) to service_role;

-- Conversation actions include historical numeric/username aliases too.
-- Delete only the caller's selected workspace records, including unloaded history.
create or replace function public.autoreply_delete_conversations(p_user_id text,p_contact_ids text[] default '{}',p_usernames text[] default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare targets text[]; message_count integer; contact_count integer;
begin
 if auth.uid() is null or not (p_user_id=auth.uid()::text or exists(
  select 1 from public.autoreply_instagram_memberships where workspace_id=p_user_id and owner_user_id=auth.uid()::text
 )) then raise exception 'You do not have access to this workspace.' using errcode='42501';end if;
 if coalesce(cardinality(p_contact_ids),0)>500 or coalesce(cardinality(p_usernames),0)>500 then
  raise exception 'Select at most 500 conversations at a time.' using errcode='22023';end if;
 select coalesce(array_agg(distinct key),'{}'::text[]) into targets from (
  select lower(regexp_replace(btrim(value),'^@','')) as key from unnest(coalesce(p_usernames,'{}'::text[])) value
  union all
  select lower(regexp_replace(btrim(coalesce(nullif(data->>'ig_username',''),data->>'ig_user_id')),'^@',''))
  from public.autoreply_documents where user_id=p_user_id and collection='contacts' and id=any(coalesce(p_contact_ids,'{}'::text[]))
 ) names where coalesce(key,'')<>'';
 select coalesce(array_agg(distinct value),'{}'::text[]) into targets from (
  select unnest(targets) value
  union all
  select lower(regexp_replace(btrim(value),'^@','')) from public.autoreply_documents d cross join lateral
   jsonb_array_elements_text(jsonb_build_array(d.id,d.data->>'ig_user_id',d.data->>'ig_username')||coalesce(d.data->'ig_user_ids','[]'::jsonb)) value
  where user_id=p_user_id and collection='contacts' and (
   id=any(targets) or lower(regexp_replace(btrim(data->>'ig_username'),'^@',''))=any(targets)
   or data->>'ig_user_id'=any(targets) or coalesce(data->'ig_user_ids','[]'::jsonb) ?| targets)
 ) all_keys where nullif(value,'') is not null;
 delete from public.autoreply_documents where user_id=p_user_id and collection='inbox_messages'
 and (lower(regexp_replace(btrim(data->>'from_username'),'^@',''))=any(targets) or data->>'from_ig_id'=any(targets));
 get diagnostics message_count=row_count;
 delete from public.autoreply_documents where user_id=p_user_id and collection='contacts' and id=any(coalesce(p_contact_ids,'{}'::text[]));
 get diagnostics contact_count=row_count;
 return jsonb_build_object('ok',true,'usernames',to_jsonb(targets),'messagesDeleted',message_count,'contactsDeleted',contact_count);
end $$;
revoke all on function public.autoreply_delete_conversations(text,text[],text[]) from public,anon;
grant execute on function public.autoreply_delete_conversations(text,text[],text[]) to authenticated;
notify pgrst,'reload schema';
