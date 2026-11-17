import {savePlan} from "../../src/server/planner.ts";
type Env=Parameters<typeof savePlan>[1];
export const onRequest=(context:{request:Request;env:Env})=>savePlan(context.request,context.env);
