import {generateContent} from "../../src/server/content.ts";
type Env=Parameters<typeof generateContent>[1];
export const onRequest=(context:{request:Request;env:Env})=>generateContent(context.request,context.env);
