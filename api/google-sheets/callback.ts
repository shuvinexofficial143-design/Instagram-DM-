import crypto from 'node:crypto';
const CLIENT_ID=String(process.env.GOOGLE_SHEETS_CLIENT_ID||'').trim(),CLIENT_SECRET=String(process.env.GOOGLE_SHEETS_CLIENT_SECRET||'').trim();
const REDIRECT_URI=String(process.env.GOOGLE_SHEETS_REDIRECT_URI||'https://autoreplys.vercel.app/api/google-sheets/callback').trim(),SITE='https://autoreplys.vercel.app';
const SUPABASE_URL='https://dwgxmmftybxwpurgsxkx.supabase.co',SERVICE=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
const secret=()=>String(process.env.GOOGLE_SHEETS_STATE_SECRET||process.env.INSTAGRAM_APP_SECRET||'').trim();
const sign=(s:string)=>crypto.createHmac('sha256',secret()).update(s).digest('hex');
export default async function handler(req:any,res:any){
 const fail=(m:string)=>res.redirect(302,SITE+'/?sheets=error&message='+encodeURIComponent(m));
 if(req.method!=='GET')return res.status(405).end();if(!CLIENT_ID||!CLIENT_SECRET||!SERVICE()||!secret())return fail('Google Sheets backend is not configured.');
 const code=String(req.query?.code||''),state=String(req.query?.state||'');const [raw,sig]=state.split('.');
 if(!code||!raw||!sig||sign(raw)!==sig)return fail('Invalid Google authorization response.');
 let st:any;try{st=JSON.parse(Buffer.from(raw,'base64url').toString())}catch{return fail('Invalid Google authorization state.')}
 if(!st?.uid||Date.now()-Number(st.at)>10*60*1000)return fail('Google authorization expired. Please connect again.');
 const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:CLIENT_ID,client_secret:CLIENT_SECRET,redirect_uri:REDIRECT_URI,grant_type:'authorization_code'})});
 const t:any=await tr.json().catch(()=>null);if(!tr.ok||!t?.access_token)return fail(t?.error_description||'Google token exchange failed.');
 const pr=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+t.access_token}});const p:any=await pr.json().catch(()=>({}));
 const data={connected:true,email:String(p?.email||''),google_user_id:String(p?.id||''),access_token:t.access_token,refresh_token:String(t.refresh_token||''),expires_at:Date.now()+Number(t.expires_in||3600)*1000,scope:String(t.scope||''),updated_at:new Date().toISOString()};
 const sr=await fetch(SUPABASE_URL+'/rest/v1/autoreply_documents?on_conflict=user_id,collection,id',{method:'POST',headers:{apikey:SERVICE(),Authorization:'Bearer '+SERVICE(),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:st.uid,collection:'google_sheets_connections',id:'primary',data})});
 if(!sr.ok)return fail('Could not securely save Google Sheets connection.');
 return res.redirect(302,SITE+'/?sheets=connected');
}
