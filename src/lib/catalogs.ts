import { useEffect, useState } from 'react';
import { auth, supabase, subscribeToUserCollection } from './supabase';
export type Catalog = { id:string; name:string; description:string; active:boolean };
export type CatalogProduct = { id:string; catalog_id?:string; name:string; price:string; description:string; url:string; active:boolean; images?:string[] };
export const CATALOG_BUCKET = 'catalog-images';
export const defaultCatalog:Catalog = {id:'default',name:'Main Catalog',description:'Your product collection',active:true};
export function catalogCards(products:CatalogProduct[]) {
 return products.filter(p=>p.active).flatMap(p=>(p.images||[]).map(image=>({image,title:p.name,subtitle:[p.price,p.description].filter(Boolean).join(' · '),url:p.url})));
}
export function catalogProblem(catalog:Catalog|undefined, products:CatalogProduct[]) {
 if(!catalog) return 'This catalog no longer exists.';
 if(!catalog.active) return 'Activate this catalog before using it.';
 const active=products.filter(p=>p.active);
 if(!active.length) return 'Add an active product first.';
 if(active.some(p=>!p.name.trim()||!p.images?.length)) return 'Every active product needs a name and at least one image.';
 if(catalogCards(products).length>10) return 'Instagram allows up to 10 image cards per catalog message.';
 if(active.some(p=>p.images!.some(url=>!/^https:\/\//.test(url))||p.url&&!/^https:\/\//.test(p.url))) return 'Use secure HTTPS image and product links.';
 return '';
}
export function useCatalogs(workspaceId:string) {
 const [catalogs,setCatalogs]=useState<Catalog[]>([]),[products,setProducts]=useState<CatalogProduct[]>([]);
 useEffect(()=>{setCatalogs([]);setProducts([]);const id=workspaceId||auth.currentUser?.uid;if(!id)return;
  const a=subscribeToUserCollection<Catalog>(id,'catalogs',setCatalogs),b=subscribeToUserCollection<CatalogProduct>(id,'catalog_products',setProducts);
  return()=>{a?.();b?.();};
 },[workspaceId]);
 return {catalogs:[catalogs.find(c=>c.id==='default')||defaultCatalog,...catalogs.filter(c=>c.id!=='default')],products};
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
