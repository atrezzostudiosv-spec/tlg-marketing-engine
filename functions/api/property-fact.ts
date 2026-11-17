import { confirmPropertyFact } from "../../src/server/property-fact.ts";
type Env = Parameters<typeof confirmPropertyFact>[1];
export const onRequest = (context: {request: Request; env: Env}) =>
 confirmPropertyFact(context.request,context.env);
