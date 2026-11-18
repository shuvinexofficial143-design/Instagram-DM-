import {createHash,randomBytes} from 'node:crypto';
import {adminDb,AdminOperationError} from './adminOperations.js';
import {isConfiguredAdmin} from './adminPolicy.js';
import {authenticatedUser} from './supabaseConfig.js';

const COOKIE='autoreply_admin_support';
const MAX_AGE=60*60*2;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const validWorkspace=/^(?:guest_[a-f0-9-]{16,}|[a-f0-9-]{36})$/i;
const esc=encodeURIComponent;
const cookieFor=(value:string,maxAge:number)=>COOKIE+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge;
export type AdminSupportSession={adminId:string;ownerId:string;initialWorkspaceId:string;expiresAt:string};

function cookie(req:any):string {
 const pair=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 if(!pair)return '';
 try{return decodeURIComponent(pair.slice(COOKIE.length+1));}catch{return '';}
}

/** Never accepts a customer ID from browser headers without a server-issued grant. */
export async function getAdminSupportSession(req:any,preverified?:{id:string;email?:string;email_confirmed_at?:string;is_anonymous?:boolean}|null):Promise<AdminSupportSession|null>{
 const secret=cookie(req);
 if(!/^[0-9a-f]{64}$/.test(secret))return null;
 const user=preverified||await authenticatedUser(req);
 if(!user?.id||!isConfiguredAdmin(user))return null;
 const records=await adminDb('autoreply_admin_support_sessions?select=customer_owner_id,initial_workspace_id,expires_at&admin_user_id=eq.'+esc(user.id)+'&token_hash=eq.'+hash(secret)+'&expires_at=gt.'+esc(new Date().toISOString())+'&limit=1');
 const row=records?.[0];
 if(!row||!validWorkspace.test(row.initial_workspace_id))return null;
 return {adminId:user.id,ownerId:row.customer_owner_id,initialWorkspaceId:row.initial_workspace_id,expiresAt:row.expires_at};
}
async function customerProfile(ownerId:string){
 const profile=(await adminDb('autoreply_profiles?select=user_id,email,display_name,avatar_url&user_id=eq.'+esc(ownerId)+'&limit=1'))?.[0];
 return {name:String(profile?.display_name||'Customer'),email:String(profile?.email||''),avatarUrl:String(profile?.avatar_url||'')};
}
export async function supportOperation(req:any,res:any,user:{id:string;email?:string;email_confirmed_at?:string;is_anonymous?:boolean}){
 const action=String(req.query?.action||'');
 res.setHeader('Cache-Control','private, no-store');
 if(action==='admin-support-status'){
   const session=await getAdminSupportSession(req,user);
   if(!session)return res.status(200).json({ok:true,active:false});
   return res.status(200).json({ok:true,active:true,...session,customer:await customerProfile(session.ownerId)});
 }
 if(action==='admin-support-stop'){
   if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method Not Allowed'});
   const session=await getAdminSupportSession(req,user);
   await adminDb('autoreply_admin_support_sessions?admin_user_id=eq.'+esc(user.id),'DELETE');
   res.setHeader('Set-Cookie',[cookieFor('',0),'autoreply_active_workspace=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
   if(session)await adminDb('autoreply_admin_audit_logs','POST',{admin_user_id:user.id,admin_email:user.email,action:'support_logout',entity_type:'customer_workspace',entity_id:session.initialWorkspaceId});
   return res.status(200).json({ok:true,active:false});
 }
 if(action!=='admin-support-start'||req.method!=='POST')return res.status(405).json({ok:false,error:'Method Not Allowed'});
 const workspaceId=String(req.body?.workspaceId||'');
 if(!validWorkspace.test(workspaceId))throw new AdminOperationError('Choose a valid customer workspace.',400);
 const membership=(await adminDb('autoreply_instagram_memberships?select=workspace_id,owner_user_id&workspace_id=eq.'+esc(workspaceId)+'&limit=1'))?.[0];
 const ownerId=membership?.owner_user_id||workspaceId;
 if(!membership){
   const existing=await adminDb('autoreply_profiles?select=user_id&user_id=eq.'+esc(workspaceId)+'&limit=1');
   if(!existing?.length)throw new AdminOperationError('Customer account was not found.',404);
 }
 if(ownerId===user.id)throw new AdminOperationError('Use your regular workspace for your own account.',400);
 const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+MAX_AGE*1000).toISOString();
 await adminDb('autoreply_admin_support_sessions?admin_user_id=eq.'+esc(user.id),'DELETE');
 await adminDb('autoreply_admin_support_sessions','POST',{admin_user_id:user.id,customer_owner_id:ownerId,initial_workspace_id:workspaceId,token_hash:hash(token),expires_at:expiresAt});
 await adminDb('autoreply_admin_audit_logs','POST',{admin_user_id:user.id,admin_email:user.email,action:'support_login',entity_type:'customer_workspace',entity_id:workspaceId,after_data:{owner_user_id:ownerId}});
 res.setHeader('Set-Cookie',[cookieFor(token,MAX_AGE),'autoreply_active_workspace='+esc(workspaceId)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+MAX_AGE]);
 return res.status(200).json({ok:true,active:true,ownerId,initialWorkspaceId:workspaceId,expiresAt,customer:await customerProfile(ownerId)});
}
export async function supportInstagramAccounts(ownerId:string){
 const members=await adminDb('autoreply_instagram_memberships?select=workspace_id,ig_user_id,profile,connection_archived&owner_user_id=eq.'+esc(ownerId)+'&connection_archived=eq.false&order=created_at.asc');
 const ids=(members||[]).map((m:any)=>m.workspace_id);
 const tokens=ids.length?await adminDb('autoreply_instagram_tokens?select=user_id,account&user_id=in.('+ids.map(esc).join(',')+')'):[];
 return (members||[]).flatMap((m:any)=>{
   const token=tokens.find((t:any)=>t.user_id===m.workspace_id)?.account;
   if(!token?.access_token)return [];
   return [{workspaceId:m.workspace_id,
   account:{
     id:token.id||m.ig_user_id||m.profile?.id||'',
     ig_user_id:token.ig_user_id||m.ig_user_id||m.profile?.ig_user_id||'',
     username:String(token.username||m.profile?.username||''),
     profile_pic_url:String(token.profile_pic_url||m.profile?.profile_pic_url||''),
     account_type:m.profile?.account_type||'BUSINESS',
     status:token.status||'connected',
     connected_at:m.profile?.connected_at||null,
     followers_count:m.profile?.followers_count||0,
     following_count:m.profile?.following_count||0,
     media_count:m.profile?.media_count||0,
   }}];
 });
}
