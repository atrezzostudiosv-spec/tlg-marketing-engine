begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('00000000-0000-4000-8000-000000000010','Demo');
insert into public.workspace_members values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','editor'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','viewer');
do $$
declare w uuid:='00000000-0000-4000-8000-000000000010'; a uuid:='00000000-0000-4000-8000-000000000001'; v uuid:='00000000-0000-4000-8000-000000000002'; p uuid; other uuid; s uuid; f uuid; x uuid:=gen_random_uuid(); y uuid:=gen_random_uuid(); z uuid:=gen_random_uuid(); pid uuid; d date:=(now() at time zone 'America/Chicago')::date+1;
begin
 p:=public.create_property_draft(a,w,'Synthetic','Demo','SALE');other:=public.create_property_draft(a,w,'Other','Demo','SALE');
 s:=public.register_property_source(a,w,p,'Synthetic source');perform public.confirm_property_fact(a,w,p,s,1,'status','"ACTIVE"');
 begin perform public.register_media(a,w,p,x,'demo.png','image/png',12,repeat('a',64),'ORIGINAL','exterior');raise exception 'missing object accepted';exception when serialization_failure then null;end;
 insert into storage.objects(bucket_id,name) values('tlg-private-media',w||'/'||p||'/'||x||'.png'),('tlg-private-media',w||'/'||p||'/'||y||'.png'),('tlg-private-media',w||'/'||other||'/'||z||'.png');
 perform public.register_media(a,w,p,x,'demo.png','image/png',12,repeat('a',64),'ORIGINAL','exterior');
 perform public.register_media(a,w,p,y,'demo2.png','image/png',12,repeat('b',64),'VIRTUAL','living');
 perform public.register_media(a,w,other,z,'other.png','image/png',12,repeat('c',64),'ORIGINAL','other');
 begin perform public.register_media(v,w,p,gen_random_uuid(),'demo.png','image/png',12,repeat('a',64),'ORIGINAL','exterior');raise exception 'viewer wrote';exception when insufficient_privilege then null;end;
 select id into f from public.property_facts where workspace_id=w and property_id=p and key='status';
 pid:=(public.save_editorial_plan(a,w,gen_random_uuid(),d,5,jsonb_build_array(jsonb_build_object('propertyId',p,'day',d,'revision',2,'format','carousel','angle','Presentación del listing','factIds',jsonb_build_array(f),'assetIds',jsonb_build_array(x,y))))#>>'{postIds,0}')::uuid;
 begin perform public.select_post_media(a,w,pid,2,array[x,y],array[x,z]);raise exception 'foreign media accepted';exception when invalid_parameter_value then null;end;
 begin perform public.select_post_media(a,w,pid,2,array[y,x],array[x,y]);raise exception 'stale order accepted';exception when serialization_failure then null;end;
 insert into public.post_variants(workspace_id,post_id,channel,body,cta) values(w,pid,'facebook','Synthetic','Message');
 perform public.select_post_media(a,w,pid,2,array[x,y],array[y,x]);
 if (select asset_id from public.post_assets where post_id=pid and ordinal=1)<>y then raise exception 'order wrong';end if;
 if exists(select 1 from public.post_variants where post_id=pid) then raise exception 'old variant remained';end if;
 if public.media_preview_context(v,w,x)->>'hash'<>repeat('a',64) then raise exception 'preview context wrong';end if;
end $$;
rollback;
