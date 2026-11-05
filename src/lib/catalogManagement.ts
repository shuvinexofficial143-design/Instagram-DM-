import type {Catalog, CatalogProduct} from './catalogState';
/** The default catalog is virtual, so retain a disabled marker to prevent recreation. */
export async function deleteCatalogRecords(scope:string,catalog:Catalog,products:CatalogProduct[],io:{remove:(scope:string,collection:string,id:string)=>Promise<unknown>;save:(scope:string,collection:string,record:Catalog)=>Promise<unknown>}):Promise<Catalog|null> {
 if(!scope)throw Error('Sign in to delete a catalog.');
 for(const product of products.filter(p=>(p.catalog_id||'default')===catalog.id))await io.remove(scope,'catalog_products',product.id);
 if(catalog.id==='default'){
  const removed={...catalog,active:false,deleted:true};
  await io.save(scope,'catalogs',removed);
  return removed;
 }
 await io.remove(scope,'catalogs',catalog.id);
 return null;
}
