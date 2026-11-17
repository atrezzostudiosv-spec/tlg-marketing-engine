import {handleMedia} from "../../src/server/media.ts";
type Env=Parameters<typeof handleMedia>[1];
export const onRequest=(context:{request:Request;env:Env})=>handleMedia(context.request,context.env);
