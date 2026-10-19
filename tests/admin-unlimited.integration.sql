begin;
do $$
declare
 admin_id uuid:=gen_random_uuid(); customer_id uuid:=gen_random_uuid(); unverified_id uuid:=gen_random_uuid(); anonymous_id uuid:=gen_random_uuid();
 child_id text:=gen_random_uuid()::text;
 admin_email text:=gen_random_uuid()::text||'@admin-test.invalid';
 unverified_email text:=gen_random_uuid()::text||'@admin-test.invalid';
 anonymous_email text:=gen_random_uuid()::text||'@admin-test.invalid';
 entitlement jsonb; expected jsonb; result jsonb; after_used integer;
begin
 insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data)
 values(admin_id,admin_email,now(),false,'{}'),(customer_id,gen_random_uuid()::text||'@customer-test.invalid',now(),false,'{"role":"admin","unlimited":true}'),
 (unverified_id,unverified_email,null,false,'{}'),(anonymous_id,anonymous_email,now(),true,'{}');
 perform public.autoreply_sync_admin_allowlist(array[
   encode(extensions.digest(admin_email,'sha256'),'hex'),encode(extensions.digest(unverified_email,'sha256'),'hex'),encode(extensions.digest(anonymous_email,'sha256'),'hex')]);
 insert into public.autoreply_instagram_memberships(workspace_id,owner_user_id,ig_user_id,profile)
 values(child_id,admin_id::text,'__admin_limit_fixture_'||child_id,'{"username":"fixture"}');
 insert into public.autoreply_usage_monthly(user_id,month_key,total_messages,ai_replies)
 values(admin_id::text,to_char(now() at time zone 'utc','YYYY-MM'),400000,200000),
 (customer_id::text,to_char(now() at time zone 'utc','YYYY-MM'),400000,200000);
 entitlement:=public.autoreply_billing_entitlement(child_id);
 if entitlement->'unlimited' is distinct from 'true'::jsonb or entitlement->>'plan'<>'administrator' or
   entitlement->>'aiLimit' is not null or entitlement->>'normalLimit' is not null or
   entitlement->>'accounts' is not null or entitlement->>'automationLimit' is not null then raise exception 'Admin owner not unlimited';end if;
 if entitlement->>'aiUsed'<>'200000' or entitlement->>'normalUsed'<>'200000' then raise exception 'Usage was not preserved';end if;
 foreach result in array array[public.autoreply_billing_entitlement(customer_id::text),public.autoreply_billing_entitlement(unverified_id::text),public.autoreply_billing_entitlement(anonymous_id::text)] loop
   if result->'unlimited' is distinct from 'false'::jsonb then raise exception 'Unverified, anonymous or forged profile gained unlimited access';end if;
 end loop;
 expected:=public.autoreply_billing_entitlement_metered(customer_id::text);
 if public.autoreply_billing_entitlement(customer_id::text)-'unlimited'<>expected then raise exception 'Customer entitlement changed';end if;
 result:=public.autoreply_reserve_delivery_quota(child_id,'admin-unlimited-fixture',true);
 if result->'allowed' is distinct from 'true'::jsonb then raise exception 'Admin send blocked at quota';end if;
 result:=public.autoreply_reserve_delivery_quota(child_id,'admin-unlimited-fixture',true);
 if result->>'reason'<>'already_claimed' then raise exception 'Duplicate send was allowed';end if;
 perform public.autoreply_finish_delivery_quota(child_id,'admin-unlimited-fixture',false);
 select ai_replies into after_used from public.autoreply_usage_monthly where user_id=admin_id::text and month_key=to_char(now() at time zone 'utc','YYYY-MM');
 if after_used<>200000 then raise exception 'Confirmed send failure was not released';end if;
 result:=public.autoreply_reserve_delivery_quota(customer_id::text,'customer-limit-fixture',true);
 if result->>'reason'<>'ai_limit_reached' then raise exception 'Customer limit bypassed';end if;
 perform public.autoreply_sync_admin_allowlist('{}');
 if public.autoreply_billing_entitlement(child_id)->'unlimited' is distinct from 'false'::jsonb then raise exception 'Removed admin kept unlimited';end if;
 if has_function_privilege('authenticated','public.autoreply_sync_admin_allowlist(text[])','execute') or
   has_function_privilege('anon','public.autoreply_billing_entitlement(text)','execute') or
   has_function_privilege('authenticated','autoreply_private.owner_is_administrator(text)','execute') or
   has_table_privilege('authenticated','autoreply_private.admin_allowlist','select') then raise exception 'Administrator policy exposed to browsers';end if;
end $$;
rollback;
