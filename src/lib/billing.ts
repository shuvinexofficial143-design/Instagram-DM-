import { auth } from './supabase';
export type BillingOrder = { orderId:string; planId:string; amount:number; currency:string; environment:string; status:string; createdAt:string; billingDays?:number; paidAt?:string; activatedAt?:string; expiresAt?:string; paymentExpiresAt?:string; activationStatus?:string; paymentId?:string; lastAttempt?:string };
export type BusinessDetails = {legalName:string;email:string;phone:string;address:string};
export type BillingConfiguration = {configured:boolean;mode:string;legalReady:boolean;appUrl:string;business:BusinessDetails};
export async function billingRequest(action:string, body?:unknown, orderId?:string) {
  const token = action === 'config' ? '' : await auth.currentUser?.getIdToken();
  if(action !== 'config' && !token) throw new Error('Sign in again to manage your payments.');
  const response = await fetch('/api/billing?action='+action+(orderId?'&order_id='+encodeURIComponent(orderId):''), {method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.ok) throw new Error(payload?.error||'Payments are temporarily unavailable. Check your existing order before paying again.');
  return payload;
}
