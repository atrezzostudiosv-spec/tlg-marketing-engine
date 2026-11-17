export const fields = [
 {key:"status",label:"Estado comercial",kind:"status"},
 {key:"price",label:"Precio",kind:"number"},
 {key:"bedrooms",label:"Habitaciones",kind:"number"},
 {key:"bathrooms",label:"Baños (total)",kind:"number"},
 {key:"living_sqft",label:"Superficie habitable (sqft)",kind:"number"},
 {key:"lot_acres",label:"Terreno (acres)",kind:"number"},
 {key:"description",label:"Descripción oficial",kind:"text"},
 {key:"listing_url",label:"Enlace del listing",kind:"text"},
 {key:"availability",label:"Disponibilidad / fecha confirmada",kind:"text"}
] as const;
export const statuses=["ACTIVE","PENDING","SOLD","LEASED","WITHDRAWN","EXCLUDED"] as const;
export function parseFact(key:string,raw:unknown):string|number|null {
 const field=fields.find(f=>f.key===key);if(!field)return null;
 if(field.kind==="status")return typeof raw==="string"&&statuses.some(s=>s===raw)?raw:null;
 if(field.kind==="number"){
  if(typeof raw!=="number"||!Number.isFinite(raw)||raw<0||raw>1e11)return null;
  if(["price","living_sqft","lot_acres"].includes(key)&&raw<=0)return null;
  if(["bedrooms","living_sqft"].includes(key)&&!Number.isInteger(raw))return null;
  if(["bedrooms","bathrooms"].includes(key)&&raw>100)return null;
  return raw;
 }
 if(typeof raw!=="string"||!raw.trim()||raw.length>4000)return null;
 if(key==="listing_url"){try{const u=new URL(raw);if(u.protocol!=="https:"||u.username||u.password||/\s/.test(raw))return null;}catch{return null;}}
 return raw.trim();
}
