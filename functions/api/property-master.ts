import { mutateMaster } from "../../src/server/property-master.ts";
type Env=Parameters<typeof mutateMaster>[1];
export const onRequest=(context:{request:Request;env:Env})=>mutateMaster(context.request,context.env);
