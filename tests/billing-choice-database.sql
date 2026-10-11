-- Synthetic owners only; execute in a transaction and roll back.
do $$
declare owner text:='choice_test_'||gen_random_uuid()::text;
 starter uuid:=gen_random_uuid(); pro uuid:=gen_random_uuid(); business uuid:=gen_random_uuid();
 old_id text:='ar_p_'||gen_random_uuid()::text; pro_id text:='ar_p_'||gen_random_uuid()::text;
 business_id text:='ar_p_'||gen_random_uuid()::text;
 contact jsonb:='{"name":"Choice Test","email":"test@example.invalid","phone":"9876543210"}'::jsonb;
 o jsonb; c jsonb; rejected boolean:=false;
begin
 perform public.autoreply_choose_billing_plan(owner,'production','starter',starter);
 o:=public.autoreply_reserve_billing_checkout(old_id,starter,owner,'starter','production',contact);
 perform public.autoreply_choose_billing_plan(owner,'production','pro',pro);
 assert (select checkout_state='superseded' and status='creating' from public.autoreply_billing_orders where order_id=old_id),'Choice supersedes old checkout before another order exists';
 assert (select count(*)=1 from public.autoreply_billing_orders where owner_user_id=owner),'Choice must not create a financial order';
 o:=public.autoreply_reserve_billing_checkout(pro_id,pro,owner,'pro','production',contact);
 perform public.autoreply_choose_billing_plan(owner,'production','pro',pro);
 assert (select checkout_state='active' from public.autoreply_billing_orders where order_id=pro_id),'Choice retry cannot close its own order';
 perform public.autoreply_choose_billing_plan(owner,'production','business',business);
 c:=public.autoreply_choose_billing_plan(owner,'production','pro',pro);
 assert not (c->>'current')::boolean,'Stale tab cannot become latest choice through retry';
 begin
   perform public.autoreply_reserve_billing_checkout('ar_p_'||gen_random_uuid()::text,starter,owner,'starter','production',contact);
   -- Existing old order is returned with its superseded state, never made payable.
   assert (select checkout_state='superseded' from public.autoreply_billing_orders where order_id=old_id),'Historical retry remains superseded';
   perform public.autoreply_reserve_billing_checkout('ar_p_'||gen_random_uuid()::text,gen_random_uuid(),owner,'pro','production',contact);
 exception when others then rejected:=true;
 end;
 assert rejected,'A new order with obsolete choice must be rejected';
 o:=public.autoreply_reserve_billing_checkout(business_id,business,owner,'business','production',contact);
 assert (o->>'amount_inr')::int=1299,'Newest plan and price';
 o:=public.autoreply_confirm_billing_order(pro_id,'990101',599,'INR','production');
 assert o->>'activation_status'='review','Late older payment recorded without activating';
 o:=public.autoreply_confirm_billing_order(business_id,'990102',1299,'INR','production');
 assert o->>'status'='paid' and o->>'activation_status'='active','Latest verified payment activates';
 assert (select count(*)=0 from public.autoreply_billing_orders where owner_user_id=owner and status<>'paid' and checkout_state='active'),'No old pending checkout after success';
 assert not has_function_privilege('anon','public.autoreply_choose_billing_plan(text,text,text,uuid)','execute'),'No anonymous selection';
 assert not has_table_privilege('authenticated','public.autoreply_checkout_choices','select'),'Selection records are server-only';
end $$;

do $$
declare owner text; o jsonb; entitlement jsonb; id text; standard_used int; ai_used int; expected_standard int; expected_ai int;
 contact jsonb:='{"name":"Bonus Test","email":"test@example.invalid","phone":"9876543210"}'::jsonb;
begin
 for standard_used,ai_used,expected_standard,expected_ai in values (0,0,1500,1500),(300,500,1200,1000),(1500,1500,0,0) loop
   owner:='bonus_test_'||gen_random_uuid()::text; id:='ar_p_'||gen_random_uuid()::text;
   insert into public.autoreply_usage_monthly(user_id,month_key,total_messages,ai_replies)
   values(owner,to_char(now() at time zone 'utc','YYYY-MM'),standard_used+ai_used,ai_used);
   o:=public.autoreply_reserve_billing_checkout(id,gen_random_uuid(),owner,'pro','production',contact);
   o:=public.autoreply_confirm_billing_order(id,'991'||standard_used::text,599,'INR','production');
   entitlement:=public.autoreply_billing_entitlement(owner);
   assert (entitlement->>'freeBonusMessages')::int=expected_standard,'Only unused Standard Free credits are added';
   assert (entitlement->>'freeBonusAi')::int=expected_ai,'Only unused AI Free credits are added';
   assert (entitlement->>'totalLimit')::int=25000+expected_standard,'No double counting of Standard bonus';
   assert (entitlement->>'aiLimit')::int=15000+expected_ai,'No double counting of AI bonus';
   assert (entitlement->>'baseMessageLimit')::int=25000,'Paid base stays separate';
   update public.autoreply_billing_subscriptions set carry_expires_at=now()-interval '1 second' where owner_user_id=owner;
   entitlement:=public.autoreply_billing_entitlement(owner);
   assert (entitlement->>'freeBonusMessages')::int=0 and (entitlement->>'freeBonusAi')::int=0,'Expired Free bonus is removed';
 end loop;
end $$;
