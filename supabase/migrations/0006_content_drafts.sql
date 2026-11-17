-- Server-generated immutable draft revisions; no export approval is granted here.
begin;
create table public.content_drafts (
 workspace_id uuid not null, id uuid not null, post_id uuid not null, property_id uuid not null,
 actor uuid not null references auth.users, revision integer not null, snapshot jsonb not null, draft jsonb not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,id),
 foreign key(workspace_id,property_id,post_id) references public.posts(workspace_id,property_id,id)
);
alter table public.content_drafts enable row level security;
revoke all on public.content_drafts from anon,authenticated;
grant select(workspace_id,id,post_id,property_id,revision,draft,created_at) on public.content_drafts to authenticated;
create policy tenant_read on public.content_drafts for select to authenticated using(public.can_access_workspace(workspace_id));
create index content_drafts_history on public.content_drafts(workspace_id,created_at desc);

create function public.content_context(p_actor uuid,p_workspace uuid,p_post uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.posts%rowtype; prop public.properties%rowtype; s public.strategies%rowtype;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor'))
 then raise exception 'not authorized' using errcode='42501';end if;
 select * into p from public.posts where workspace_id=p_workspace and id=p_post;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into prop from public.properties where workspace_id=p_workspace and id=p.property_id;
 select * into s from public.strategies where workspace_id=p_workspace and id=p.strategy_id and property_id=p.property_id;
 if not found or s.revision<>p.property_revision then raise exception 'strategy missing or changed' using errcode='40001';end if;
 return jsonb_build_object(
 'property',jsonb_build_object('id',prop.id,'address',prop.address,'locality',prop.locality,'status',prop.status,'revision',prop.revision,'transaction_type',prop.transaction_type),
 'post',jsonb_build_object('id',p.id,'property_id',p.property_id,'property_revision',p.property_revision,'planned_at',p.planned_at,'format',p.format,'workflow_state',p.workflow_state,'editorial_state',p.editorial_state,'angle',s.angle,'eventId',p.event_id),
 'facts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'propertyId',f.property_id,'key',f.key,'value',f.typed_value,'sourceId',f.source_id,'verifiedAt',f.verified_at,'expiresAt',f.expires_at,'status',f.verification_status) order by f.id)
  from public.property_facts f where f.workspace_id=p_workspace and f.property_id=p.property_id and exists(select 1 from public.strategy_facts sf where sf.workspace_id=p_workspace and sf.strategy_id=s.id and sf.fact_id=f.id)),'[]'::jsonb),
 'factIds',coalesce((select jsonb_agg(fact_id order by fact_id) from public.strategy_facts where workspace_id=p_workspace and strategy_id=s.id),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',src.id,'property_id',src.property_id,'authorization_status',case when src.obtained_at>now() then 'UNKNOWN' else src.authorization_status end) order by src.id)
  from public.sources src where src.workspace_id=p_workspace and src.property_id=p.property_id and exists(select 1 from public.property_facts f join public.strategy_facts sf on sf.workspace_id=f.workspace_id and sf.fact_id=f.id where f.workspace_id=p_workspace and sf.strategy_id=s.id and f.source_id=src.id)),'[]'::jsonb),
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'property_id',a.property_id,'media_type',a.media_type,'rights_status',a.rights_status,'staging_status',a.staging_status,'approved_at',a.approved_at) order by pa.ordinal)
  from public.post_assets pa join public.assets a on a.workspace_id=pa.workspace_id and a.id=pa.asset_id where pa.workspace_id=p_workspace and pa.post_id=p.id),'[]'::jsonb),
 'assetIds',coalesce((select jsonb_agg(asset_id order by ordinal) from public.post_assets where workspace_id=p_workspace and post_id=p.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'property_id',e.property_id,'type',e.type,'start_at',e.start_at,'end_at',e.end_at,'confirmation_status',e.confirmation_status)) from public.events e where e.workspace_id=p_workspace and e.id=p.event_id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(x.value order by h.created_at desc,h.id,x.ordinality)
  from (select id,created_at,draft from public.content_drafts where workspace_id=p_workspace order by created_at desc,id limit 30) h
  cross join lateral jsonb_array_elements(h.draft->'recipeIds') with ordinality x(value,ordinality)),'[]'::jsonb)
 );
end $$;
revoke all on function public.content_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.content_context(uuid,uuid,uuid) to service_role;

create function public.save_content_draft(p_actor uuid,p_workspace uuid,p_post uuid,p_id uuid,p_snapshot jsonb,p_draft jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_snapshot jsonb; prev public.content_drafts%rowtype; prop_id uuid; rev integer; variant jsonb;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor'))
 then raise exception 'not authorized' using errcode='42501';end if;
 if p_id is null then raise exception 'invalid id' using errcode='22023';end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 select * into prev from public.content_drafts where workspace_id=p_workspace and id=p_id;
 if found then
  if prev.actor<>p_actor or prev.post_id<>p_post then raise exception 'id conflict' using errcode='40001';end if;
  return prev.draft;
 end if;
 select property_id into prop_id from public.posts where workspace_id=p_workspace and id=p_post;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 perform 1 from public.properties where workspace_id=p_workspace and id=prop_id for update;
 perform 1 from public.posts where workspace_id=p_workspace and id=p_post for update;
 current_snapshot:=public.content_context(p_actor,p_workspace,p_post);
 if current_snapshot is distinct from p_snapshot or current_snapshot#>>'{property,status}'<>'ACTIVE'
  or current_snapshot#>>'{post,workflow_state}'<>'PENDIENTE'
  or current_snapshot#>>'{post,editorial_state}' not in ('BORRADOR','REQUIERE_ATENCION')
  or current_snapshot#>>'{post,property_revision}' is distinct from current_snapshot#>>'{property,revision}'
 then raise exception 'content context changed' using errcode='40001';end if;
 if not exists(select 1 from jsonb_array_elements(current_snapshot->'facts') f where f->>'key'='status' and f->'value'='"ACTIVE"'::jsonb)
 or exists(select 1 from jsonb_array_elements(current_snapshot->'facts') f where f->>'status'<>'CONFIRMED'
  or (f->>'verifiedAt')::timestamptz>now()
  or (f->>'expiresAt')::timestamptz<=now()
  or (f->>'key' in ('status','price','availability') and (f->>'verifiedAt')::timestamptz<=now()-interval '24 hours')
  or not exists(select 1 from jsonb_array_elements(current_snapshot->'sources') src where src->>'id'=f->>'sourceId' and src->>'authorization_status'='APPROVED'))
 then raise exception 'evidence expired' using errcode='40001';end if;
 if exists(select 1 from jsonb_array_elements(current_snapshot->'events') e where e->>'confirmation_status'<>'CONFIRMED' or (e->>'start_at')::timestamptz<=now())
 then raise exception 'event expired' using errcode='40001';end if;
 rev:=(current_snapshot#>>'{property,revision}')::integer;
 if p_draft is null or p_draft->'blocked' is distinct from 'false'::jsonb or p_draft->>'generator' is distinct from 'controlled-v1'
  or p_draft->>'revision' is distinct from rev::text or jsonb_typeof(p_draft->'variants') is distinct from 'array'
  or jsonb_typeof(p_draft->'recipeIds') is distinct from 'array' or jsonb_typeof(p_draft->'claims') is distinct from 'array'
  or jsonb_array_length(p_draft->'variants')<>2
 then raise exception 'invalid draft' using errcode='22023';end if;
 if (select count(distinct v->>'channel') from jsonb_array_elements(p_draft->'variants') v where v->>'channel' in ('facebook','instagram'))<>2
 then raise exception 'invalid channels' using errcode='22023';end if;
 -- Only service role may call; text is composed by the trusted server, never accepted from browser.
 for variant in select value from jsonb_array_elements(p_draft->'variants') loop
  if coalesce(length(variant->>'body'),0) not between 1 and 6000 or coalesce(length(variant->>'cta'),0) not between 1 and 500
   or jsonb_typeof(variant->'claimIds') is distinct from 'array'
  then raise exception 'invalid variant' using errcode='22023';end if;
 end loop;
 insert into public.content_drafts(workspace_id,id,post_id,property_id,actor,revision,snapshot,draft)
 values(p_workspace,p_id,p_post,prop_id,p_actor,rev,p_snapshot,p_draft);
 -- Preserve earlier drafts in content_drafts; latest variants remain explicitly unapproved.
 insert into public.post_variants(workspace_id,post_id,channel,body,claim_refs,cta,link)
 select p_workspace,p_post,v->>'channel',v->>'body',v->'claimIds',v->>'cta',null from jsonb_array_elements(p_draft->'variants') v
 on conflict(workspace_id,post_id,channel) do update set body=excluded.body,claim_refs=excluded.claim_refs,cta=excluded.cta,link=null;
 insert into public.audit_log(workspace_id,actor,entity_id,action,change_summary)
 values(p_workspace,p_actor,p_post,'SAVE_CONTENT_DRAFT',jsonb_build_object('draftId',p_id,'revision',rev));
 return p_draft;
end $$;
revoke all on function public.save_content_draft(uuid,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_content_draft(uuid,uuid,uuid,uuid,jsonb,jsonb) to service_role;
commit;
