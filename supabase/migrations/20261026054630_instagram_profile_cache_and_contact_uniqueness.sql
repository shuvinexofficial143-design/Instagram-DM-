-- One messaging-scoped recipient per workspace, even if native and inbound
-- ingestion race. Usernames remain metadata and are never uniqueness keys.
create unique index if not exists autoreply_contacts_scoped_id_unique
 on public.autoreply_documents (user_id, (data->>'ig_user_id'))
 where collection='contacts' and data->>'ig_user_id' ~ '^[0-9]+$';

-- Only verified server-side Meta lookups may patch profile data. Merge against
-- current rows after Meta I/O; do not replace snapshots containing older tags,
-- activity counters or customer insights. This function never creates contacts.
create or replace function public.autoreply_refresh_instagram_profile(
 p_workspace text,p_sender text,p_profile jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids text[]; username text:=lower(regexp_replace(btrim(coalesce(p_profile->>'username','')),'^@',''));
 avatar text:=coalesce(p_profile->>'avatar_url',''); contact_patch jsonb:='{}'; message_patch jsonb:='{}'; contacts_changed integer; messages_changed integer;
begin
 if p_sender !~ '^[0-9]+$' or nullif(p_workspace,'') is null then raise exception 'Invalid profile identity' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('handoff:'||p_workspace||':'||p_sender,0));
 select array_agg(distinct value) filter(where value is not null) into ids from public.autoreply_documents d cross join lateral
  jsonb_array_elements_text(jsonb_build_array(d.id,d.data->>'ig_user_id')||coalesce(d.data->'ig_user_ids','[]')) value
 where user_id=p_workspace and collection='contacts' and (id=p_sender or data->>'ig_user_id'=p_sender or coalesce(data->'ig_user_ids','[]') ? p_sender);
 if ids is null then return jsonb_build_object('ok',false,'reason','contact_not_found');end if;
 if username ~ '^[a-z0-9._]{1,30}$' and username !~ '^[0-9]+$' then
  contact_patch:=contact_patch||jsonb_build_object('ig_username',username);
  message_patch:=message_patch||jsonb_build_object('from_username',username);
 end if;
 if (length(avatar)<=90000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') or
    (length(avatar)<=8000 and avatar ~ '^https://([a-zA-Z0-9-]+\.)*(cdninstagram\.com|fbcdn\.net|lookaside\.fbsbx\.com)/') then
  contact_patch:=contact_patch||jsonb_build_object('avatar_url',avatar);
  -- Keep the cached bytes once per contact, not on every transcript message.
  if avatar not like 'data:%' then message_patch:=message_patch||jsonb_build_object('from_avatar',avatar);end if;
 end if;
 if length(p_profile->>'avatar_source_url')<=8000 and p_profile->>'avatar_source_url' ~ '^https://([a-zA-Z0-9-]+\.)*(cdninstagram\.com|fbcdn\.net|lookaside\.fbsbx\.com)/' then
  contact_patch:=contact_patch||jsonb_build_object('avatar_source_url',p_profile->>'avatar_source_url');
  message_patch:=message_patch||jsonb_build_object('from_avatar',p_profile->>'avatar_source_url');
 end if;
 if nullif(btrim(p_profile->>'full_name'),'') is not null then contact_patch:=contact_patch||jsonb_build_object('full_name',left(p_profile->>'full_name',200));end if;
 if p_profile->>'follower_count' ~ '^[0-9]{1,12}$' then contact_patch:=contact_patch||jsonb_build_object('follower_count',(p_profile->>'follower_count')::bigint);end if;
 if contact_patch='{}'::jsonb then return jsonb_build_object('ok',false,'reason','profile_unavailable');end if;
 update public.autoreply_documents set data=data||contact_patch||jsonb_build_object('profile_refreshed_at',now())
 where user_id=p_workspace and collection='contacts' and (id=any(ids) or data->>'ig_user_id'=any(ids));
 get diagnostics contacts_changed=row_count;
 if message_patch<>'{}'::jsonb then
  update public.autoreply_documents set data=data||message_patch where user_id=p_workspace and collection='inbox_messages' and data->>'from_ig_id'=any(ids);
  get diagnostics messages_changed=row_count;
 else messages_changed:=0;end if;
 return jsonb_build_object('ok',true,'contactsUpdated',contacts_changed,'messagesUpdated',messages_changed);
end $$;
revoke all on function public.autoreply_refresh_instagram_profile(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.autoreply_refresh_instagram_profile(text,text,jsonb) to service_role;
notify pgrst,'reload schema';
