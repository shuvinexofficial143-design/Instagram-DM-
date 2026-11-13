/** Catalog data shared by the picker and the builder's validation. */
export type Catalog = { id:string; name:string; description:string; active:boolean; deleted?:boolean; delivery_style?:'cards'|'photos_details'|'photos_ai'|'photos_only' };
export type CatalogProduct = { id:string; catalog_id?:string; name:string; price:string; description:string; url:string; active:boolean; images?:string[] };
export const defaultCatalog:Catalog = {id:'default',name:'Main Catalog',description:'Your product collection',active:true};
export function resolveCatalogs(records:Catalog[]):Catalog[] {
 const main=records.find(c=>c.id==='default');
 return [main||defaultCatalog,...records.filter(c=>c.id!=='default')].filter(c=>!c.deleted);
}
export type CatalogSnapshot = {catalogs:Catalog[];products:CatalogProduct[];loading:boolean;error:string};
export const initialCatalogSnapshot = ():CatalogSnapshot => ({catalogs:[],products:[],loading:true,error:''});
type Subscribe = (scope:string,collection:string,onData:(rows:any[])=>void,onError:(error:Error)=>void)=>(()=>void)|undefined;
export function watchCatalogs(scope:string,subscribe:Subscribe,onData:(data:CatalogSnapshot)=>void):()=>void {
 let active=true,catalogs:Catalog[]=[],products:CatalogProduct[]=[];
 const ready=new Set<string>(),errors=new Map<string,string>();
 const emit=()=>{if(active)onData({catalogs:resolveCatalogs(catalogs),products,loading:ready.size<2&&errors.size===0,error:[...errors.values()][0]||''});};
 const receive=(collection:string,rows:any[])=>{
  if(!active)return;
  if(collection==='catalogs')catalogs=rows;else products=rows;
  ready.add(collection);errors.delete(collection);emit();
 };
 const failed=(collection:string,error:Error)=>{if(!active)return;errors.set(collection,error.message||'Could not load catalog data. Please retry.');emit();};
 const stopCatalogs=subscribe(scope,'catalogs',rows=>receive('catalogs',rows),error=>failed('catalogs',error));
 const stopProducts=subscribe(scope,'catalog_products',rows=>receive('catalog_products',rows),error=>failed('catalog_products',error));
 return()=>{active=false;stopCatalogs?.();stopProducts?.();};
}

export const catalogDeliveryStyles=[
 {value:'cards',label:'Product cards',description:'Swipeable photos with names, prices and links.'},
 {value:'photos_details',label:'Photos + details',description:'All photos first, then your saved product information.'},
 {value:'photos_ai',label:'Photos + AI message',description:'All photos, saved details and a natural AI introduction.'},
 {value:'photos_only',label:'Photos only',description:'Send the photos without a separate information message.'},
] as const;
