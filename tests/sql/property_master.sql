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
 p uuid; other uuid; s uuid; r jsonb;
begin
 begin perform public.create_property_draft(v,w,'Synthetic','Demo','SALE'); raise exception 'viewer created property';
 exception when insufficient_privilege then null; end;
 p:=public.create_property_draft(a,w,'Synthetic','Demo','SALE');
 other:=public.create_property_draft(a,w,'Synthetic other','Demo','LEASE');
 s:=public.register_property_source(a,w,p,'Synthetic authorized source');
 begin perform public.confirm_property_fact(a,w,other,s,1,'bedrooms','4'); raise exception 'wrong property source accepted';
 exception when invalid_parameter_value then null; end;
 begin perform public.confirm_property_fact(a,w,p,s,1,'bedrooms','2.5'); raise exception 'fractional bedrooms accepted';
 exception when invalid_parameter_value then null; end;
 r:=public.confirm_property_fact(a,w,p,s,1,'bedrooms','4');
 if (r->>'revision')::int<>2 then raise exception 'bedroom revision failed'; end if;
 r:=public.confirm_property_fact(a,w,p,s,2,'living_sqft','2500');
 if (r->>'revision')::int<>3 then raise exception 'sqft revision failed'; end if;
 r:=public.confirm_property_fact(a,w,p,s,3,'status','"ACTIVE"');
 if (r->>'revision')::int<>4 then raise exception 'status revision failed'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.properties where status='PENDING')<>1 then raise exception 'draft state failed'; end if;
 if (select count(*) from public.property_facts where key='living_sqft' and unit='sqft' and expires_at is null)<>1 then raise exception 'sqft metadata failed'; end if;
 if (select count(*) from public.property_facts where key='status' and expires_at is not null)<>1 then raise exception 'status expiry failed'; end if;
end $$;
rollback;
