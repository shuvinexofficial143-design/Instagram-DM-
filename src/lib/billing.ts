import { auth } from './supabase';
export type BillingOrder = { orderId:string; planId:string; amount:number; currency:string; environment:string; status:string; createdAt:string; paidAt?:string; activatedAt?:string; expiresAt?:string; activationStatus?:string; paymentId?:string; lastAttempt?:string };
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
let sdkPromise:Promise<void>|undefined;
export async function openCashfreeCheckout(sessionId:string,mode:string) {
  const win=window as any;
  if(!win.Cashfree) {
    if(!sdkPromise) sdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://sdk.cashfree.com/js/v3/cashfree.js';script.async=true;
      const timer=window.setTimeout(()=>{sdkPromise=undefined;script.remove();reject(new Error('Secure checkout took too long to load. Please try again.'));},15000);
      script.onload=()=>{window.clearTimeout(timer);resolve();};script.onerror=()=>{window.clearTimeout(timer);sdkPromise=undefined;script.remove();reject(new Error('Secure checkout could not load. Please try again.'));};document.head.appendChild(script);
    });
    await sdkPromise;
  }
  if(!win.Cashfree) throw new Error('Secure checkout is unavailable.');
  const result=await win.Cashfree({mode}).checkout({paymentSessionId:sessionId,redirectTarget:'_self'});
  if(result?.error) throw new Error('Checkout was not completed. Check your payment status before trying again.');
}
