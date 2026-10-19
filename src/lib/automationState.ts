import type { Automation } from '../types';

/** Old reads may finish after a confirmed status change. Preserve the newer config. */
export function reconcileAutomationRecords(current: Automation[], incoming: Automation[], pending: ReadonlyMap<string, Automation['status']> = new Map()): Automation[] {
  const previous = new Map(current.map(item=>[item.id,item]));
  const result = incoming.map(item=>{
    const old=previous.get(item.id);
    const newer=old && Date.parse(old.updated_at)>Date.parse(item.updated_at) ? old : item;
    const status=pending.get(item.id);
    return status ? {...newer,status} : newer;
  });
  for(const item of current) if(pending.has(item.id)&&!result.some(row=>row.id===item.id))result.push({...item,status:pending.get(item.id)!});
  return result;
}
