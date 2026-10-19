import {auth} from './supabase';
export async function adminToolsRequest(action:string,body?:unknown,query:Record<string,string>={}){
 const token=await auth.currentUser?.getIdToken();if(!token)throw new Error('Sign in again to continue.');
 const params=new URLSearchParams({action,...query});const response=await fetch('/api/workspace-data?'+params,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',headers:{Authorization:'Bearer '+token,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Could not complete the administrator request.');return result;
}
