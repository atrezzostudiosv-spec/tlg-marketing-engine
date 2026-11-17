-- Persist editorial proposals only. This RPC cannot create ready or scheduled posts.
begin;
alter table public.events add unique(workspace_id,property_id,id);
alter table public.posts add column planner_day date;
alter table public.posts add column event_id uuid;
alter table public.posts add foreign key(workspace_id,property_id,event_id)
 references public.events(workspace_id,property_id,id);
create unique index planner_feed_day_unique on public.posts(workspace_id,planner_day)
 where planner_day is not null and workflow_state <> 'CANCELADO';
create unique index planner_event_unique on public.posts(workspace_id,event_id)
 where event_id is not null and workflow_state <> 'CANCELADO';
create table public.plan_batches(
 workspace_id uuid not null references public.workspaces,
 id uuid not null, actor uuid not null references auth.users,
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,id)
);
alter table public.plan_batches enable row level security;
revoke all on public.plan_batches from anon,authenticated;
-- History includes the saved strategy and event; security_invoker preserves tenant RLS.
create view public.calendar_history with (security_invoker=true) as
 select p.id,p.workspace_id,p.property_id,p.planned_at,p.format,p.editorial_state,p.workflow_state,
 p.property_revision,p.event_id,s.angle,s.goal
 from public.posts p left join public.strategies s on s.workspace_id=p.workspace_id and s.id=p.strategy_id;
revoke all on public.calendar_history from anon,authenticated;
grant select on public.calendar_history to authenticated;

create function public.save_editorial_plan(p_actor uuid,p_workspace uuid,p_batch uuid,p_start date,p_per_week integer,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 item jsonb; prop public.properties%rowtype; evt public.events%rowtype;
 d date; at_time timestamptz; prop_id uuid; event_ref uuid; fact_ref uuid; asset_ref uuid;
 angle_name text; goal_name text; fmt text; fact_keys text[]; keys_allowed text[];
 strategy_ref uuid; post_ref uuid; ord integer; block_start date; n integer;
 ids jsonb:='[]'::jsonb; prior public.plan_batches%rowtype;
 payload jsonb; result_value jsonb; now_value timestamptz:=now();
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor'))
 then raise exception 'not authorized' using errcode='42501'; end if;
 if p_batch is null or p_start is null or p_per_week is null or p_per_week not between 1 and 7
  or p_items is null or jsonb_typeof(p_items)<>'array'
 then raise exception 'invalid plan' using errcode='22023'; end if;
 if jsonb_array_length(p_items) not between 1 and 14 then raise exception 'invalid size' using errcode='22023'; end if;
 -- Serialize plan writes for the workspace and coordinate with property mutations.
 perform 1 from public.workspaces where id=p_workspace for update;
 payload:=jsonb_build_object('start',p_start,'perWeek',p_per_week,'items',p_items);
 select * into prior from public.plan_batches where workspace_id=p_workspace and id=p_batch;
 if found then
  if prior.actor<>p_actor or prior.payload<>payload then raise exception 'batch conflict' using errcode='40001'; end if;
  return prior.result;
 end if;
 if p_start<(now_value at time zone 'America/Chicago')::date or p_start>(now_value at time zone 'America/Chicago')::date+90
 then raise exception 'invalid window' using errcode='22023'; end if;
 perform 1 from public.properties where workspace_id=p_workspace
  and id in (select (x->>'propertyId')::uuid from jsonb_array_elements(p_items) x)
  order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  prop_id:=(item->>'propertyId')::uuid; d:=(item->>'day')::date;
  fmt:=item->>'format'; angle_name:=item->>'angle';
  event_ref:=nullif(item->>'eventId','')::uuid;
  if prop_id is null or d is null or d<p_start or d>p_start+13
   or fmt is null or fmt not in ('photo','carousel')
   or jsonb_typeof(item->'factIds') is distinct from 'array'
   or jsonb_typeof(item->'assetIds') is distinct from 'array'
  then raise exception 'invalid item' using errcode='22023'; end if;
  at_time:=(d+time '12:00') at time zone 'America/Chicago';
  if at_time<=now_value then raise exception 'slot expired' using errcode='40001'; end if;
  select * into prop from public.properties where workspace_id=p_workspace and id=prop_id;
  if not found or prop.status<>'ACTIVE' or prop.revision is distinct from (item->>'revision')::integer
  then raise exception 'property changed' using errcode='40001'; end if;
  if exists(select 1 from public.posts where workspace_id=p_workspace and workflow_state<>'CANCELADO'
   and format<>'story' and (planned_at at time zone 'America/Chicago')::date=d)
  then raise exception 'slot occupied' using errcode='40001'; end if;
  block_start:=p_start+case when d<p_start+7 then 0 else 7 end;
  select count(*) into n from public.posts where workspace_id=p_workspace and workflow_state<>'CANCELADO' and format<>'story'
    and (planned_at at time zone 'America/Chicago')::date between block_start and block_start+6;
  if n>=p_per_week then raise exception 'capacity changed' using errcode='40001'; end if;
  case angle_name
   when 'Distribución y superficie' then keys_allowed:=array['bedrooms','bathrooms','living_sqft']; goal_name:='Solicitar visita privada';
   when 'Terreno y dimensiones' then keys_allowed:=array['lot_acres']; goal_name:='Solicitar información de la propiedad';
   when 'Precio confirmado' then keys_allowed:=array['price']; goal_name:='Solicitar información actualizada';
   when 'Disponibilidad del alquiler' then
    if prop.transaction_type<>'LEASE' then raise exception 'invalid rental angle' using errcode='22023'; end if;
    keys_allowed:=array['availability']; goal_name:='Solicitar condiciones de alquiler';
   when 'Descripción oficial por revisar' then keys_allowed:=array['description']; goal_name:='Identificar un argumento verificable';
   when 'Presentación del listing' then keys_allowed:=array[]::text[]; goal_name:=case when prop.transaction_type='LEASE' then 'Solicitar información del alquiler' else 'Solicitar detalles o visita privada' end;
   when 'Open House confirmado' then keys_allowed:=array[]::text[]; goal_name:='Promover asistencia al evento confirmado';
   else raise exception 'invalid angle' using errcode='22023';
  end case;
  if angle_name='Open House confirmado' then
   select * into evt from public.events where workspace_id=p_workspace and property_id=prop_id and id=event_ref for share;
   if not found or evt.confirmation_status<>'CONFIRMED' or upper(regexp_replace(evt.type,'[ _-]','','g'))<>'OPENHOUSE'
    or evt.start_at<=now_value or evt.end_at<=evt.start_at
    or (evt.start_at at time zone 'America/Chicago')::date-d not between 1 and 3
    or exists(select 1 from public.posts where workspace_id=p_workspace and event_id=event_ref and workflow_state<>'CANCELADO')
   then raise exception 'event changed' using errcode='40001'; end if;
  elsif event_ref is not null then raise exception 'unexpected event' using errcode='22023'; end if;
  if jsonb_array_length(item->'factIds') not between 1 and 4 then raise exception 'invalid facts' using errcode='22023'; end if;
  fact_keys:=array[]::text[];
  for fact_ref in select value::uuid from jsonb_array_elements_text(item->'factIds') loop
   declare k text; begin
    select f.key into k from public.property_facts f join public.sources s on s.workspace_id=f.workspace_id and s.id=f.source_id
    where f.workspace_id=p_workspace and f.property_id=prop_id and f.id=fact_ref
     and s.property_id=prop_id and s.authorization_status='APPROVED' and s.obtained_at<=now_value
     and f.verification_status='CONFIRMED' and f.verified_at<=now_value and (f.expires_at is null or f.expires_at>now_value)
     and (f.key not in ('status','price','availability') or f.verified_at>now_value-interval '24 hours')
     and (f.key<>'status' or f.typed_value='"ACTIVE"'::jsonb)
    for share of f,s;
    if not found or k=any(fact_keys) or (k<>'status' and not(k=any(keys_allowed)))
     then raise exception 'fact invalid or changed' using errcode='40001'; end if;
    fact_keys:=array_append(fact_keys,k);
   end;
  end loop;
  if not('status'=any(fact_keys)) or (cardinality(keys_allowed)>0 and cardinality(fact_keys)<2)
   then raise exception 'missing evidence' using errcode='22023'; end if;
  n:=jsonb_array_length(item->'assetIds');
  if n>5 or (fmt='photo' and n>1) or (fmt='carousel' and n<2) then raise exception 'invalid media count' using errcode='22023'; end if;
  if n<>(select count(distinct value) from jsonb_array_elements_text(item->'assetIds')) then raise exception 'duplicate media' using errcode='22023'; end if;
  for asset_ref in select value::uuid from jsonb_array_elements_text(item->'assetIds') loop
   perform 1 from public.assets where workspace_id=p_workspace and property_id=prop_id and id=asset_ref
    and media_type='image' and rights_status='APPROVED' and staging_status in ('ORIGINAL','VIRTUAL') and approved_at<=now_value for share;
   if not found then raise exception 'media changed' using errcode='40001'; end if;
  end loop;
  insert into public.strategies(workspace_id,property_id,angle,goal,revision)
   values(p_workspace,prop_id,angle_name,goal_name,prop.revision) returning id into strategy_ref;
  insert into public.strategy_facts(workspace_id,property_id,strategy_id,fact_id)
   select p_workspace,prop_id,strategy_ref,value::uuid from jsonb_array_elements_text(item->'factIds');
  insert into public.posts(workspace_id,property_id,planned_at,planner_day,format,property_revision,strategy_id,event_id)
   values(p_workspace,prop_id,at_time,d,fmt,prop.revision,strategy_ref,event_ref) returning id into post_ref;
  insert into public.post_assets(workspace_id,property_id,post_id,asset_id,ordinal)
   select p_workspace,prop_id,post_ref,value::uuid,ordinality::integer from jsonb_array_elements_text(item->'assetIds') with ordinality;
  ids:=ids||jsonb_build_array(post_ref);
 end loop;
 result_value:=jsonb_build_object('created',jsonb_array_length(ids),'postIds',ids);
 insert into public.plan_batches(workspace_id,id,actor,payload,result) values(p_workspace,p_batch,p_actor,payload,result_value);
 insert into public.audit_log(workspace_id,actor,entity_id,action,change_summary)
 values(p_workspace,p_actor,p_batch,'SAVE_EDITORIAL_PLAN',result_value);
 return result_value;
end $$;
revoke all on function public.save_editorial_plan(uuid,uuid,uuid,date,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_editorial_plan(uuid,uuid,uuid,date,integer,jsonb) to service_role;
commit;
