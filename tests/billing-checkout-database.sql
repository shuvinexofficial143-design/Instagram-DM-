-- Run in a transaction that is rolled back. No provider call or real debit.
do $$
declare owner text:='checkout_test_'||gen_random_uuid()::text;
 old_id text:='ar_p_'||gen_random_uuid()::text;
 new_id text:='ar_p_'||gen_random_uuid()::text;
 business_id text:='ar_p_'||gen_random_uuid()::text;
 rid uuid:=gen_random_uuid(); o jsonb; again jsonb; selected jsonb; verified jsonb; expiry timestamptz;
 contact jsonb:='{"name":"Checkout Test","email":"test@example.invalid","phone":"9876543210"}'::jsonb;
begin
 o:=public.autoreply_reserve_billing_checkout(old_id,rid,owner,'starter','production',contact);
 assert (o->>'amount_inr')::int=299,'Starter price';
 assert (o->>'payment_expires_at')::timestamptz>now()+interval '299 seconds','Five minute deadline';
 again:=public.autoreply_reserve_billing_checkout('ar_p_'||gen_random_uuid()::text,rid,owner,'starter','production',contact||'{"name":"Changed"}'::jsonb);
 assert again->>'order_id'=old_id,'Duplicate request must retain identity';
 assert again->>'payment_expires_at'=o->>'payment_expires_at','Duplicate request must retain deadline';
 assert again->'customer_details'=contact,'Contact snapshot must remain immutable';
 selected:=public.autoreply_reserve_billing_checkout(new_id,gen_random_uuid(),owner,'pro','production',contact);
 assert (selected->>'amount_inr')::int=599,'Pro price';
 assert (select checkout_state='superseded' and status='creating' from public.autoreply_billing_orders where order_id=old_id),'Old financial row survives replacement';
 assert (select count(*)=2 from public.autoreply_billing_orders where owner_user_id=owner),'Both financial records retained';
 verified:=public.autoreply_confirm_billing_order(old_id,'990001',299,'INR','production');
 assert verified->>'status'='paid' and verified->>'activation_status'='review','Late superseded payment is retained for review';
 assert not exists(select 1 from public.autoreply_billing_subscriptions where owner_user_id=owner),'Old payment must not override new selection';
 verified:=public.autoreply_confirm_billing_order(new_id,'990002',599,'INR','production');
 assert verified->>'activation_status'='active','Current production plan activates';
 expiry:=(verified->>'access_expires_at')::timestamptz;
 verified:=public.autoreply_confirm_billing_order(new_id,'990002',599,'INR','production');
 assert (verified->>'access_expires_at')::timestamptz=expiry,'Duplicate confirmation must not extend twice';
 selected:=public.autoreply_reserve_billing_checkout(business_id,gen_random_uuid(),owner,'business','production',contact);
 assert (selected->>'amount_inr')::int=1299,'Business price';
 update public.autoreply_billing_orders set payment_expires_at=now()-interval '1 minute' where order_id=business_id;
 verified:=public.autoreply_confirm_billing_order(business_id,'990003',1299,'INR','production');
 assert verified->>'activation_status'='active','Expiry alone cannot discard verified delayed success';
 assert (select plan_id='business' from public.autoreply_billing_subscriptions where owner_user_id=owner),'Correct limits source';
 assert not has_function_privilege('anon','public.autoreply_reserve_billing_checkout(text,uuid,text,text,text,jsonb)','execute'),'Anonymous reservation forbidden';
 assert not has_function_privilege('authenticated','public.autoreply_close_billing_checkout(text,text)','execute'),'Browser mutation forbidden';
end $$;
