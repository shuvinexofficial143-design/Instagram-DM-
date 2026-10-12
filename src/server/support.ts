import { authenticatedUser, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig.js';
import { cleanEnvironment } from './supabaseConfig.js';

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
const secret = () => cleanEnvironment(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
class SupportError extends Error { constructor(message:string,public status=400){super(message);} }
function text(value:unknown,max:number){return typeof value==='string'?value.trim().slice(0,max+1):'';}
function validText(value:unknown,max:number,min=1){const v=text(value,max);if(v.length<min||v.length>max)throw new SupportError('Please enter between '+min+' and '+max+' characters.');return v;}
async function db(path:string,method:'GET'|'POST'|'PATCH'='GET',body?:unknown){
  const key=secret();
  if(!key)throw new SupportError('Support service is temporarily unavailable.',503);
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const res=await fetch(SUPABASE_URL+'/rest/v1/'+path,{
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
  const r=await fetch(SUPABASE_URL+'/auth/v1/user',{
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
function methodNotAllowed(res:any,allowed:string){res.setHeader('Allow',allowed);return res.status(405).json({ok:false,error:'Method not allowed.'});}
export default async function handler(req:any,res:any){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const user=await authenticatedUser(req);
    if(!user?.id)return res.status(401).json({ok:false,error:'Sign in to contact support.'});
    const action=String(req.query?.action||'support-list').replace(/^support-/, '');
    const adminActions=['admin-list','admin-update'];
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
        return res.status(200).json({ok:true,ticket,messages});
      }
      if(action==='admin-thread'){
        const admin=await verifiedAdmin(req,user.id);
        if(!admin)return res.status(403).json({ok:false,error:'Administrator access required.'});
        const ticket=await getTicket(String(req.query?.id||''),user.id,true);
        const messages=await db('autoreply_support_messages?select='+selectMessage+'&ticket_id=eq.'+encodeURIComponent(ticket.id)+'&order=created_at.asc&limit=300');
        return res.status(200).json({ok:true,ticket,messages});
      }
      return res.status(404).json({ok:false,error:'Unknown support action.'});
    }
    if(req.method!=='POST')return methodNotAllowed(res,'GET, POST');
    if(JSON.stringify(req.body||{}).length>13000)throw new SupportError('Request is too large.',413);
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
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
      return res.status(200).json({ok:true,message:rows[0]});
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
      return res.status(200).json({ok:true,ticket:rows[0]});
    }
    return res.status(404).json({ok:false,error:'Unknown support action.'});
  }catch(err:any){
    if(!(err instanceof SupportError))console.error('[SUPPORT_API_ERROR]',{name:err?.name||'Error'});
    const status=err instanceof SupportError?err.status:503;
    return res.status(status).json({ok:false,error:err instanceof SupportError?err.message:'Support service is temporarily unavailable. Please try again.'});
  }
}
