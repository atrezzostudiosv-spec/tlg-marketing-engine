import {composeDraft} from "../domain/content.ts";
import type {ContentInput,ContentDraft} from "../domain/content.ts";
type Config={OPENAI_API_KEY?:string;OPENAI_MODEL?:string;OPENAI_EDITORIAL_ENABLED?:string};
const endpoint="https://api.openai.com/v1/responses";
export function aiEnabled(env:Config){return env.OPENAI_EDITORIAL_ENABLED==="true"&&Boolean(env.OPENAI_API_KEY&&env.OPENAI_MODEL);}
export function candidates(input:ContentInput){
 const options=Array.from({length:8},(_,i)=>composeDraft({...input,editorialChoice:i}));
 return options.filter((x,i)=>!x.blocked&&options.findIndex(y=>y.variants[0]?.body===x.variants[0]?.body&&y.variants[1]?.body===x.variants[1]?.body)===i);
}
// Send only abstract, controlled language choices. No address, numeric facts, source text,
// property IDs, media, customer data, or database credentials are sent to the provider.
export function editorialRequest(options:ContentDraft[],model:string,history:string[]){
 const choices=options.map((o,index)=>{
  const ids=o.recipeIds??[];
  const fb=o.variants[0];const ig=o.variants[1];
  const identityFirst=ids.includes("layout:identity");
  return {index,layout:identityFirst?"identity first":"hook first",hook:fb.body.split("\n\n")[identityFirst?1:0],facebookCTA:fb.cta,instagramCTA:ig.cta,recentUses:ids.filter(x=>history.slice(0,12).includes(x)).length};
 });
 return {model,store:false,max_output_tokens:256,instructions:"You are an editorial director for a premium residential real estate brokerage. Select the strongest available composition for a warm, credible, first-person English social caption. Prefer specificity, natural rhythm and lower recent repetition. Avoid hype. Choose one existing index only. Do not write any factual claims or new text.",input:JSON.stringify(choices),text:{format:{type:"json_schema",name:"editorial_selection",strict:true,schema:{type:"object",properties:{index:{type:"integer",enum:choices.map(x=>x.index)}},required:["index"],additionalProperties:false}}}};
}
export function parseChoice(response:unknown,length:number):number|null{
 if(!response||typeof response!=="object")return null;
 const r=response as {status?:string;output?:{type:string;content?:{type:string;text?:string}[]}[]};
 if(r.status!=="completed"||!Array.isArray(r.output))return null;
 const parts=r.output.filter(x=>x.type==="message").flatMap(x=>x.content??[]);
 if(parts.length!==1||parts[0].type!=="output_text"||typeof parts[0].text!=="string")return null;
 try{const v=JSON.parse(parts[0].text);return v&&Object.keys(v).length===1&&Number.isInteger(v.index)&&v.index>=0&&v.index<length?v.index:null;}catch{return null;}
}
export async function selectEditorial(input:ContentInput,env:Config,send:typeof fetch=fetch):Promise<ContentDraft>{
 const fallback=composeDraft(input);
 if(fallback.blocked)return fallback;
 if(!aiEnabled(env))return {...fallback,editorialMode:"controlled"};
 const options=candidates(input);
 if(options.length<2)return {...fallback,editorialMode:"controlled"};
 try{
  const response=await send(endpoint,{method:"POST",headers:{authorization:"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(editorialRequest(options,env.OPENAI_MODEL!,input.history??[])),redirect:"error",signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error("provider failure");
  const selection=parseChoice(await response.json(),options.length);
  if(selection===null)throw Error("invalid selection");
  return {...options[selection],editorialMode:"assisted"};
 }catch{return {...fallback,editorialMode:"fallback"};}
}
