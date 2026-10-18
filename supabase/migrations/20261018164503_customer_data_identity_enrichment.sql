-- Enrich placeholder customer keys with the actual scoped Instagram identity.
create or replace function public.autoreply_capture_customer(p_workspace text,p_automation text,p_fields jsonb,p_customer text,p_username text,p_values jsonb,p_message text,p_at timestamptz,p_event jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.autoreply_data_collections; saved public.autoreply_customer_records; pair record; clean jsonb:='{}'; stamps jsonb:='{}'; event_at timestamptz; purchase boolean;
begin
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
$$;
notify pgrst,'reload schema';
