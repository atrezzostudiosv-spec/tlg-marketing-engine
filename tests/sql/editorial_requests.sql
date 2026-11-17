begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.workspaces(id,name) values ('00000000-0000-4000-8000-000000000010','Demo');
insert into public.workspace_members values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','editor');
do $$
declare a uuid:='00000000-0000-4000-8000-000000000001'; w uuid:='00000000-0000-4000-8000-000000000010'; p uuid; s uuid; f uuid; post_id_value uuid; rid uuid:=gen_random_uuid(); d date:=(now() at time zone 'America/Chicago')::date+1;
begin
 p:=public.create_property_draft(a,w,'Synthetic','Demo','SALE');
 s:=public.register_property_source(a,w,p,'Synthetic source');
 perform public.confirm_property_fact(a,w,p,s,1,'status','"ACTIVE"');
 select id into f from public.property_facts where workspace_id=w and key='status';
 post_id_value:=(public.save_editorial_plan(a,w,gen_random_uuid(),d,5,jsonb_build_array(jsonb_build_object('propertyId',p,'day',d,'revision',2,'format','photo','angle','Presentación del listing','factIds',jsonb_build_array(f),'assetIds','[]'::jsonb)))#>>'{postIds,0}')::uuid;
 if public.reserve_editorial_request(a,w,post_id_value,rid)->>'allowed'<>'true' then raise exception 'first reservation failed';end if;
 if public.reserve_editorial_request(a,w,post_id_value,rid)->>'allowed'<>'false' then raise exception 'duplicate reservation allowed';end if;
 for i in 1..29 loop
  if public.reserve_editorial_request(a,w,post_id_value,gen_random_uuid())->>'allowed'<>'true' then raise exception 'quota early';end if;
 end loop;
 if public.reserve_editorial_request(a,w,post_id_value,gen_random_uuid())->>'allowed'<>'false' then raise exception 'quota exceeded';end if;
 if (select count(*) from public.editorial_requests)<>30 then raise exception 'quota wrong';end if;
end $$;
rollback;
