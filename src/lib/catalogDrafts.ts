/** Realtime updates must not replace a product the owner is still editing. */
export function mergeCatalogProducts<T extends {id:string}>(saved:T[],previous:T[],dirty:ReadonlyMap<string,number>):T[]{
 const previousById=new Map(previous.map(p=>[p.id,p]));
 return saved.map(product=>dirty.has(product.id)?previousById.get(product.id)||product:product);
}
