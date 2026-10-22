begin;
do $$
declare w text:=gen_random_uuid()::text; customer text:='77000009999222'; n integer; page jsonb; cursor jsonb; seen text[]; msg jsonb; stats jsonb;
 started timestamptz; full_payload jsonb; full_ms numeric; results jsonb:='[]'; total integer;
begin
 foreach n in array array[10,50,100,500] loop
  w:=gen_random_uuid()::text;
  insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile) values(w,w,'pagination-'||w,'{}');
  insert into public.autoreply_documents(user_id,collection,id,data)
  select w,'inbox_messages','page-'||g,jsonb_build_object('from_ig_id',customer,'from_username','page_customer','message_text','Test price conversation '||g,
   'direction',case when g%2=0 then 'out' else 'in' end,'is_automated',g%2=0,'timestamp',now()-interval '1 day'+g*interval '1 minute') from generate_series(1,n)g;
  started:=clock_timestamp();
  select jsonb_agg(data||jsonb_build_object('id',id)) into full_payload from public.autoreply_documents where user_id=w and collection='inbox_messages';
  full_ms:=extract(epoch from clock_timestamp()-started)*1000;
  started:=clock_timestamp();page:=public.autoreply_inbox_page(w,customer,null,null,50);
  results:=results||jsonb_build_array(jsonb_build_object('messages',n,'unpaginated_bytes',octet_length(full_payload::text),'unpaginated_db_ms',round(full_ms,3),'page_rows',jsonb_array_length(page->'messages'),'page_bytes',octet_length(page::text),'page_db_ms',round(extract(epoch from clock_timestamp()-started)*1000,3)));
  if jsonb_array_length(page->'messages')<>least(n,50) then raise exception 'First page incorrect for % messages',n;end if;
  seen:='{}';total:=0;
  loop
   for msg in select value from jsonb_array_elements(page->'messages') loop
    if msg->>'id'=any(seen) then raise exception 'Cursor repeated an existing message';end if;
    seen:=array_append(seen,msg->>'id');total:=total+1;
   end loop;
   exit when page->'has_more'='false'::jsonb;
   cursor:=page->'next_cursor';page:=public.autoreply_inbox_page(w,customer,(cursor->>'time')::timestamptz,cursor->>'id',50);
  end loop;
  if total<>n then raise exception 'Pagination dropped original history: % of %',total,n;end if;
  if jsonb_array_length(public.autoreply_conversation_context(w,customer,'')->'history')<>least(n,12) then raise exception 'AI context window grew with full history';end if;
  stats:=public.autoreply_inbox_analytics(w,now()-interval '2 days',now(),'UTC');
  if (stats->'current'->>'incoming')::integer<>n/2 or (stats->'current'->>'outgoing')::integer<>n/2 then raise exception 'Analytics counts were limited to an Inbox page: %',stats;end if;
  -- Fixtures remain inside this transaction and are rolled back together.
 end loop;
 perform set_config('autoreply.pagination_benchmark',results::text,true);
end $$;
select current_setting('autoreply.pagination_benchmark')::jsonb benchmark;
rollback;
