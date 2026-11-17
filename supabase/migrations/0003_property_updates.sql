-- Transactional inventory updates. RPC callable only by trusted backend.
begin;
create table public.post_alerts (
 workspace_id uuid not null,
 id uuid not null default gen_random_uuid(),
 post_id uuid not null,
 property_revision integer not null,
 kind text not null check(kind in ('EXTERNAL_SCHEDULE_REVIEW')),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 primary key(workspace_id,id),
 unique(workspace_id,post_id,property_revision,kind),
 foreign key(workspace_id,post_id) references public.posts(workspace_id,id)
);
alter table public.post_alerts enable row level security;
revoke all on public.post_alerts from anon,authenticated;
grant select on public.post_alerts to authenticated;
create policy tenant_read on public.post_alerts for select to authenticated
 using(public.can_access_workspace(workspace_id));

create function public.confirm_property_fact(
 p_actor uuid, p_workspace uuid, p_property uuid, p_source uuid,
 p_expected_revision integer, p_key text, p_value jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 prop public.properties%rowtype;
 prior public.property_facts%rowtype;
 changed boolean;
 new_revision integer;
 pending_count integer := 0;
 external_count integer := 0;
 current_time_value timestamptz := now();
begin
 -- Identity is derived from a verified user token by the server, not from request JSON.
 if not exists(select 1 from public.workspace_members m
   where m.workspace_id=p_workspace and m.user_id=p_actor and m.role in ('owner','editor'))
 then raise exception 'not authorized' using errcode='42501'; end if;
 select * into prop from public.properties
  where workspace_id=p_workspace and id=p_property for update;
 if not found then raise exception 'property not found' using errcode='P0002'; end if;
 if prop.revision is distinct from p_expected_revision
 then raise exception 'revision conflict' using errcode='40001'; end if;

 perform 1 from public.sources where workspace_id=p_workspace and id=p_source
  and authorization_status='APPROVED' and obtained_at <= current_time_value for share;
 if not found then raise exception 'source not approved' using errcode='22023'; end if;
 if p_key is null or p_key not in ('status','price') or p_value is null
 then raise exception 'unsupported fact' using errcode='22023'; end if;
 if p_key='status' then
  if jsonb_typeof(p_value) <> 'string' or p_value #>> '{}' not in
   ('ACTIVE','PENDING','SOLD','LEASED','WITHDRAWN','EXCLUDED')
  then raise exception 'invalid status' using errcode='22023'; end if;
 else
  if jsonb_typeof(p_value) <> 'number' then raise exception 'invalid price' using errcode='22023'; end if;
  if (p_value #>> '{}')::numeric <= 0 or (p_value #>> '{}')::numeric > 100000000000
  then raise exception 'invalid price' using errcode='22023'; end if;
 end if;

 select * into prior from public.property_facts
  where workspace_id=p_workspace and property_id=p_property and key=p_key;
 changed := not found or prior.typed_value is distinct from p_value
   or prior.source_id is distinct from p_source
   or prior.verification_status is distinct from 'CONFIRMED'
   or (p_key='status' and prop.status is distinct from (p_value #>> '{}'));
 insert into public.property_facts(workspace_id,property_id,key,typed_value,unit,source_id,verified_at,expires_at,verification_status)
 values(p_workspace,p_property,p_key,p_value,
  case when p_key='price' then case when prop.transaction_type='LEASE' then 'USD/month' else 'USD' end end,
  p_source,current_time_value,current_time_value+interval '24 hours','CONFIRMED')
 on conflict(workspace_id,property_id,key) do update set
  typed_value=excluded.typed_value,unit=excluded.unit,source_id=excluded.source_id,
  verified_at=excluded.verified_at,expires_at=excluded.expires_at,verification_status=excluded.verification_status;

 new_revision := prop.revision;
 if changed then
  update public.properties set revision=revision+1,
   status=case when p_key='status' then p_value #>> '{}' else status end
   where workspace_id=p_workspace and id=p_property returning revision into new_revision;
  -- Pending drafts are invalidated; externally scheduled posts retain their real workflow state.
  update public.posts set editorial_state='BLOQUEADO',
   workflow_state=case when p_key='status' and (p_value #>> '{}') <> 'ACTIVE'
    then 'CANCELADO' else workflow_state end
   where workspace_id=p_workspace and property_id=p_property and workflow_state='PENDIENTE';
  get diagnostics pending_count=row_count;
  update public.posts set editorial_state='BLOQUEADO'
   where workspace_id=p_workspace and property_id=p_property and workflow_state='PROGRAMADO';
  get diagnostics external_count=row_count;
  insert into public.post_alerts(workspace_id,post_id,property_revision,kind)
   select workspace_id,id,new_revision,'EXTERNAL_SCHEDULE_REVIEW' from public.posts
   where workspace_id=p_workspace and property_id=p_property and workflow_state='PROGRAMADO'
   on conflict do nothing;
 end if;
 insert into public.audit_log(workspace_id,actor,entity_id,action,change_summary)
 values(p_workspace,p_actor,p_property,'CONFIRM_FACT',
  jsonb_build_object('key',p_key,'previous',prior.typed_value,'value',p_value,
   'source',p_source,'revision',new_revision,'changed',changed,
   'pending_invalidated',pending_count,'external_review',external_count));
 return jsonb_build_object('revision',new_revision,'changed',changed,
   'pending_invalidated',pending_count,'external_review',external_count);
end $$;
revoke all on function public.confirm_property_fact(uuid,uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_property_fact(uuid,uuid,uuid,uuid,integer,text,jsonb) to service_role;
commit;
