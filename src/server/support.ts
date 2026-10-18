import { typedFetch as httpFetch } from './typedFetch.js';
import { authenticatedUser, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig.js';
import { cleanEnvironment } from './supabaseConfig.js';
import { randomUUID } from 'node:crypto';
import { notifySupportEvent } from './supportNotify.js';
import { billingConfig, cashfreeRequest } from './cashfree.js';

// All requests need a verified Supabase session. Only this server uses the
// service-role REST API; support tables have RLS and no client grants.
type TicketType = 'general'|'technical'|'payment'|'refund'|'cancellation'|'account_deletion';
type TicketStatus = 'open'|'in_review'|'waiting_customer'|'resolved'|'closed'|'approved'|'rejected'|'refund_initiated'|'refunded';
const types: TicketType[] = ['general','technical','payment','refund','cancellation','account_deletion'];
const statuses: TicketStatus[] = ['open','in_review','waiting_customer','resolved','closed','approved','rejected','refund_initiated','refunded'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderRef = /^[A-Za-z0-9_-]{8,120}$/;
const selectTicket = 'id,ticket_number,owner_user_id,ticket_type,subject,reason,order_id,status,admin_note,created_at,updated_at,last_message_at';
const selectMessage = 'id,ticket_id,sender_role,body,created_at';
const selectAttachment = 'id,ticket_id,filename,mime_type,byte_size,created_at';
const bucket = 'autoreply-support-private';
const secret = () => cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
class SupportError extends Error { constructor(message:string,public status=400){super(message);} }
function text(value:unknown,max:number){return typeof value==='string'?value.trim().slice(0,max+1):'';}
function validText(value:unknown,max:number,min=1){const v=text(value,max);if(v.length<min||v.length>max)throw new SupportError('Please enter between '+min+' and '+max+' characters.');return v;}
async function db(path:string,method:'GET'|'POST'|'PATCH'='GET',body?:unknown){
  const key=secret();
  if(!key)throw new SupportError('Support service is temporarily unavailable.',503);
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const res=await httpFetch(SUPABASE_URL+'/rest/v1/'+path,{
      method,signal:ctrl.signal,
      headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',
        ...(method!=='GET'?{Prefer:'return=representation'}:{})},
      ...(method!=='GET'?{body:JSON.stringify(body)}:{})
    });
    const raw=await res.text();
    if(!res.ok){console.error('[SUPPORT_DB_ERROR]',{status:res.status});throw new SupportError('Support service could not save your request. Try again.',503);}
    if(!raw)return [];
    return JSON.parse(raw);
  }finally{clearTimeout(timer);}
}
async function verifiedAdmin(req:any,uid:string):Promise<boolean>{
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
  const r=await httpFetch(SUPABASE_URL+'/auth/v1/user',{
    headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(8000)
  });
  if(!r.ok)return false;
  const identity:any=await r.json();
  if(identity?.id!==uid || !identity?.email_confirmed_at) return false;
  const email=String(identity.email||'').trim().toLowerCase();
  const allowed=new Set(['devsinghparmar9589@gmail.com',...String(process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)]);
  return allowed.has(email);
}
async function getTicket(id:string,uid:string,isAdmin:boolean){
  if(!uuid.test(id))throw new SupportError('Invalid ticket reference.');
  const filter='autoreply_support_tickets?select='+selectTicket+'&id=eq.'+encodeURIComponent(id)
    +(isAdmin?'':'&owner_user_id=eq.'+encodeURIComponent(uid))+'&limit=1';
  const rows=await db(filter);
  if(!rows[0])throw new SupportError('Ticket not found.',404);
  return rows[0];
}
async function ticketAttachments(id:string){return db('autoreply_support_attachments?select='+selectAttachment+'&ticket_id=eq.'+encodeURIComponent(id)+'&order=created_at.asc&limit=30');}
async function ownerEmail(uid:string){const p=await db('autoreply_profiles?select=email&user_id=eq.'+encodeURIComponent(uid)+'&limit=1');return String(p[0]?.email||'');}
function methodNotAllowed(res:any,allowed:string){res.setHeader('Allow',allowed);return res.status(405).json({ok:false,error:'Method not allowed.'});}
export default async function handler(req:any,res:any){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const user=await authenticatedUser(req);
    if(!user?.id)return res.status(401).json({ok:false,error:'Sign in to contact support.'});
    const action=String(req.query?.action||'support-list').replace(/^support-/, '');
    const adminActions=['admin-list','admin-update','admin-refund','admin-refund-status'];
    const isAdmin=adminActions.includes(action)?await verifiedAdmin(req,user.id):false;
    if(adminActions.includes(action)&&!isAdmin)return res.status(403).json({ok:false,error:'Support administrator access required.'});
    if(req.method==='GET'){
      if(action==='orders'){
        const rows=await db('autoreply_billing_orders?select=order_id,plan_id,amount_inr,status,created_at,environment,access_expires_at'
          +'&owner_user_id=eq.'+encodeURIComponent(user.id)+'&order=created_at.desc&limit=40');
        return res.status(200).json({ok:true,orders:rows});
      }
      if(action==='list'||action==='admin-list'){
        const url='autoreply_support_tickets?select='+selectTicket
          +(isAdmin?'':'&owner_user_id=eq.'+encodeURIComponent(user.id))
          +'&order=last_message_at.desc&limit=100';
        return res.status(200).json({ok:true,tickets:await db(url)});
      }
      if(action==='thread'){
        const ticket=await getTicket(String(req.query?.id||''),user.id,false);
        const messages=await db('autoreply_support_messages?select='+selectMessage+'&ticket_id=eq.'+encodeURIComponent(ticket.id)+'&order=created_at.asc&limit=300');
        return res.status(200).json({ok:true,ticket,messages,attachments:await ticketAttachments(ticket.id)});
      }
      if(action==='admin-thread'){
        const admin=await verifiedAdmin(req,user.id);
        if(!admin)return res.status(403).json({ok:false,error:'Administrator access required.'});
        const ticket=await getTicket(String(req.query?.id||''),user.id,true);
        const messages=await db('autoreply_support_messages?select='+selectMessage+'&ticket_id=eq.'+encodeURIComponent(ticket.id)+'&order=created_at.asc&limit=300');
        return res.status(200).json({ok:true,ticket,messages,attachments:await ticketAttachments(ticket.id)});
      }
      if(action==='admin-refund-status'){
        const ticket=await getTicket(String(req.query?.ticketId||''),user.id,true);
        if(ticket.ticket_type!=='refund')throw new SupportError('Not a refund ticket.');
        const existing=await db('autoreply_support_refunds?select=*&ticket_id=eq.'+encodeURIComponent(ticket.id)+'&limit=1');
        const reserved=existing[0];
        if(!reserved)return res.status(200).json({ok:true,refund:null});
        if(billingConfig().mode!== 'production')throw new SupportError('Switch payment environment to live before verifying production refunds.',409);
        try{
          const result=await cashfreeRequest('/orders/'+encodeURIComponent(reserved.order_id)+'/refunds/'+encodeURIComponent(reserved.refund_id));
          const status=String(result?.refund_status||'').toUpperCase();
          if(result?.order_id!==reserved.order_id || String(result?.refund_id)!==reserved.refund_id ||
              Number(result?.refund_amount)!==Number(reserved.amount_inr))
            throw new SupportError('Refund provider response failed payment verification.',503);
          const state=status==='SUCCESS'?'success':status==='PENDING'||status==='ONHOLD'||status==='INITIATED'?'initiated':'requires_review';
          const rows=await db('autoreply_support_refunds?ticket_id=eq.'+encodeURIComponent(ticket.id),'PATCH',{
            state,provider_status:status,provider_ref:String(result?.cf_refund_id||'').slice(0,100),updated_at:new Date().toISOString()
          });
          if(state==='success'){
            await db('autoreply_support_tickets?id=eq.'+encodeURIComponent(ticket.id),'PATCH',{status:'refunded',updated_at:new Date().toISOString()});
            // Never modify a later, unrelated paid purchase.
            await db('autoreply_billing_subscriptions?owner_user_id=eq.'+encodeURIComponent(reserved.owner_user_id)
              +'&last_order_id=eq.'+encodeURIComponent(reserved.order_id),'PATCH',{expires_at:new Date().toISOString()});
          }else if(state==='initiated'&&ticket.status!=='refund_initiated'){
            await db('autoreply_support_tickets?id=eq.'+encodeURIComponent(ticket.id),'PATCH',{status:'refund_initiated',updated_at:new Date().toISOString()});
          }
          return res.status(200).json({ok:true,refund:rows[0]||reserved});
        }catch(e:any){
          if(e instanceof SupportError)throw e;
          console.warn('[REFUND_RECONCILE_PENDING]',{name:e?.name||'provider_error'});
          return res.status(503).json({ok:false,error:'Cashfree refund status is unavailable. Do not initiate another refund.'});
        }
      }
      if(action==='attachment-link'){
        const id=String(req.query?.attachmentId||'');
        if(!uuid.test(id))throw new SupportError('Invalid attachment reference.');
        const isSupport=String(req.query?.asAdmin||'')==='1'&&await verifiedAdmin(req,user.id);
        const rows=await db('autoreply_support_attachments?select=id,ticket_id,object_path,mime_type&id=eq.'+encodeURIComponent(id)+'&limit=1');
        if(!rows[0])throw new SupportError('Attachment not found.',404);
        await getTicket(rows[0].ticket_id,user.id,isSupport);
        const key=secret();
        const response=await httpFetch(SUPABASE_URL+'/storage/v1/object/sign/'+bucket+'/'+rows[0].object_path,{
          method:'POST',
          headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
          body:JSON.stringify({expiresIn:180}),signal:AbortSignal.timeout(9000)
        });
        if(!response.ok)throw new SupportError('Unable to view this attachment.',503);
        const data:any=await response.json();
        if(!data?.signedURL)throw new SupportError('Unable to view this attachment.',503);
        const relative=String(data.signedURL||'');
        const signedURL=SUPABASE_URL+'/storage/v1'+(relative.startsWith('/')?relative:'/'+relative);
        if(!signedURL.startsWith(SUPABASE_URL+'/storage/v1/object/sign/'))
          throw new SupportError('Invalid secure attachment URL.',503);
        return res.status(200).json({ok:true,url:signedURL});
      }
      return res.status(404).json({ok:false,error:'Unknown support action.'});
    }
    if(req.method!=='POST')return methodNotAllowed(res,'GET, POST');
    const bodyBytes=JSON.stringify(req.body||{}).length;
    if(bodyBytes>(action==='attachment-upload'?2801000:13000))throw new SupportError('Request is too large.',413);
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    if(action==='attachment-upload'){
      const ticketId=String(body.ticketId||'');
      const admin=body.asAdmin===true&&await verifiedAdmin(req,user.id);
      const ticket=await getTicket(ticketId,user.id,admin);
      if(ticket.status==='closed')throw new SupportError('Cannot attach to closed tickets.',409);
      const imageType=String(body.mimeType||'');
      const allowed:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
      if(!allowed[imageType])throw new SupportError('Choose a PNG, JPG or WebP image.');
      const encoded=String(body.base64||'');
      if(!encoded||encoded.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        throw new SupportError('Image must be under 2 MB.',413);
      const bytes=Buffer.from(encoded,'base64');
      if(!bytes.length||bytes.length>2097152)throw new SupportError('Image must be under 2 MB.',413);
      const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const isJpeg=bytes.subarray(0,3).equals(Buffer.from([255,216,255]));
      const isWebp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
      if(!(imageType==='image/png'&&isPng||imageType==='image/jpeg'&&isJpeg||imageType==='image/webp'&&isWebp))
        throw new SupportError('Image contents do not match the file type.');
      const existing=await ticketAttachments(ticketId);
      if(existing.length>=5)throw new SupportError('Maximum five screenshots per ticket.',409);
      const name=text(body.filename,120).replace(/[\\/<>\u0000-\u001f]/g,'_')||'screenshot.'+allowed[imageType];
      const objectPath=ticket.owner_user_id+'/'+ticket.id+'/'+randomUUID()+'.'+allowed[imageType];
      const key=secret();
      const upstream=await httpFetch(SUPABASE_URL+'/storage/v1/object/'+bucket+'/'+objectPath,{
        method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':imageType,'x-upsert':'false'},
        body:bytes,signal:AbortSignal.timeout(15000)
      });
      if(!upstream.ok){console.error('[SUPPORT_UPLOAD_FAILED]',{status:upstream.status});throw new SupportError('Screenshot upload failed. Try again.',503);}
      const rows=await db('autoreply_support_attachments','POST',{
        ticket_id:ticket.id,owner_user_id:ticket.owner_user_id,object_path:objectPath,
        filename:name,mime_type:imageType,byte_size:bytes.length
      });
      return res.status(201).json({ok:true,attachment:rows[0]});
    }
    if(action==='create'){
      const ticketType=String(body.ticketType||'general') as TicketType;
      if(!types.includes(ticketType))throw new SupportError('Invalid request type.');
      const subject=validText(body.subject,160,4);
      const message=validText(body.message,5000,12);
      const reason=text(body.reason,400);
      let linkedOrder:string|null=null;
      if(ticketType==='refund'||ticketType==='cancellation'||ticketType==='payment'){
        linkedOrder=String(body.orderId||'').trim()||null;
        if((ticketType==='refund'||ticketType==='cancellation')&&!linkedOrder)
          throw new SupportError('Select the paid order for this request.');
        if(linkedOrder){
          if(!orderRef.test(linkedOrder))throw new SupportError('Invalid payment reference.');
          const owned=await db('autoreply_billing_orders?select=order_id,status,environment'
            +'&order_id=eq.'+encodeURIComponent(linkedOrder)
            +'&owner_user_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
          if(!owned[0])throw new SupportError('Payment does not belong to this account.',403);
          if(['refund','cancellation'].includes(ticketType)
            &&(owned[0].status!=='paid'||owned[0].environment!=='production'))
            throw new SupportError('Refund and cancellation requests require a verified live payment.');
          if(['refund','cancellation'].includes(ticketType)){
            const existing=await db('autoreply_support_tickets?select=id'
              +'&owner_user_id=eq.'+encodeURIComponent(user.id)
              +'&order_id=eq.'+encodeURIComponent(linkedOrder)
              +'&ticket_type=eq.'+ticketType
              +'&status=in.(open,in_review,waiting_customer,approved,refund_initiated)&limit=1');
            if(existing[0])throw new SupportError('An active request for this payment already exists.',409);
          }
        }
      }
      // Avoid unlimited anonymous-form spam and excessive ticket creation.
      const today=new Date().toISOString().slice(0,10);
      const todayTickets=await db('autoreply_support_tickets?select=id&owner_user_id=eq.'+encodeURIComponent(user.id)
        +'&created_at=gte.'+encodeURIComponent(today+'T00:00:00Z')+'&limit=10');
      if(todayTickets.length>=10)throw new SupportError('Daily request limit reached. Reply to an existing ticket or try tomorrow.',429);
      const tickets=await db('autoreply_support_tickets','POST',{
        owner_user_id:user.id,ticket_type:ticketType,subject,reason,
        order_id:linkedOrder,status:'open'
      });
      if(!tickets[0]?.id)throw new SupportError('Ticket could not be created.',503);
      const rows=await db('autoreply_support_messages','POST',{
        ticket_id:tickets[0].id,sender_user_id:user.id,sender_role:'customer',body:message
      });
      if(!rows[0]?.id)throw new SupportError('Ticket created, but message could not be saved. Please open the ticket.',503);
      await notifySupportEvent('created',tickets[0],await ownerEmail(user.id)).catch(()=>{});
      return res.status(201).json({ok:true,ticket:tickets[0]});
    }
    if(action==='reply'||action==='admin-reply'){
      const admin=action==='admin-reply'?await verifiedAdmin(req,user.id):false;
      if(action==='admin-reply'&&!admin)return res.status(403).json({ok:false,error:'Administrator access required.'});
      const ticket=await getTicket(String(body.ticketId||''),user.id,admin);
      if(ticket.status==='closed')throw new SupportError('This ticket is closed. Create a new ticket.',409);
      const message=validText(body.message,5000,1);
      const rows=await db('autoreply_support_messages','POST',{
        ticket_id:ticket.id,sender_user_id:user.id,sender_role:admin?'support':'customer',body:message
      });
      const nextStatus=admin?'waiting_customer':(ticket.status==='waiting_customer'?'in_review':ticket.status);
      await db('autoreply_support_tickets?id=eq.'+encodeURIComponent(ticket.id),'PATCH',{
        status:nextStatus,last_message_at:new Date().toISOString(),updated_at:new Date().toISOString()
      });
      await notifySupportEvent(admin?'support_replied':'customer_replied',ticket,admin?await ownerEmail(ticket.owner_user_id):'').catch(()=>{});
      return res.status(200).json({ok:true,message:rows[0]});
    }
    if(action==='admin-refund'){
      // Only the verified support administrator can initiate a full refund.
      // A separate review must already have marked this ticket as approved.
      const ticket=await getTicket(String(body.ticketId||''),user.id,true);
      if(ticket.ticket_type!=='refund'||ticket.status!=='approved'||!ticket.order_id)
        throw new SupportError('Only approved refund requests can be initiated.',409);
      if(process.env.CASHFREE_REFUNDS_ENABLED!=='true')
        throw new SupportError('Refund payouts are not enabled yet. Configure and verify the merchant workflow.',503);
      if(billingConfig().mode!=='production')throw new SupportError('Live payments are required for live refunds.',409);
      if(String(body.confirmRefund||'')!=='REFUND '+ticket.order_id)
        throw new SupportError('Confirm the exact order reference before refunding.',400);
      const existing=await db('autoreply_support_refunds?select=*&ticket_id=eq.'+encodeURIComponent(ticket.id)+'&limit=1');
      if(existing[0])return res.status(409).json({ok:false,error:'Refund already reserved. Check provider status; never create another refund.',refund:existing[0]});
      const o=await db('autoreply_billing_orders?select=order_id,owner_user_id,status,amount_inr,currency,environment,cf_payment_id'
         +'&order_id=eq.'+encodeURIComponent(ticket.order_id)
         +'&owner_user_id=eq.'+encodeURIComponent(ticket.owner_user_id)+'&limit=1');
      const order=o[0];
      if(!order||order.status!=='paid'||order.environment!=='production'||order.currency!=='INR'
        ||!Number.isSafeInteger(order.amount_inr)||order.amount_inr<=0||!order.cf_payment_id)
        throw new SupportError('Order has not been verified for a live full refund.',409);
      // Confirm the existing payment directly with provider before any write.
      const provider=await cashfreeRequest('/orders/'+encodeURIComponent(order.order_id));
      if(provider?.order_id!==order.order_id || provider?.order_status!=='PAID'
        ||provider?.order_currency!=='INR'||Number(provider?.order_amount)!==order.amount_inr)
        throw new SupportError('Cashfree does not confirm this original payment.',409);
      const refundId='arref_'+ticket.id.replaceAll('-','');
      // Immutable one-order reservation guarantees at most one payout call,
      // including parallel clicks and ambiguous Cashfree network failures.
      await db('autoreply_support_refunds','POST',{
        ticket_id:ticket.id,order_id:order.order_id,owner_user_id:order.owner_user_id,
        refund_id:refundId,amount_inr:order.amount_inr,state:'reserved'
      });
      let result:any;
      try{
        result=await cashfreeRequest('/orders/'+encodeURIComponent(order.order_id)+'/refunds','POST',{
          refund_id:refundId,refund_amount:order.amount_inr,refund_note:'Approved support ticket '+ticket.ticket_number,
          refund_speed:'STANDARD'
        },refundId);
      }catch(e:any){
        console.warn('[REFUND_PROVIDER_UNCERTAIN]',{name:e?.name||'provider_error'});
        return res.status(503).json({ok:false,error:'Refund has been reserved. Check Cashfree status before any further action; do not retry payout creation.'});
      }
      if(result?.order_id!==order.order_id || result?.refund_id!==refundId || Number(result?.refund_amount)!==order.amount_inr)
        throw new SupportError('Refund created but response needs manual provider verification. Do not retry.',503);
      const status=String(result?.refund_status||'').toUpperCase();
      const state=status==='SUCCESS'?'success':status==='PENDING'||status==='INITIATED'?'initiated':'requires_review';
      const rows=await db('autoreply_support_refunds?ticket_id=eq.'+encodeURIComponent(ticket.id),'PATCH',{
        state,provider_status:status,provider_ref:String(result?.cf_refund_id||'').slice(0,100),updated_at:new Date().toISOString()
      });
      await db('autoreply_support_tickets?id=eq.'+encodeURIComponent(ticket.id),'PATCH',{
        status:state==='success'?'refunded':state==='initiated'?'refund_initiated':'in_review',updated_at:new Date().toISOString()
      });
      if(state==='success'){
        await db('autoreply_billing_subscriptions?owner_user_id=eq.'+encodeURIComponent(order.owner_user_id)
          +'&last_order_id=eq.'+encodeURIComponent(order.order_id),'PATCH',{expires_at:new Date().toISOString()});
      }
      await notifySupportEvent('status_changed',ticket,await ownerEmail(ticket.owner_user_id)).catch(()=>{});
      return res.status(200).json({ok:true,refund:rows[0]});
    }
    if(action==='admin-update'){
      const ticket=await getTicket(String(body.ticketId||''),user.id,true);
      const status=String(body.status||'') as TicketStatus;
      if(!statuses.includes(status))throw new SupportError('Invalid ticket status.');
      const note=text(body.note,500);
      if(status==='rejected'&&!note)throw new SupportError('Explain why this request was rejected.');
      // Never change billing entitlement or trigger a Cashfree refund here.
      // Refund initiation requires a separately verified payment workflow.
      if(['refund_initiated','refunded'].includes(status))
        throw new SupportError('Refund settlement must be verified through the payment provider.',409);
      const rows=await db('autoreply_support_tickets?id=eq.'+encodeURIComponent(ticket.id),'PATCH',{
        status,admin_note:note||null,updated_at:new Date().toISOString()
      });
      await notifySupportEvent('status_changed',ticket,await ownerEmail(ticket.owner_user_id)).catch(()=>{});
      return res.status(200).json({ok:true,ticket:rows[0]});
    }
    return res.status(404).json({ok:false,error:'Unknown support action.'});
  }catch(err:any){
    if(!(err instanceof SupportError))console.error('[SUPPORT_API_ERROR]',{name:err?.name||'Error'});
    const status=err instanceof SupportError?err.status:503;
    return res.status(status).json({ok:false,error:err instanceof SupportError?err.message:'Support service is temporarily unavailable. Please try again.'});
  }
}
