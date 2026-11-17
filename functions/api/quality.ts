import {qualityGate} from "../../src/server/quality.ts";
type Env=Parameters<typeof qualityGate>[1];
export const onRequest=(context:{request:Request;env:Env})=>qualityGate(context.request,context.env);
