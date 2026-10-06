-- Production-schema integration check. Always rollback synthetic claims/rows.
begin;
do $$
declare v_row public.autoreply_runtime_context%rowtype; v_context jsonb;
begin
  if (select count(*) from public.autoreply_runtime_context) <> 1 then
    raise exception 'This single-account compatibility fixture needs exactly one runtime account';
  end if;
  select * into v_row from public.autoreply_runtime_context limit 1;
  v_context := public.autoreply_prepare_automation_event(array['__id_scope_fixture__'],'__claim_fixture__','__sender_fixture__');
  if v_context->>'user_id' is distinct from v_row.user_id or v_context->'quota' is null then
    raise exception 'Alternate Meta ID scope must resolve the sole connected workspace with fresh allowance';
  end if;
  v_context := public.autoreply_prepare_automation_event(array['__id_scope_fixture__'],'__claim_fixture__','__sender_fixture__');
  if v_context->>'message_state' <> 'duplicate' then raise exception 'Duplicate claim protection was lost'; end if;
  insert into public.autoreply_runtime_context(ig_user_id,user_id,account,automation_id,automation)
    values('__second_account_fixture__','__second_workspace_fixture__','{}'::jsonb,null,null);
  v_context := public.autoreply_prepare_automation_event(array['__unknown_scope_fixture__'],'__second_claim_fixture__','__sender_fixture__');
  if v_context is not null then raise exception 'Ambiguous multi-account events must never choose a workspace'; end if;
end;
$$;
rollback;
