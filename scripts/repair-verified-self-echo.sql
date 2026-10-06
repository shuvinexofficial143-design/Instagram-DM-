-- Run with service/admin privileges only after inspecting the affected records.
-- Set autoreply.repair_workspace and autoreply.repair_sender in this transaction.
-- Opaque MID decoding here is restricted to this observed format; unknown
-- formats fail the evidence check rather than deleting unproven customer data.
do $$
declare
  workspace text := current_setting('autoreply.repair_workspace');
  sender text := current_setting('autoreply.repair_sender');
  verified_ids text[];
  incoming_count integer;
begin
  select count(*) into incoming_count from public.autoreply_documents
    where user_id=workspace and collection='inbox_messages'
      and data->>'from_ig_id'=sender;
  with decoded as (
    select id,data,substring(convert_from(decode(
      replace(replace(replace(replace(id,'ZD','='),'ZC','/'),'ZB','+'),'ZA','Z'),
      'base64'),'UTF8') from '^ig_dm_item:1:IGMessageID:[0-9]+:([0-9]+:[0-9]+)$') as item_identity
    from public.autoreply_documents
    where user_id=workspace and collection='inbox_messages' and id like 'aWdf%'
  )
  select array_agg(i.id) into verified_ids from decoded i
    where i.data->>'from_ig_id'=sender and i.data->>'direction'='in'
      and i.item_identity is not null and exists (
        select 1 from decoded o where o.data->>'direction'='out'
          and o.data->>'from_ig_id'<>sender and o.item_identity=i.item_identity
          and o.data->>'message_text'=i.data->>'message_text');
  if incoming_count=0 or incoming_count<>coalesce(array_length(verified_ids,1),0) then
    raise exception 'Unproven sender identity: refuse alias registration or cleanup';
  end if;
  if not exists(select 1 from public.autoreply_instagram_tokens where user_id=workspace) then
    raise exception 'Connected account missing';
  end if;
  update public.autoreply_instagram_tokens set account=jsonb_set(account,'{own_sender_ids}',
    (select jsonb_agg(distinct value) from jsonb_array_elements(
      coalesce(account->'own_sender_ids','[]'::jsonb) || jsonb_build_array(sender))),true)
    where user_id=workspace;
  -- The token trigger refreshes the runtime snapshot including the verified alias.
  insert into public.autoreply_documents(user_id,collection,id,data)
    select workspace,'self_echo_archive',collection||':'||id,
      jsonb_build_object('original_collection',collection,'original_id',id,
        'original_data',data,'reason','verified_own_message_echo','archived_at',now())
    from public.autoreply_documents where user_id=workspace and (
      (collection='inbox_messages' and id=any(verified_ids)) or
      (collection in ('contacts','customer_insights') and id=sender))
    on conflict(user_id,collection,id) do nothing;
  delete from public.autoreply_documents d where d.user_id=workspace and (
    (d.collection='inbox_messages' and d.id=any(verified_ids)) or
    (d.collection in ('contacts','customer_insights') and d.id=sender))
    and exists(select 1 from public.autoreply_documents a where a.user_id=workspace
      and a.collection='self_echo_archive' and a.id=d.collection||':'||d.id);
end $$;
