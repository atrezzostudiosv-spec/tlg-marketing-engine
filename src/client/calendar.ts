export const zone="America/Chicago";
export function dateKey(instant: string|Date):string {
 const d=new Date(instant);
 if(!Number.isFinite(d.getTime())) throw Error("Invalid date");
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const get=(k:string)=>parts.find(p=>p.type===k)?.value;
 return get("year")+"-"+get("month")+"-"+get("day");
}
export function shiftDay(key:string,n:number):string {
 const d=new Date(key+"T12:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==key)throw Error("Invalid day");
 d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
export function weekStart(key:string):string {
 const d=new Date(key+"T12:00:00Z");return shiftDay(key,-((d.getUTCDay()+6)%7));
}
export function weekDays(key:string):string[] {const start=weekStart(key);return Array.from({length:7},(_,i)=>shiftDay(start,i));}
export function labelDay(key:string,options:Intl.DateTimeFormatOptions):string {
 return new Intl.DateTimeFormat("es-ES",{...options,timeZone:"UTC"}).format(new Date(key+"T12:00:00Z"));
}
export function clock(instant:string,zone:string):string {
 return new Intl.DateTimeFormat("es-ES",{timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(instant));
}
