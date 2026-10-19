-- Support verified canonical and scoped business entry IDs without a single-account fallback.
create or replace function public.autoreply_record_instagram_outbound(
 p_business_id text,p_sender_id text,p_recipient_id text,p_message_id text,
 p_text text,p_timestamp timestamptz,p_is_echo boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare workspace text; account jsonb; matches jsonb; username text; inserted integer;
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
 where (r.ig_user_id=p_business_id or t.account->>'id'=p_business_id or t.account->>'user_id'=p_business_id
   or coalesce(t.account->'own_sender_ids','[]'::jsonb) ? p_business_id)
   and nullif(t.account->>'access_token','') is not null;
 if coalesce(jsonb_array_length(matches),0)<>1 then
   return jsonb_build_object('recorded',false,'reason','unresolved_business_entry');
 end if;
 workspace:=matches->0->>'workspace';account:=matches->0->'account';
 if workspace is null then return jsonb_build_object('recorded',false,'reason','connected_account_not_found');end if;
 if p_recipient_id in (p_business_id,account->>'ig_user_id',account->>'id',account->>'user_id')
    or coalesce(account->'own_sender_ids','[]'::jsonb) ? p_recipient_id then
   return jsonb_build_object('recorded',false,'reason','self_message');
 end if;
 if not coalesce(p_is_echo,false) and p_sender_id is distinct from p_business_id
    and p_sender_id is distinct from account->>'ig_user_id'
    and not(coalesce(account->'own_sender_ids','[]'::jsonb) ? coalesce(p_sender_id,'')) then
   return jsonb_build_object('recorded',false,'reason','not_business_outgoing');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||workspace||':'||p_recipient_id,0));
 select data->>'ig_username' into username from public.autoreply_documents
 where user_id=workspace and collection='contacts' and id=p_recipient_id;
 insert into public.autoreply_documents(user_id,collection,id,data) values(workspace,'inbox_messages',p_message_id,
   jsonb_build_object('from_ig_id',p_recipient_id,'from_username',coalesce(nullif(username,''),p_recipient_id),
     'message_text',left(p_text,6000),'direction','out','is_automated',false,'is_read',true,
     'delivery_status','sent','source','instagram_echo','timestamp',to_char(p_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 on conflict(user_id,collection,id) do nothing;
 get diagnostics inserted=row_count;
 -- Preserve API/campaign attribution if Meta echoes a message already saved by
 -- our sender. Retried echoes cannot duplicate or overwrite it.
 insert into public.autoreply_documents(user_id,collection,id,data) values(workspace,'contacts',p_recipient_id,
   jsonb_build_object('id',p_recipient_id,'ig_user_id',p_recipient_id,'ig_username',coalesce(nullif(username,''),p_recipient_id),
     'created_at',to_char(p_timestamp at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 on conflict(user_id,collection,id) do nothing;
 return jsonb_build_object('recorded',true,'duplicate',inserted=0);
end $$;
