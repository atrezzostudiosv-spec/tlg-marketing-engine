begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.workspaces(id,name) values ('00000000-0000-4000-8000-000000000010','Demo');
insert into public.workspace_members values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','editor'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','viewer');
do $$
declare a uuid:='00000000-0000-4000-8000-000000000001'; v uuid:='00000000-0000-4000-8000-000000000002'; w uuid:='00000000-0000-4000-8000-000000000010';
 p uuid; s uuid; f uuid; post_id_value uuid; draft_id uuid:=gen_random_uuid(); snap jsonb; next_snap jsonb; draft jsonb; d date:=(now() at time zone 'America/Chicago')::date+1;
begin
 p:=public.create_property_draft(a,w,'Synthetic','Demo','SALE');
 s:=public.register_property_source(a,w,p,'Synthetic source');
 perform public.confirm_property_fact(a,w,p,s,1,'status','"ACTIVE"');
 select id into f from public.property_facts where workspace_id=w and key='status';
 post_id_value:=(public.save_editorial_plan(a,w,gen_random_uuid(),d,5,jsonb_build_array(jsonb_build_object('propertyId',p,'day',d,'revision',2,'format','photo','angle','Presentación del listing','factIds',jsonb_build_array(f),'assetIds','[]'::jsonb)))#>>'{postIds,0}')::uuid;
 snap:=public.content_context(a,w,post_id_value);
 if snap#>>'{property,id}'<>p::text or jsonb_array_length(snap->'facts')<>1 then raise exception 'context incorrect';end if;
 begin perform public.content_context(v,w,post_id_value);raise exception 'viewer context allowed';exception when insufficient_privilege then null;end;
 draft:=jsonb_build_object('blocked',false,'generator','controlled-v1','revision',2,'claims','[]'::jsonb,'recipeIds',jsonb_build_array('hook:general:0'),'variants',jsonb_build_array(jsonb_build_object('channel','facebook','body','Synthetic FB','cta','Message me','claimIds',jsonb_build_array(f)),jsonb_build_object('channel','instagram','body','Synthetic IG','cta','DM me','claimIds',jsonb_build_array(f))));
 perform public.save_content_draft(a,w,post_id_value,draft_id,snap,draft);
 if public.save_content_draft(a,w,post_id_value,draft_id,snap,draft)<>draft then raise exception 'idempotency failed';end if;
 if (select count(*) from public.content_drafts)<>1 or (select count(*) from public.post_variants)<>2 then raise exception 'save count incorrect';end if;
 if (select editorial_state from public.posts where id=post_id_value)<>'BORRADOR' then raise exception 'draft approval leaked';end if;
 begin perform public.save_content_draft(a,w,post_id_value,gen_random_uuid(),snap,draft);raise exception 'stale snapshot accepted';exception when serialization_failure then null;end;
 next_snap:=public.content_context(a,w,post_id_value);
 if next_snap->'history'<>'["hook:general:0"]'::jsonb then raise exception 'history missing';end if;
 perform public.save_content_draft(a,w,post_id_value,gen_random_uuid(),next_snap,draft);
 if (select count(*) from public.content_drafts)<>2 then raise exception 'version history lost';end if;
 perform public.confirm_property_fact(a,w,p,s,2,'status','"SOLD"');
 begin perform public.save_content_draft(a,w,post_id_value,gen_random_uuid(),next_snap,draft);raise exception 'sold property accepted';exception when serialization_failure then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(id) from public.content_drafts)<>2 then raise exception 'history read failed';end if;
 begin perform snapshot from public.content_drafts;raise exception 'private snapshot leaked';exception when insufficient_privilege then null;end;
 begin delete from public.content_drafts;raise exception 'direct delete allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
