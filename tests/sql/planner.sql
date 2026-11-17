begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('00000000-0000-4000-8000-000000000010','Demo');
insert into public.workspace_members values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','editor'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','viewer');
set local role service_role;
do $$
declare a uuid:='00000000-0000-4000-8000-000000000001';
 v uuid:='00000000-0000-4000-8000-000000000002';
 w uuid:='00000000-0000-4000-8000-000000000010';
 batch uuid:=gen_random_uuid(); p uuid; s uuid; f uuid; result jsonb; payload jsonb;
 d date:=(now() at time zone 'America/Chicago')::date+1;
begin
 p:=public.create_property_draft(a,w,'Synthetic','Demo','SALE');
 s:=public.register_property_source(a,w,p,'Synthetic source');
 perform public.confirm_property_fact(a,w,p,s,1,'status','"ACTIVE"');
 -- Test fixture obtains fact ID as superuser helper below, via security-definer RPC is not necessary in actual service role.
end $$;
reset role;
do $$
declare a uuid:='00000000-0000-4000-8000-000000000001';
 v uuid:='00000000-0000-4000-8000-000000000002';
 w uuid:='00000000-0000-4000-8000-000000000010';
 batch uuid:=gen_random_uuid(); p uuid; s uuid; f uuid; result jsonb; payload jsonb;
 d date:=(now() at time zone 'America/Chicago')::date+1;
begin
 select id into p from public.properties where workspace_id=w;
 select id,source_id into f,s from public.property_facts where workspace_id=w and key='status';
 payload:=jsonb_build_array(jsonb_build_object('propertyId',p,'day',d,'revision',2,'format','photo','angle','Presentación del listing','factIds',jsonb_build_array(f),'assetIds','[]'::jsonb));
 begin perform public.save_editorial_plan(v,w,batch,d,5,payload);raise exception 'viewer saved';
 exception when insufficient_privilege then null;end;
 begin perform public.save_editorial_plan(a,w,gen_random_uuid(),d,5,jsonb_set(payload,'{0,revision}','1'));raise exception 'stale revision saved';
 exception when serialization_failure then null;end;
 begin perform public.save_editorial_plan(a,w,gen_random_uuid(),d,5,jsonb_set(payload,'{0,angle}','"Precio confirmado"'));raise exception 'missing evidence saved';
 exception when invalid_parameter_value then null;end;
 -- A later failure must roll back the first item as well.
 begin perform public.save_editorial_plan(a,w,gen_random_uuid(),d,5,payload||payload);raise exception 'duplicate accepted';
 exception when serialization_failure then null;end;
 if (select count(*) from public.posts)<>0 then raise exception 'partial commit';end if;
 result:=public.save_editorial_plan(a,w,batch,d,5,payload);
 if (result->>'created')::int<>1 then raise exception 'not saved';end if;
 if public.save_editorial_plan(a,w,batch,d,5,payload)<>result then raise exception 'retry not idempotent';end if;
 begin perform public.save_editorial_plan(a,w,gen_random_uuid(),d,5,payload);raise exception 'duplicate day saved';
 exception when serialization_failure then null;end;
 if (select count(*) from public.posts where editorial_state='BORRADOR' and workflow_state='PENDIENTE')<>1 then raise exception 'draft count wrong';end if;
 if (select count(*) from public.strategy_facts where fact_id=f)<>1 then raise exception 'evidence missing';end if;
 if (select count(*) from public.calendar_history where angle='Presentación del listing')<>1 then raise exception 'history missing';end if;
 perform public.confirm_property_fact(a,w,p,s,2,'status','"SOLD"');
 if (select count(*) from public.posts where workflow_state='CANCELADO' and editorial_state='BLOQUEADO')<>1 then raise exception 'invalidation failed';end if;
end $$;
rollback;
