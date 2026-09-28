import crypto from 'node:crypto';
const CLIENT_ID=String(process.env.GOOGLE_SHEETS_CLIENT_ID||'').trim();
const CLIENT_SECRET=String(process.env.GOOGLE_SHEETS_CLIENT_SECRET||'').trim();
const REDIRECT_URI=String(process.env.GOOGLE_SHEETS_REDIRECT_URI||'https://autoreplys.vercel.app/api/google-sheets/callback').trim();
const SITE='https://autoreplys.vercel.app';
const SUPABASE_URL='https://dwgxmmftybxwpurgsxkx.supabase.co';
const SUPABASE_KEY='sb_publishable_gEZYQWqesZH1iFysqk5sHA_fTZLQQ08';
const cookie=(req:any,n:string)=>{for(const p of String(req.headers?.cookie||'').split(';')){const i=p.indexOf('=');if(i>0&&p.slice(0,i).trim()===n)return decodeURIComponent(p.slice(i+1).trim())}return''};
async function user(req:any){const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();if(!token)return null;const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});return r.ok?await r.json():null}
const secret=()=>String(process.env.GOOGLE_SHEETS_STATE_SECRET||process.env.INSTAGRAM_APP_SECRET||'').trim();
const sign=(s:string)=>crypto.createHmac('sha256',secret()).update(s).digest('hex');
export default async function handler(req:any,res:any){
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method Not Allowed'});
 if(!CLIENT_ID||!CLIENT_SECRET||!secret())return res.status(503).json({ok:false,error:'Google Sheets OAuth environment variables are not configured.'});
 const u=await user(req);if(!u?.id)return res.status(401).json({ok:false,error:'Sign in first.'});
 const nonce=crypto.randomBytes(12).toString('hex');const raw=Buffer.from(JSON.stringify({uid:u.id,nonce,at:Date.now()})).toString('base64url');const state=raw+'.'+sign(raw);
 const q=new URLSearchParams({client_id:CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',state});
 return res.redirect(302,'https://accounts.google.com/o/oauth2/v2/auth?'+q.toString());
}
