import React,{useEffect,useMemo,useState} from 'react';
import {Gift,RotateCcw,ShieldCheck} from 'lucide-react';
import {adminToolsRequest} from '../../lib/adminTools';

type Mode='plan'|'custom'|'once'|'extra'|'unlimited'|'off';
type Props={
  workspaceId:string;
  entitlement:any;
  planEntitlement:any;
  history:any[];
  reload:()=>Promise<boolean>;
};
const presets=[500,1000,5000,10000,50000];
const fmt=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-IN'):'Unlimited';
const numericMode=(mode:Mode)=>mode==='custom'||mode==='once'||mode==='extra';

export function AdminAiAllowance({workspaceId,entitlement,planEntitlement,history,reload}:Props){
  const currentMode=(entitlement?.aiAllowanceMode||'plan') as Mode;
  const currentLimit=entitlement?.aiLimit;
  const [mode,setMode]=useState<Mode>(currentMode);
  const [limit,setLimit]=useState(String(currentLimit??1000));
  const [expiry,setExpiry]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const newest=history?.[0]?.id;
  useEffect(()=>{
    setMode(currentMode);
    setLimit(String(currentLimit??1000));
    setExpiry('');
  },[workspaceId,currentMode,currentLimit,newest]);
  const used=Math.max(0,Number(entitlement?.aiUsed)||0);
  const remaining=typeof currentLimit==='number' ? Math.max(0,currentLimit-used) : null;
  const active=currentMode!=='plan';
  const chosenValue=Number(limit);
  const validLimit=!numericMode(mode)||( /^\d{1,10}$/.test(limit)&&Number.isSafeInteger(chosenValue)&&chosenValue>=0&&chosenValue<=2147483647&&(mode!=='extra'||chosenValue>0));
  const planName=String(planEntitlement?.planName||entitlement?.planName||'Free');
  const planLimit=planEntitlement?.aiLimit;
  const currentExpiry=entitlement?.aiAllowanceExpiresAt;
  const explanation=useMemo(()=>{
    if(mode==='custom')return 'This number replaces the AI reply maximum for each UTC calendar month; it is not added to the plan.';
    if(mode==='once')return 'A one-time total allowance, counting AI replies sent since you grant it. It does not reset each month.';
    if(mode==='extra')return 'Add this many replies for the current UTC month. The extra allowance ends at the month boundary.';
    if(mode==='unlimited')return 'Remove the AI reply count limit until this override expires or you restore the plan.';
    if(mode==='off')return 'Pause new AI replies. Existing Instagram accounts, contacts and automations stay saved.';
    return 'Use the customer’s free or purchased plan. The customer’s billing record is never changed.';
  },[mode]);

  async function apply(nextMode:Mode=mode){
    setError('');setSuccess('');
    if(numericMode(nextMode)&&!validLimit){setError('Enter a whole number from 0 to 2,147,483,647. Extra replies must be greater than zero.');return;}
    if(expiry&&(!Number.isFinite(new Date(expiry).getTime())||new Date(expiry).getTime()<=Date.now())){
      setError('Choose a future date and time, or leave expiry empty.');return;
    }
    if(nextMode==='custom'&&chosenValue>100000&&!window.confirm('Grant more than 100,000 AI replies per month? AI usage has a real cost.')){
      return;
    }
    setBusy(true);
    try{
      const result=await adminToolsRequest('admin-ai-allowance',{
        workspaceId,mode:nextMode,limit:numericMode(nextMode)?chosenValue:null,
        expiresAt:nextMode==='plan'?null:expiry?new Date(expiry).toISOString():null
      });
      if(!result?.ok)throw Error('The server did not confirm the allowance.');
      const refreshed=await reload();
      if(!refreshed)throw Error('Allowance saved, but the workspace did not refresh. Refresh before editing again.');
      setSuccess(nextMode==='plan'
        ? 'Admin override removed. The customer is using their current free or purchased plan again.'
        : 'AI reply allowance saved and verified on the server. No purchase or plan change was made.');
      if(nextMode==='plan'){setMode('plan');setExpiry('');}
    }catch(e:any){setError(e?.message||'Could not save the customer’s AI replies.');}
    finally{setBusy(false);}
  }

  return <section className="at-ai-grant" aria-label="Free custom AI reply allowances">
    <div className="at-workspace-head">
      <div><h3><Gift size={19} aria-hidden="true"/>Free custom AI replies</h3>
        <p>Give this customer AI replies without asking them to purchase a plan.</p>
      </div>
      <span className={'at-pill '+(active?'at-active':'')}>{active?'Admin override active':'Normal plan'}</span>
    </div>
    <div className="at-ai-stats">
      <div><small>Customer’s plan</small><strong>{planName}</strong></div>
      <div><small>Plan AI replies/month</small><strong>{fmt(planLimit)}</strong></div>
      <div><small>Current AI limit</small><strong>{fmt(currentLimit)}</strong></div>
      <div><small>Used this month</small><strong>{fmt(used)}</strong></div>
      <div><small>Remaining</small><strong>{fmt(remaining)}</strong></div>
    </div>
    <p className="at-info">All linked Instagram accounts for this customer share one AI reply allowance. Monthly limits and usage reset at 00:00 UTC on the first day of each month. Existing usage is not erased when you change the limit.</p>
    {active&&currentExpiry&&<p>Current override ends: <strong>{new Date(currentExpiry).toLocaleString()}</strong></p>}
    <form className="at-ai-form" onSubmit={event=>{event.preventDefault();void apply();}}>
      <label className="at-check"><input type="checkbox" checked={mode!=='plan'} disabled={busy} onChange={event=>{setMode(event.target.checked?'custom':'plan');setError('');setSuccess('');}}/>Enable a customer-specific Admin AI limit</label>
      {mode!=='plan'&&<>
        <label>Allowance type
          <select aria-label="AI allowance type" value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as Mode);setError('');}}>
            <option value="custom">Set monthly AI replies — 500, 5,000, 10,000 or any number</option>
            <option value="extra">Give extra AI replies this month</option>
            <option value="once">One-time AI reply allowance</option>
            <option value="unlimited">Unlimited AI replies</option>
            <option value="off">Turn AI replies off</option>
          </select>
        </label>
        {numericMode(mode)&&<>
          {mode==='custom'&&<div className="at-ai-presets" role="group" aria-label="Monthly AI reply presets">
            {presets.map(n=><button type="button" disabled={busy} aria-pressed={Number(limit)===n} key={n} onClick={()=>setLimit(String(n))}>{fmt(n)}</button>)}
          </div>}
          <label>{mode==='extra'?'Extra AI replies to add':'Maximum AI replies'}
            <input type="number" inputMode="numeric" min={mode==='extra'?1:0} max={2147483647} step="1" required aria-label="Customer AI reply limit" value={limit} disabled={busy} onChange={event=>setLimit(event.target.value)}/>
          </label>
        </>}
        <label>Override expiry (optional)
          <input type="datetime-local" value={expiry} disabled={busy} onChange={event=>setExpiry(event.target.value)}/>
        </label>
      </>}
      <p className="at-muted">{explanation} If the customer purchases a plan, an active Admin override stays in effect until it expires or you disable it. After that, their purchased plan applies automatically.</p>
      <div className="at-actions">
        <button type="submit" className="at-primary" disabled={busy||!validLimit}><ShieldCheck size={15}/>{busy?'Saving and checking…':mode==='plan'?'Use normal plan':'Save customer AI allowance'}</button>
        {mode!=='plan'||active?<button type="button" disabled={busy} onClick={()=>{setMode('plan');setExpiry('');void apply('plan');}}><RotateCcw size={14}/>Restore normal plan</button>:null}
      </div>
    </form>
    {error&&<p role="alert" className="at-error">{error}</p>}
    {success&&<p role="status" className="at-success">{success}</p>}
    <details className="at-ai-history"><summary>Previous Admin allowance changes ({history?.length||0})</summary>
      {(history||[]).slice(0,20).map((row:any)=><p key={row.id}>{new Date(row.created_at).toLocaleString()} · {row.mode==='plan'?'Restored plan':row.mode} {numericMode(row.mode)?fmt(row.reply_limit):''} {row.expires_at?' · expires '+new Date(row.expires_at).toLocaleString():''}</p>)}
      {!history?.length&&<p>No Admin AI allowance changes yet.</p>}
    </details>
  </section>;
}
