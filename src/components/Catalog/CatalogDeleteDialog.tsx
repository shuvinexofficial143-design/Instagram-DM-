import React, {useRef,useState} from 'react';
import {Loader2,Trash2} from 'lucide-react';
import {CatalogDialog} from './CatalogDialog';
export function CatalogDeleteDialog({name,productCount,onClose,onDelete}:{name:string;productCount:number;onClose:()=>void;onDelete:()=>Promise<void>}){
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const remove=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onDelete();}catch(e){setError(e instanceof Error?e.message:'Could not delete this catalog. Please retry.');}finally{lock.current=false;setBusy(false);}};
 return <CatalogDialog title="Delete catalog" onClose={onClose} busy={busy} footer={<><button className="catalog-button catalog-secondary" disabled={busy} onClick={onClose}>Keep catalog</button><button className="catalog-button catalog-destructive" disabled={busy} onClick={()=>void remove()}>{busy?<Loader2 size={17} className="catalog-spin"/>:<Trash2 size={17}/>} {busy?'Deleting…':'Delete catalog'}</button></>}>
  <div className="catalog-delete-confirm"><span className="catalog-delete-symbol"><Trash2 size={26}/></span><h3>Delete “{name}”?</h3><p>{productCount?`This removes the catalog and its ${productCount} product${productCount===1?'':'s'}.`:'This removes the empty catalog.'} This cannot be undone.</p><p>Automations using this catalog will need another catalog selected.</p>{error&&<div className="catalog-alert" role="alert">{error}</div>}</div>
 </CatalogDialog>;
}
