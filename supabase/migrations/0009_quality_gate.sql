begin;
create table public.package_approvals(
 workspace_id uuid not null, id uuid not null default gen_random_uuid(), post_id uuid not null, draft_id uuid not null,
 actor uuid not null references auth.users, context jsonb not null, package jsonb not null, review jsonb not null,
 approved_at timestamptz not null default now(), expires_at timestamptz not null,
 primary key(workspace_id,id), foreign key(workspace_id,post_id) references public.posts(workspace_id,id),
 foreign key(workspace_id,draft_id) references public.content_drafts(workspace_id,id)
);
alter table public.package_approvals enable row level security;
revoke all on public.package_approvals from anon,authenticated;
grant select(workspace_id,id,post_id,draft_id,approved_at,expires_at) on public.package_approvals to authenticated;
create policy tenant_read on public.package_approvals for select to authenticated using(public.can_access_workspace(workspace_id));
create function public.quality_context(p_actor uuid,p_workspace uuid,p_post uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; d public.content_drafts%rowtype;
begin
 ctx:=public.content_context(p_actor,p_workspace,p_post)-'history';
 select * into d from public.content_drafts where workspace_id=p_workspace and post_id=p_post order by created_at desc,id desc limit 1;
 return jsonb_build_object('input',ctx,'draftId',d.id,'draft',d.draft,'original',d.snapshot,
 'variants',coalesce((select jsonb_agg(jsonb_build_object('channel',channel,'body',body,'cta',cta,'claimIds',claim_refs) order by channel) from public.post_variants where workspace_id=p_workspace and post_id=p_post),'[]'::jsonb),
 'media',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'hash',a.sha256,'size',a.byte_size,'mime',a.mime_type,'exists',exists(select 1 from storage.objects o where o.bucket_id='tlg-private-media' and o.name=a.private_storage_key)) order by pa.ordinal) from public.post_assets pa join public.assets a on a.workspace_id=pa.workspace_id and a.id=pa.asset_id where pa.workspace_id=p_workspace and pa.post_id=p_post),'[]'::jsonb),
 'canApprove',exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role='owner'));
end $$;
create function public.approve_package(p_actor uuid,p_workspace uuid,p_post uuid,p_context jsonb,p_package jsonb,p_review jsonb,p_expires timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare ctx jsonb; pid uuid; approval uuid; now_value timestamptz:=now();
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role='owner') then raise exception 'owner approval required' using errcode='42501';end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 select property_id into pid from public.posts where workspace_id=p_workspace and id=p_post;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 perform 1 from public.properties where workspace_id=p_workspace and id=pid for update;
 perform 1 from public.posts where workspace_id=p_workspace and id=p_post for update;
 ctx:=public.quality_context(p_actor,p_workspace,p_post);
 if ctx is distinct from p_context or ctx#>>'{input,property,status}'<>'ACTIVE'
 or ctx#>>'{input,post,workflow_state}'<>'PENDIENTE' or ctx#>>'{input,post,editorial_state}' not in ('BORRADOR','REQUIERE_ATENCION','LISTO')
 or ctx#>>'{input,post,property_revision}' is distinct from ctx#>>'{input,property,revision}' or ctx->>'draftId' is null
 or (ctx#>>'{input,post,planned_at}')::timestamptz<=now_value
 then raise exception 'context changed' using errcode='40001';end if;
 if p_expires is null or p_expires<=now_value or p_expires>now_value+interval '15 minutes' or p_expires>(ctx#>>'{input,post,planned_at}')::timestamptz then raise exception 'invalid expiry' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(ctx#>'{input,facts}') f where f->>'key'='status' and f->'value'='"ACTIVE"'::jsonb)
 or exists(select 1 from jsonb_array_elements(ctx#>'{input,facts}') f where f->>'status'<>'CONFIRMED' or (f->>'verifiedAt')::timestamptz>now_value or (f->>'expiresAt')::timestamptz<p_expires or (f->>'key' in ('status','price','availability') and (f->>'verifiedAt')::timestamptz+interval '24 hours'<p_expires) or not exists(select 1 from jsonb_array_elements(ctx#>'{input,sources}') s where s->>'id'=f->>'sourceId' and s->>'authorization_status'='APPROVED'))
 or exists(select 1 from jsonb_array_elements(ctx#>'{input,events}') e where e->>'confirmation_status'<>'CONFIRMED' or (e->>'start_at')::timestamptz<p_expires)
 or jsonb_array_length(ctx->'media')=0 or exists(select 1 from jsonb_array_elements(ctx->'media') m where m->>'exists'<>'true' or m->>'hash' is null)
 then raise exception 'evidence changed' using errcode='40001';end if;
 if p_review->'attested' is distinct from 'true'::jsonb or coalesce(length(btrim(p_review->>'signature')),0) not between 1 and 300 or coalesce(length(btrim(p_review->>'policyReference')),0) not between 1 and 500
 or coalesce(length(p_package->>'facebook'),0)=0 or coalesce(length(p_package->>'instagram'),0)=0 or coalesce(length(p_package->>'storyText'),0)=0
 or p_package->'assetIds' is distinct from ctx#>'{input,assetIds}' then raise exception 'invalid review' using errcode='22023';end if;
 -- Only trusted server can invoke this function, after exact draft reconstruction and byte checks.
 insert into public.package_approvals(workspace_id,post_id,draft_id,actor,context,package,review,expires_at)
 values(p_workspace,p_post,(ctx->>'draftId')::uuid,p_actor,ctx,p_package,p_review,p_expires) returning id into approval;
 update public.posts set editorial_state='LISTO' where workspace_id=p_workspace and id=p_post;
 insert into public.audit_log(workspace_id,actor,entity_id,action,change_summary) values(p_workspace,p_actor,p_post,'APPROVE_PACKAGE',jsonb_build_object('approvalId',approval,'expiresAt',p_expires));
 return approval;
end $$;
revoke all on function public.quality_context(uuid,uuid,uuid),public.approve_package(uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.quality_context(uuid,uuid,uuid),public.approve_package(uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz) to service_role;
commit;
