import { authenticatedWorkspace } from './supabaseConfig.js';
import { adminDb } from './adminOperations.js';
export default async function threadControl(req:any,res:any){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'Method Not Allowed'});}
 try{
  const owner=await authenticatedWorkspace(req);if(!owner)return res.status(401).json({ok:false,error:'Sign in to manage this conversation.'});
  const {senderId,paused}=req.body||{};
  if(typeof senderId!=='string'||!/^\d{5,30}$/.test(senderId)||typeof paused!=='boolean')return res.status(400).json({ok:false,error:'Choose a valid conversation and AI setting.'});
  const control=await adminDb('rpc/autoreply_set_thread_control','POST',{p_workspace:owner.id,p_sender:senderId,p_paused:paused});
  return res.status(200).json({ok:true,control});
 }catch(error:any){return res.status(error?.status||503).json({ok:false,error:error?.message||'Could not save conversation control.'});}
}
