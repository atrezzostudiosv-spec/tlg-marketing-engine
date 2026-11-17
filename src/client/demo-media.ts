import type {MediaRow} from "./data.ts";
export function demoMedia(property:string):MediaRow[]{
 return ["exterior","living","kitchen"].map((role,i)=>({id:property+"-demo-media-"+i,property_id:property,media_type:"image",rights_status:"APPROVED",staging_status:i===1?"VIRTUAL":"ORIGINAL",approved_at:"2026-01-01T00:00:00Z",filename:"Simulación "+(i+1),mime_type:null,byte_size:null,sha256:null,visual_role:role}));
}
