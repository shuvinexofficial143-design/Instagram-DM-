-- Preserve connected Instagram profile photos after Meta CDN URLs expire.
-- The trusted server downloads a verified bounded image; no access tokens are exposed.
-- This additive RPC updates only the photo field, with compare-and-set to avoid
-- clobbering an Instagram reconnect that happened during the network request.
create or replace function public.autoreply_cache_instagram_account_photo(
  p_workspace text,
  p_expected_photo text,
  p_cached_photo text
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  changed integer;
  stamp text := to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Private account-photo cache only' using errcode='42501';
  end if;
  if p_workspace is null or length(p_workspace) > 160
     or p_cached_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'
     or length(p_cached_photo) > 90000 then
    raise exception 'Invalid cached photo';
  end if;

  update public.autoreply_instagram_tokens t
  set account=jsonb_set(
     jsonb_set(t.account,'{profile_pic_url}',to_jsonb(p_cached_photo),true),
     '{profile_photo_cached_at}',to_jsonb(stamp),true
  )
  where t.user_id=p_workspace
    and coalesce(t.account->>'profile_pic_url','')=coalesce(p_expected_photo,'')
    and coalesce(t.account->>'access_token','')<>'';
  get diagnostics changed=row_count;
  if changed<>1 then return false; end if;

  update public.autoreply_instagram_memberships m
     set profile=jsonb_set(
         jsonb_set(coalesce(m.profile,'{}'::jsonb),'{profile_pic_url}',to_jsonb(p_cached_photo),true),
         '{profile_photo_cached_at}',to_jsonb(stamp),true
     )
   where m.workspace_id=p_workspace and not m.connection_archived;

  update public.autoreply_documents d
     set data=jsonb_set(
         jsonb_set(coalesce(d.data,'{}'::jsonb),'{profile_pic_url}',to_jsonb(p_cached_photo),true),
         '{profile_photo_cached_at}',to_jsonb(stamp),true
     )
   where d.user_id=p_workspace and d.collection='instagram_account' and d.id='primary';

  return true;
end;
$$;
revoke all on function public.autoreply_cache_instagram_account_photo(text,text,text)
  from PUBLIC,anon,authenticated;
grant execute on function public.autoreply_cache_instagram_account_photo(text,text,text)
  to service_role;
