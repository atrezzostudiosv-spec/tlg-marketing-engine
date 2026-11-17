begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('00000000-0000-4000-8000-000000000010','Demo');
insert into public.workspace_members values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','owner'),('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','editor');
do $$
declare w uuid:='00000000-0000-4000-8000-000000000010'; a uuid:='00000000-0000-4000-8000-000000000001'; e uuid:='00000000-0000-4000-8000-000000000002'; p uuid; s uuid; f uuid; x uuid:=gen_random_uuid(); pid uuid; d date:=(now() at time zone 'America/Chicago')::date+1; snap jsonb; ctx jsonb; draft jsonb; pkg jsonb; rev jsonb; approval uuid;
begin
 p:=public.create_property_draft(a,w,'Synthetic','Demo','SALE');s:=public.register_property_source(a,w,p,'Synthetic source');perform public.confirm_property_fact(a,w,p,s,1,'status','"ACTIVE"');
 insert into storage.objects(bucket_id,name) values('tlg-private-media',w||'/'||p||'/'||x||'.png');
 perform public.register_media(a,w,p,x,'demo.png','image/png',12,repeat('a',64),'ORIGINAL','exterior');
 select id into f from public.property_facts where workspace_id=w and property_id=p and key='status';
 pid:=(public.save_editorial_plan(a,w,gen_random_uuid(),d,5,jsonb_build_array(jsonb_build_object('propertyId',p,'day',d,'revision',2,'format','photo','angle','Presentación del listing','factIds',jsonb_build_array(f),'assetIds',jsonb_build_array(x))))#>>'{postIds,0}')::uuid;
 snap:=public.content_context(a,w,pid);
 draft:=jsonb_build_object('blocked',false,'generator','controlled-v1','revision',2,'claims','[]'::jsonb,'recipeIds',jsonb_build_array('hook:general:0'),'variants',jsonb_build_array(jsonb_build_object('channel','facebook','body','Synthetic FB','cta','Message me','claimIds',jsonb_build_array(f)),jsonb_build_object('channel','instagram','body','Synthetic IG','cta','DM me','claimIds',jsonb_build_array(f))));
 perform public.save_content_draft(a,w,pid,gen_random_uuid(),snap,draft);
 ctx:=public.quality_context(a,w,pid);
 pkg:=jsonb_build_object('facebook','Synthetic FB','instagram','Synthetic IG','storyText','Synthetic story','assetIds',jsonb_build_array(x));
 rev:='{"signature":"Synthetic broker","policyReference":"Synthetic policy","attested":true}'::jsonb;
 begin perform public.approve_package(e,w,pid,ctx,pkg,rev,now()+interval '5 minutes');raise exception 'editor approved';exception when insufficient_privilege then null;end;
 begin perform public.approve_package(a,w,pid,ctx,pkg,rev,now()+interval '1 day');raise exception 'invalid expiry';exception when invalid_parameter_value then null;end;
 begin perform public.approve_package(a,w,pid,ctx,pkg,rev-'attested',now()+interval '5 minutes');raise exception 'missing attestation';exception when invalid_parameter_value then null;end;
 approval:=public.approve_package(a,w,pid,ctx,pkg,rev,now()+interval '5 minutes');
 if approval is null or (select editorial_state from public.posts where id=pid)<>'LISTO' then raise exception 'approval not saved';end if;
 perform public.confirm_property_fact(a,w,p,s,2,'status','"SOLD"');
 if (select editorial_state from public.posts where id=pid)<>'BLOQUEADO' then raise exception 'approval not invalidated';end if;
end $$;
rollback;
