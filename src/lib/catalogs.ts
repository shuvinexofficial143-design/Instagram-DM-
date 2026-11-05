import { safeImageUrl } from '../../supabase/functions/instagram-live-webhook/catalogRuntime';
export { safeImageUrl as safeCatalogUrl };
import { useCallback, useEffect, useState } from 'react';
import { auth, supabase, subscribeToUserCollection } from './supabase';
import { Catalog, CatalogProduct, CatalogSnapshot, defaultCatalog, initialCatalogSnapshot, resolveCatalogs, watchCatalogs } from './catalogState';
export { defaultCatalog, resolveCatalogs };
export type { Catalog, CatalogProduct };
export const CATALOG_BUCKET = 'catalog-images';
export function catalogCards(products:CatalogProduct[]) {
 return products.filter(p=>p.active).flatMap(p=>(p.images||[]).map(image=>({image,title:p.name,subtitle:[p.price,p.description].filter(Boolean).join(' · '),url:p.url})));
}
export function catalogProblem(catalog:Catalog|undefined, products:CatalogProduct[], ai=false) {
 if(!catalog||catalog.deleted) return 'This catalog no longer exists.';
 if(!catalog.active) return 'Activate this catalog before using it.';
 const active=products.filter(p=>p.active);
 if(!active.length) return 'Add an active product first.';
 if(active.some(p=>!p.name.trim())) return 'Every active product needs a name.';
 if(!ai&&!catalogCards(products).length) return 'Add a product photo to send an Instagram catalog. AI can still use written product details.';
 if(active.some(p=>(p.images||[]).some(url=>!safeImageUrl(url))||p.url&&!safeImageUrl(p.url))) return 'Use secure HTTPS image and product links.';
 return '';
}
export type CatalogData = CatalogSnapshot & {refresh:()=>void};
export function useCatalogs(workspaceId:string,enabled=true):CatalogData {
 const scope=workspaceId||auth.currentUser?.uid||'';
 const [revision,setRevision]=useState(0);
 const key=enabled?scope+':'+revision:'';
 const [state,setState]=useState<{key:string;data:CatalogSnapshot}>(()=>({key:'',data:initialCatalogSnapshot()}));
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{
  if(!enabled){setState({key:'',data:initialCatalogSnapshot()});return;}
  setState({key,data:initialCatalogSnapshot()});
  if(!scope||!auth.currentUser?.uid){setState({key,data:{catalogs:[],products:[],loading:false,error:'Sign in to load your catalogs.'}});return;}
  return watchCatalogs(scope,subscribeToUserCollection,data=>setState({key,data}));
 },[scope,enabled,key]);
 return {...(state.key===key&&enabled?state.data:initialCatalogSnapshot()),refresh};
}
export async function uploadCatalogImages(workspaceId:string,catalogId:string,files:File[]) {
 if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024||!file.size)) throw Error('Choose JPG, PNG or WebP images, up to 5 MB each.');
 const urls:string[]=[];
 for(const file of files){
  const {data,error}=await supabase.functions.invoke('instagram-account-store',{body:{action:'create_catalog_upload',workspaceId,catalogId,mimeType:file.type,size:file.size}});
  if(error||!data?.ok)throw Error(data?.error||error?.message||'Could not prepare image upload.');
  const uploaded=await supabase.storage.from(CATALOG_BUCKET).uploadToSignedUrl(data.path,data.token,file,{contentType:file.type});
  if(uploaded.error)throw uploaded.error;
  urls.push(data.publicUrl);
 }
 return urls;
}
