const SUPABASE_URL='https://dwgxmmftybxwpurgsxkx.supabase.co',PUB='sb_publishable_gEZYQWqesZH1iFysqk5sHA_fTZLQQ08',SERVICE=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
async function uid(req:any){const t=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();if(!t)return'';const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:PUB,Authorization:'Bearer '+t}});const u:any=r.ok?await r.json():null;return String(u?.id||'')}
export default async function handler(req:any,res:any){const u=await uid(req);if(!u)return res.status(401).json({ok:false,error:'Sign in first.'});if(!SERVICE())return res.status(503).json({ok:false,error:'Supabase service key missing.'});
 const r=await fetch(SUPABASE_URL+'/rest/v1/autoreply_documents?user_id=eq.'+encodeURIComponent(u)+'&collection=eq.google_sheets_connections&id=eq.primary&select=data',{headers:{apikey:SERVICE(),Authorization:'Bearer '+SERVICE()}});
 const rows:any[]=r.ok?await r.json():[];const d=rows?.[0]?.data||{};return res.status(200).json({ok:true,connected:Boolean(d.connected&&d.refresh_token),email:d.email||'',updated_at:d.updated_at||null});
}
