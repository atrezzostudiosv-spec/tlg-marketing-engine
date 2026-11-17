-- Requires 0001. Apply in development and run isolation tests before production.
begin;
alter table public.property_facts add unique(workspace_id,property_id,id);
alter table public.strategy_facts add column property_id uuid;
update public.strategy_facts sf set property_id=s.property_id
 from public.strategies s where s.workspace_id=sf.workspace_id and s.id=sf.strategy_id;
alter table public.strategy_facts alter column property_id set not null;
alter table public.strategy_facts add foreign key(workspace_id,property_id,strategy_id)
 references public.strategies(workspace_id,property_id,id);
alter table public.strategy_facts add foreign key(workspace_id,property_id,fact_id)
 references public.property_facts(workspace_id,property_id,id);
-- Revoke direct mutation privileges as a second layer in addition to RLS.
do $$ declare t text; begin
 foreach t in array array['workspaces','workspace_members','properties','sources','property_facts','assets','events','strategies','strategy_facts','posts','post_variants','post_assets','checks','audit_log'] loop
  execute format('revoke all on table public.%I from anon, authenticated',t);
  execute format('grant select on table public.%I to authenticated',t);
 end loop;
end $$;
-- Private by default; no browser policies are added. Trusted backend must verify
-- workspace, property and asset authorization before issuing short-lived URLs.
insert into storage.buckets(id,name,public) values ('tlg-private-media','tlg-private-media',false)
 on conflict(id) do update set public=false;
-- Restrictive policies protect this bucket even if another permissive policy exists.
create policy tlg_media_server_only on storage.objects as restrictive
 for all to anon, authenticated
 using (bucket_id <> 'tlg-private-media')
 with check (bucket_id <> 'tlg-private-media');
commit;
