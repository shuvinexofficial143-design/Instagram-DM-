-- Claims are committed before Meta dispatch. Expired dispatches become UNKNOWN, never blindly retried.
create or replace function public.autoreply_claim_campaign_batch() returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_rec record; v_jobs jsonb:='[]'; v_campaign public.autoreply_campaigns%rowtype; v_account jsonb; v_check jsonb; v_lease uuid;
begin
 update public.autoreply_campaign_recipients set status='unknown',reason='Delivery confirmation interrupted. Check Instagram before sending again.' where status='dispatching' and lease_until<now();
 for v_rec in select r.* from public.autoreply_campaign_recipients r join public.autoreply_campaigns c on c.id=r.campaign_id where r.status='queued' and c.status='running' order by c.created_at,r.id limit 5 for update of r skip locked loop
   select * into v_campaign from public.autoreply_campaigns where id=v_rec.campaign_id;
   select account into v_account from public.autoreply_instagram_tokens where user_id=v_campaign.workspace_id;
   v_check:=public.autoreply_campaign_eligibility(v_campaign.workspace_id,array[v_rec.sender_id])->0;
   if v_account is null or v_check->'eligible' is distinct from 'true'::jsonb then
     update public.autoreply_campaign_recipients set status='skipped',reason=case when v_account is null then 'Instagram disconnected' else v_check->>'reason' end where id=v_rec.id;continue;
   end if;
   v_lease:=gen_random_uuid();
   update public.autoreply_campaign_recipients set status='dispatching',lease_id=v_lease,lease_until=now()+interval '3 minutes' where id=v_rec.id;
   v_jobs:=v_jobs||jsonb_build_array(jsonb_build_object('id',v_rec.id,'lease_id',v_lease,'campaign_id',v_campaign.id,'workspace_id',v_campaign.workspace_id,'sender_id',v_rec.sender_id,'username',v_rec.username,'message',v_campaign.message,'account',v_account));
 end loop;
 update public.autoreply_campaigns c set status='completed',updated_at=now() where c.status='running' and not exists(select 1 from public.autoreply_campaign_recipients r where r.campaign_id=c.id and r.status in ('queued','dispatching'));
 return v_jobs;
end $$;
revoke all on function public.autoreply_claim_campaign_batch() from public,anon,authenticated;
grant execute on function public.autoreply_claim_campaign_batch() to service_role;

create or replace function public.autoreply_finish_campaign_recipient(p_id uuid,p_lease uuid,p_status text,p_message_id text,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_rec public.autoreply_campaign_recipients%rowtype; v_campaign public.autoreply_campaigns%rowtype;
begin
 if p_status='queued' then
   update public.autoreply_campaign_recipients r set status='queued',lease_id=null,lease_until=null where r.id=p_id and r.lease_id=p_lease and r.status='dispatching' and exists(select 1 from public.autoreply_campaigns c where c.id=r.campaign_id and c.status='paused');return;
 end if;
 if p_status not in ('sent','failed','skipped','unknown') then raise exception 'Invalid campaign result';end if;
 update public.autoreply_campaign_recipients set status=p_status,message_id=p_message_id,reason=left(coalesce(p_reason,''),500),sent_at=case when p_status='sent' then now() else null end where id=p_id and lease_id=p_lease and status='dispatching' returning * into v_rec;
 if not found then return;end if;
 select * into v_campaign from public.autoreply_campaigns where id=v_rec.campaign_id;
 if p_status='sent' then
   insert into public.autoreply_documents(user_id,collection,id,data) values(v_campaign.workspace_id,'inbox_messages',p_message_id,
     jsonb_build_object('from_ig_id',v_rec.sender_id,'from_username',coalesce(v_rec.username,v_rec.sender_id),'message_text',v_campaign.message,'direction','out','is_automated',true,'is_read',true,'delivery_status','sent','campaign_id',v_campaign.id,'timestamp',to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
   on conflict(user_id,collection,id) do nothing;
 end if;
 update public.autoreply_campaigns c set status='completed',updated_at=now() where c.id=v_campaign.id and c.status='running' and not exists(select 1 from public.autoreply_campaign_recipients r where r.campaign_id=c.id and r.status in ('queued','dispatching'));
end $$;
revoke all on function public.autoreply_finish_campaign_recipient(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.autoreply_finish_campaign_recipient(uuid,uuid,text,text,text) to service_role;

-- Per-recipient AI rule; never changes a user's globally paused automation.
create or replace function public.autoreply_campaign_followup(p_workspace text,p_sender text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id','campaign_'||c.id::text,'name',c.name,'status','active','trigger_type','dm_ai_conversation',
   'trigger_config',jsonb_build_object('all_or_keywords','ai_conversation','campaign_id',c.id),
   'actions',jsonb_build_array(jsonb_build_object('type','ai_chatbot','ai_system_instruction',c.prompt||E'\nInitial message sent to this customer: '||c.message),jsonb_build_object('type','send_dm','message_text','Our team will get back to you shortly.')))
 from public.autoreply_campaigns c join public.autoreply_campaign_recipients r on r.campaign_id=c.id
 where c.workspace_id=p_workspace and r.sender_id=p_sender and r.status='sent' and c.followup_enabled and c.status in ('running','completed') order by r.sent_at desc limit 1;
$$;
revoke all on function public.autoreply_campaign_followup(text,text) from public,anon,authenticated;
grant execute on function public.autoreply_campaign_followup(text,text) to service_role;

