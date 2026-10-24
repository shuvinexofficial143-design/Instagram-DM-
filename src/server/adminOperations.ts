import {cleanEnvironment,SUPABASE_URL,upstreamFetch} from './supabaseConfig.js';
export const adminOperationMethods:Record<string,string>={
 'admin-handoffs':'GET','admin-handoff-detail':'GET','admin-handoff-action':'POST','admin-handoff-reply':'POST',
 'admin-workspaces':'GET','admin-workspace':'GET','admin-automation-save':'POST','admin-automation-status':'POST','admin-automation-delete':'POST','admin-automation-restore':'POST',
 'admin-campaign-preview':'POST','admin-campaign-create':'POST','admin-campaign-list':'GET','admin-campaign-detail':'GET','admin-campaign-action':'POST','admin-campaign-update':'POST',
};
export class AdminOperationError extends Error{constructor(message:string,public status=400){super(message);}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ws=/^(?:guest_[a-f0-9-]{16,}|[a-f0-9-]{36})$/i;
export async function adminDb(path:string,method='GET',body?:unknown){
 const key=cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
 if(!key)throw new AdminOperationError('Administrator storage is unavailable.',503);
 const r=await upstreamFetch(SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},...(body!==undefined?{body:JSON.stringify(body)}:{})},'Administrator storage',20000);
 const data=await r.json().catch(()=>null);
 if(!r.ok)throw new AdminOperationError(r.status>=500?'Administrator storage is temporarily unavailable.':String(data?.message||'This change could not be saved.'),r.status>=500?503:400);
 return data;
}
export function parseCampaignIdentifiers(value:unknown):string[]{
 if(typeof value!=='string'||value.length>30000)throw new AdminOperationError('Paste up to 500 Instagram IDs.');
 const list=[...new Set(value.split(/[\s,;]+/).map(s=>s.trim().replace(/^@/,'').toLowerCase()).filter(Boolean))];
 if(!list.length||list.length>500||list.some(s=>!/^\w[\w.]{0,99}$/.test(s)))throw new AdminOperationError('Use 1–500 Instagram usernames or numeric conversation IDs.');return list;
}
export function validateAdminAutomation(value:any){
 if(!value||!/^auto_[\w-]{4,}$/.test(value.id||'')||typeof value.name!=='string'||!value.name.trim()||value.name.length>120||!['dm','comment','story_reply','dm_ai_conversation'].includes(value.trigger_type)||!['active','paused'].includes(value.status)||!Array.isArray(value.actions)||!value.actions.length||value.actions.length>20||JSON.stringify(value).length>100000)throw new AdminOperationError('Enter a valid automation name, type, status and reply.');
 for(const action of value.actions){
  if(!['send_dm','reply_comment','add_delay','add_tag','ai_chatbot','auto_like_comment'].includes(action.type))throw new AdminOperationError('Unsupported automation action.');
  if(action.type==='ai_chatbot'&&(typeof action.ai_system_instruction!=='string'||!action.ai_system_instruction.trim()||action.ai_system_instruction.length>10000))throw new AdminOperationError('Enter AI instructions of up to 10,000 characters.');
  if(['message_text','comment_reply_text'].some(k=>action[k]!==undefined&&(typeof action[k]!=='string'||action[k].length>1000)))throw new AdminOperationError('Replies must be 1,000 characters or fewer.');
  if(action.type==='add_delay'&&(!Number.isFinite(action.delay_seconds)||action.delay_seconds<0||action.delay_seconds>20))throw new AdminOperationError('Delay must be between 0 and 20 seconds.');
  if(action.type==='send_dm'&&!String(action.message_text||'').trim()&&!action.catalog_id)throw new AdminOperationError('Enter a reply message or choose a catalog.');
  if(action.type==='reply_comment'&&!String(action.comment_reply_text||'').trim())throw new AdminOperationError('Enter a comment reply.');
  if(action.buttons&&(!Array.isArray(action.buttons)||action.buttons.length>3||action.buttons.some((b:any)=>!/^https?:\/\//.test(b.url||''))))throw new AdminOperationError('Use up to three valid website links.');
 }
 if(value.trigger_config?.all_or_keywords==='keywords'&&(!Array.isArray(value.trigger_config.keywords)||!value.trigger_config.keywords.length||value.trigger_config.keywords.some((s:any)=>typeof s!=='string'||!s.trim()||s.length>120)))throw new AdminOperationError('Enter at least one valid keyword.');
 if((value.trigger_config?.media_scope==='specific_media'||value.trigger_config?.story_scope==='specific_story'||value.trigger_config?.post_scope==='specific_post')&&!/^\d+$/.test(value.trigger_config?.selected_media_id||''))throw new AdminOperationError('Enter the selected post or story media ID.');
 if(value.trigger_type==='dm_ai_conversation'&&!value.actions.some((a:any)=>a.type==='ai_chatbot'))throw new AdminOperationError('AI automation requires AI instructions.');
 if(value.trigger_type==='dm_ai_conversation'&&value.trigger_config?.data_fields&&(!Array.isArray(value.trigger_config.data_fields)||value.trigger_config.data_fields.length>30||value.trigger_config.data_fields.some((s:any)=>typeof s!=='string'||s.length>80)))throw new AdminOperationError('Use up to 30 customer-data fields.');
 if(value.trigger_type!=='dm_ai_conversation'){
  const {data_capture_enabled:_enabled,data_fields:_fields,sheet_fields:_sheetFields,...config}=value.trigger_config||{};
  return {...value,trigger_config:{...config,data_capture_enabled:false}};
 }
 return value;
}
const enc=encodeURIComponent;
async function workspaceExists(id:string){if(!ws.test(id))throw new AdminOperationError('Choose a valid workspace.');const member=await adminDb('autoreply_instagram_memberships?select=workspace_id,owner_user_id,profile&workspace_id=eq.'+enc(id));if(member[0])return member[0];const profile=await adminDb('autoreply_profiles?select=user_id&user_id=eq.'+enc(id));if(!profile[0])throw new AdminOperationError('Workspace not found.',404);return {workspace_id:id,owner_user_id:id,profile:{}};}
async function ownCampaign(id:string,actor:string){if(!uuid.test(id))throw new AdminOperationError('Invalid campaign.');const rows=await adminDb('autoreply_campaigns?id=eq.'+id+'&created_by=eq.'+actor+'&limit=1');if(!rows[0])throw new AdminOperationError('Campaign not found.',404);return rows[0];}
export async function runAdminOperation(req:any,user:{id:string;email?:string}){
 const action=String(req.query.action),b=req.body||{},workspace=String(b.workspaceId||req.query.workspaceId||'');
 if(action==='admin-handoffs'){
  if(req.query.summary==='1')return {ok:true,...await adminDb('rpc/autoreply_handoff_summary','POST',{})};
  const scope=req.query.status==='resumed'?'eq.resumed':'neq.resumed';
  const offset=Math.max(0,Math.min(100000,Number(req.query.offset)||0));
  const rows=await adminDb('autoreply_human_handoffs?status='+scope+'&order=created_at.desc&limit=51&offset='+offset);
  const ids=[...new Set(rows.map((r:any)=>r.workspace_id))];
  const members=ids.length?await adminDb('autoreply_instagram_memberships?select=workspace_id,profile&workspace_id=in.('+ids.map(enc).join(',')+')'):[];
  return {ok:true,hasMore:rows.length>50,handoffs:rows.slice(0,50).map((r:any)=>({...r,accountUsername:members.find((m:any)=>m.workspace_id===r.workspace_id)?.profile?.username||'Instagram account'}))};
 }
 if(action==='admin-handoff-detail'||action==='admin-handoff-action'){
  const id=String(req.query.id||b.id||'');if(!uuid.test(id))throw new AdminOperationError('Choose a handoff.');
  const rows=await adminDb('autoreply_human_handoffs?id=eq.'+id);const handoff=rows[0];if(!handoff)throw new AdminOperationError('Handoff not found.',404);
  if(action==='admin-handoff-action'){
   if(!['takeover','resume'].includes(b.operation))throw new AdminOperationError('Choose Take over or Resume AI.');
   if(handoff.status==='resumed')throw new AdminOperationError('This handoff has already been resumed.',409);
   const control=await adminDb('rpc/autoreply_set_thread_control','POST',{p_workspace:handoff.workspace_id,p_sender:handoff.sender_id,p_paused:b.operation!=='resume',p_username:handoff.username,p_handoff_id:handoff.id});
   await adminDb('autoreply_admin_audit_logs','POST',{admin_user_id:user.id,admin_email:user.email,action:'handoff_'+b.operation,entity_type:'human_handoff',entity_id:id});
   return {ok:true,control};
  }
  const records=await adminDb('autoreply_documents?user_id=eq.'+enc(handoff.workspace_id)+'&collection=eq.inbox_messages&data->>from_ig_id=eq.'+enc(handoff.sender_id)+'&order=created_at.desc&limit=50');
  const messages=records.map((r:any)=>({id:r.id,message_text:String(r.data?.message_text||''),direction:r.data?.direction,timestamp:r.data?.timestamp,is_automated:r.data?.is_automated===true})).reverse();
  return {ok:true,handoff,messages};
 }
 if(action==='admin-workspaces')return adminDb('rpc/autoreply_admin_workspace_directory','POST',{p_query:String(req.query.search||''),p_offset:Math.max(0,Math.min(100000,Number(req.query.offset)||0))});
 if(action==='admin-workspace'){
  const membership=await workspaceExists(workspace);
  const [documents,versions,entitlement]=await Promise.all([adminDb('autoreply_documents?select=id,collection,data&user_id=eq.'+enc(workspace)+'&collection=in.(automations,catalogs)&limit=1000'),adminDb('autoreply_admin_automation_versions?workspace_id=eq.'+enc(workspace)+'&order=created_at.desc&limit=100'),adminDb('rpc/autoreply_billing_entitlement','POST',{p_workspace_id:workspace})]);
  return {ok:true,membership,automations:documents.filter((d:any)=>d.collection==='automations').map((d:any)=>({...d.data,id:d.id})),catalogs:documents.filter((d:any)=>d.collection==='catalogs').map((d:any)=>({...d.data,id:d.id})),versions,entitlement};
 }
 if(action.startsWith('admin-automation-')){
  await workspaceExists(workspace);const operation=action.slice('admin-automation-'.length);let automation=b.automation;
  if(operation==='save')automation=validateAdminAutomation(automation);
  else {if(!/^auto_[\w-]{4,}$/.test(b.automationId||''))throw new AdminOperationError('Choose a valid automation.');automation={id:b.automationId,status:b.status,version_id:b.versionId};if(operation==='status'&&!['active','paused'].includes(b.status))throw new AdminOperationError('Invalid status.');if(operation==='restore'&&!uuid.test(b.versionId||''))throw new AdminOperationError('Choose a valid version.');}
  return adminDb('rpc/autoreply_admin_edit_automation','POST',{p_actor:user.id,p_email:user.email,p_workspace:workspace,p_operation:operation,p_automation:automation,p_override:b.overrideLimit===true});
 }
 if(action==='admin-campaign-list'){const offset=Math.max(0,Math.min(100000,Number(req.query.offset)||0));const rows=await adminDb('autoreply_campaigns?created_by=eq.'+user.id+'&order=created_at.desc,id.desc&limit=101&offset='+offset);return {ok:true,campaigns:rows.slice(0,100),hasMore:rows.length>100};}
 if(action==='admin-campaign-detail'){const campaign=await ownCampaign(String(req.query.id||''),user.id);return {ok:true,campaign,recipients:await adminDb('autoreply_campaign_recipients?campaign_id=eq.'+campaign.id+'&order=identifier&limit=500')};}
 if(action==='admin-campaign-update'){
  const campaign=await ownCampaign(String(b.id||''),user.id);
  if(campaign.status==='stopped')throw new AdminOperationError('Stopped campaigns cannot be edited.');
  if(typeof b.prompt!=='string'||b.prompt.length>10000||(b.followup===true&&!b.prompt.trim()))throw new AdminOperationError('Enter AI instructions of up to 10,000 characters.');
  const updated=await adminDb('autoreply_campaigns?id=eq.'+campaign.id+'&created_by=eq.'+user.id+'&status=eq.'+campaign.status,'PATCH',{prompt:b.prompt,followup_enabled:b.followup===true,updated_at:new Date().toISOString()});
  if(!updated?.length)throw new AdminOperationError('Campaign changed. Refresh and try again.',409);
  await adminDb('autoreply_admin_audit_logs','POST',{admin_user_id:user.id,admin_email:user.email,action:'campaign_update_ai',entity_type:'campaign',entity_id:campaign.id});return {ok:true};
 }
 if(action==='admin-campaign-action'){
  const campaign=await ownCampaign(String(b.id||''),user.id);if(!['start','pause','resume','stop','followup-on','followup-off'].includes(b.operation))throw new AdminOperationError('Invalid campaign action.');
  if(b.operation==='start'&&campaign.status!=='draft')return {ok:true};
  if(b.operation==='start'&&!(await adminDb('autoreply_campaign_recipients?select=id&campaign_id=eq.'+campaign.id+'&status=eq.queued&limit=1')).length)throw new AdminOperationError('This campaign has no eligible recipients.');
  if(b.operation==='resume'&&campaign.status!=='paused')throw new AdminOperationError('Only paused campaigns can be resumed.');
  if(b.operation==='pause'&&campaign.status!=='running')throw new AdminOperationError('Only running campaigns can be paused.');
  let updated:any;
  if(['followup-on','followup-off'].includes(b.operation)){
   if(campaign.status==='stopped')throw new AdminOperationError('Stopped campaigns cannot be restarted.');
   if(b.operation==='followup-on'&&!campaign.prompt.trim())throw new AdminOperationError('This campaign has no AI prompt.');
   updated=await adminDb('autoreply_campaigns?id=eq.'+campaign.id+'&created_by=eq.'+user.id+'&status=eq.'+campaign.status,'PATCH',{followup_enabled:b.operation==='followup-on',updated_at:new Date().toISOString()});
  }else updated=await adminDb('autoreply_campaigns?id=eq.'+campaign.id+'&created_by=eq.'+user.id+'&status=eq.'+campaign.status,'PATCH',{status:b.operation==='stop'?'stopped':b.operation==='pause'?'paused':'running',...(b.operation==='stop'?{followup_enabled:false}:{}),updated_at:new Date().toISOString()});
  if(!updated?.length)throw new AdminOperationError('Campaign changed. Refresh and try again.',409);
  await adminDb('autoreply_admin_audit_logs','POST',{admin_user_id:user.id,admin_email:user.email,action:'campaign_'+b.operation,entity_type:'campaign',entity_id:campaign.id});
  return {ok:true};
 }
 if(action==='admin-campaign-preview'||action==='admin-campaign-create'){
  const membership=await workspaceExists(workspace);if(membership.owner_user_id!==user.id)throw new AdminOperationError('Campaigns can only use your own connected Instagram accounts.',403);
  const identifiers=parseCampaignIdentifiers(b.identifiers);
  if(action==='admin-campaign-preview')return {ok:true,recipients:await adminDb('rpc/autoreply_campaign_eligibility','POST',{p_workspace:workspace,p_identifiers:identifiers})};
  if(!uuid.test(b.id||'')||typeof b.name!=='string'||typeof b.message!=='string'||typeof b.prompt!=='string')throw new AdminOperationError('Enter campaign details.');
  return adminDb('rpc/autoreply_create_campaign','POST',{p_actor:user.id,p_id:b.id,p_workspace:workspace,p_name:b.name,p_message:b.message,p_prompt:b.prompt,p_followup:b.followup===true,p_identifiers:identifiers});
 }
 throw new AdminOperationError('Unknown administrator operation.');
}
