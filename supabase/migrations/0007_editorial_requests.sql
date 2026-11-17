begin;
-- A maximum of 30 AI requests per workspace UTC day; retries with the same ID
-- do not consume another reservation. No provider call is authorized by the browser.
create table public.editorial_requests(
 workspace_id uuid not null references public.workspaces,
 id uuid not null, post_id uuid not null, actor uuid not null references auth.users,
 created_at timestamptz not null default now(),
 primary key(workspace_id,id),
 foreign key(workspace_id,post_id) references public.posts(workspace_id,id)
);
alter table public.editorial_requests enable row level security;
revoke all on public.editorial_requests from anon,authenticated;
create index editorial_requests_daily on public.editorial_requests(workspace_id,created_at);
create function public.reserve_editorial_request(p_actor uuid,p_workspace uuid,p_post uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prev public.editorial_requests%rowtype; saved public.content_drafts%rowtype;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor'))
 then raise exception 'not authorized' using errcode='42501';end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 if not exists(select 1 from public.posts where workspace_id=p_workspace and id=p_post and workflow_state='PENDIENTE' and editorial_state in ('BORRADOR','REQUIERE_ATENCION'))
 then raise exception 'not editable' using errcode='40001';end if;
 select * into saved from public.content_drafts where workspace_id=p_workspace and id=p_id;
 if found then
  if saved.actor<>p_actor or saved.post_id<>p_post then raise exception 'id conflict' using errcode='40001';end if;
  return jsonb_build_object('allowed',false,'draft',saved.draft);
 end if;
 select * into prev from public.editorial_requests where workspace_id=p_workspace and id=p_id;
 if found then
  if prev.actor<>p_actor or prev.post_id<>p_post then raise exception 'id conflict' using errcode='40001';end if;
  return jsonb_build_object('allowed',false);
 end if;
 if (select count(*) from public.editorial_requests where workspace_id=p_workspace and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=30
 then return jsonb_build_object('allowed',false);end if;
 insert into public.editorial_requests(workspace_id,id,post_id,actor) values(p_workspace,p_id,p_post,p_actor);
 return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.reserve_editorial_request(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_editorial_request(uuid,uuid,uuid,uuid) to service_role;
commit;
