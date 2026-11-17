-- Synthetic data only. All assertions run on disposable PostgreSQL.
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('00000000-0000-4000-8000-000000000010','A'),('00000000-0000-4000-8000-000000000020','B');
insert into public.workspace_members values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','editor'),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000002','viewer');
insert into public.properties(workspace_id,id,address,locality,transaction_type,status) values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011','Synthetic A','Demo','SALE','ACTIVE'),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021','Synthetic B','Demo','SALE','ACTIVE');
insert into public.sources(workspace_id,id,type,reference,obtained_at,authorization) values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','demo','demo',now(),'APPROVED'),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000022','demo','demo',now(),'APPROVED'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000013','demo','demo',now(),'DENIED');
insert into public.posts(workspace_id,property_id,id,planned_at,format,property_revision,workflow_state,editorial_state)
 select '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011',
 ('00000000-0000-4000-8000-0000000000'||n)::uuid,now(),'photo',1,state,'LISTO'
 from (values ('31','PENDIENTE'),('32','PROGRAMADO'),('33','PUBLICADO')) as x(n,state);
insert into storage.objects(bucket_id) values ('tlg-private-media');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.properties)<>1 then raise exception 'RLS isolation failed'; end if;
 if (select count(*) from storage.objects)<>0 then raise exception 'private bucket leaked'; end if;
 begin update public.properties set revision=9; raise exception 'direct mutation succeeded';
 exception when insufficient_privilege then null; end;
 begin perform public.confirm_property_fact('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012',1,'price','1000'); raise exception 'direct RPC succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$
declare a uuid:='00000000-0000-4000-8000-000000000001';
 w uuid:='00000000-0000-4000-8000-000000000010';
 p uuid:='00000000-0000-4000-8000-000000000011';
 s uuid:='00000000-0000-4000-8000-000000000012';
 r jsonb;
begin
 begin perform public.confirm_property_fact('00000000-0000-4000-8000-000000000002',w,p,s,1,'price','1000'); raise exception 'wrong tenant succeeded';
 exception when insufficient_privilege then null; end;
 begin perform public.confirm_property_fact('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022',1,'price','1000'); raise exception 'viewer mutation succeeded';
 exception when insufficient_privilege then null; end;
 begin perform public.confirm_property_fact(a,w,p,'00000000-0000-4000-8000-000000000022',1,'price','1000'); raise exception 'foreign source succeeded';
 exception when invalid_parameter_value then null; end;
 begin perform public.confirm_property_fact(a,w,p,'00000000-0000-4000-8000-000000000013',1,'price','1000'); raise exception 'denied source succeeded';
 exception when invalid_parameter_value then null; end;
 r:=public.confirm_property_fact(a,w,p,s,1,'price','1000');
 if r <> '{"revision":2,"changed":true,"pending_invalidated":1,"external_review":1}'::jsonb then raise exception 'unexpected mutation %',r; end if;
 r:=public.confirm_property_fact(a,w,p,s,2,'price','1000');
 if r <> '{"revision":2,"changed":false,"pending_invalidated":0,"external_review":0}'::jsonb then raise exception 'unchanged fact invalidated %',r; end if;
 begin perform public.confirm_property_fact(a,w,p,s,1,'status','"SOLD"'); raise exception 'stale revision succeeded';
 exception when serialization_failure then null; end;
 r:=public.confirm_property_fact(a,w,p,s,2,'status','"SOLD"');
 if (r->>'revision')::int<>3 then raise exception 'status revision failed'; end if;
end $$;
reset role;
do $$ begin
 if (select status from public.properties where id='00000000-0000-4000-8000-000000000011')<>'SOLD' then raise exception 'status mismatch'; end if;
 if (select count(*) from public.posts where workflow_state='CANCELADO' and editorial_state='BLOQUEADO')<>1 then raise exception 'pending not cancelled'; end if;
 if (select count(*) from public.posts where workflow_state='PROGRAMADO' and editorial_state='BLOQUEADO')<>1 then raise exception 'scheduled not preserved'; end if;
 if (select count(*) from public.posts where workflow_state='PUBLICADO' and editorial_state='LISTO')<>1 then raise exception 'history modified'; end if;
 if (select count(*) from public.post_alerts)<>2 then raise exception 'alert count wrong'; end if;
 if (select count(*) from public.audit_log)<>3 then raise exception 'audit count wrong'; end if;
end $$;
rollback;
