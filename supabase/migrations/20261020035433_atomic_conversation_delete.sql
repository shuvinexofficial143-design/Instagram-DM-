-- Delete only the caller's selected workspace records, including unloaded history.
create function public.autoreply_delete_conversations(p_user_id text,p_contact_ids text[] default '{}',p_usernames text[] default '{}')
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
 delete from public.autoreply_documents where user_id=p_user_id and collection='inbox_messages'
 and lower(regexp_replace(btrim(coalesce(nullif(data->>'from_username',''),data->>'from_ig_id')),'^@',''))=any(targets);
 get diagnostics message_count=row_count;
 delete from public.autoreply_documents where user_id=p_user_id and collection='contacts' and id=any(coalesce(p_contact_ids,'{}'::text[]));
 get diagnostics contact_count=row_count;
 return jsonb_build_object('ok',true,'usernames',to_jsonb(targets),'messagesDeleted',message_count,'contactsDeleted',contact_count);
end $$;
revoke all on function public.autoreply_delete_conversations(text,text[],text[]) from public,anon;
grant execute on function public.autoreply_delete_conversations(text,text[],text[]) to authenticated;
notify pgrst,'reload schema';
