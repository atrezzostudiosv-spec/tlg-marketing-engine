-- Initial schema; apply only to a provisioned development Supabase project.
begin;
create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null
);
create table public.workspace_members (
 workspace_id uuid references public.workspaces on delete cascade,
 user_id uuid references auth.users on delete cascade,
 role text not null check (role in ('owner','editor','viewer')),
 primary key(workspace_id,user_id)
);
create or replace function public.can_access_workspace(w uuid, write_access boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.workspace_members m
 where m.workspace_id = w and m.user_id = auth.uid()
 and (not write_access or m.role in ('owner','editor'))) $$;
revoke all on function public.can_access_workspace(uuid,boolean) from public;
grant execute on function public.can_access_workspace(uuid,boolean) to authenticated;

create table public.properties (
 workspace_id uuid not null references public.workspaces,
 id uuid not null default gen_random_uuid(),
 address text not null, locality text not null,
 transaction_type text not null check (transaction_type in ('SALE','LEASE')),
 status text not null check(status in ('ACTIVE','PENDING','SOLD','LEASED','WITHDRAWN','EXCLUDED')),
 priority integer not null default 0 check(priority between 0 and 100),
 revision integer not null default 1 check(revision > 0),
 primary key(workspace_id,id)
);
create table public.sources (
 workspace_id uuid not null references public.workspaces,
 id uuid not null default gen_random_uuid(),
 type text not null, reference text not null, obtained_at timestamptz not null,
 authorization text not null check(authorization in ('APPROVED','UNKNOWN','DENIED')),
 notes text,
 primary key(workspace_id,id)
);
create table public.property_facts (
 workspace_id uuid not null,
 id uuid not null default gen_random_uuid(),
 property_id uuid not null, key text not null, typed_value jsonb not null, unit text,
 source_id uuid not null, verified_at timestamptz not null, expires_at timestamptz,
 verification_status text not null check(verification_status in ('CONFIRMED','UNCONFIRMED','CONFLICT')),
 primary key(workspace_id,id),
 unique(workspace_id,property_id,key),
 foreign key(workspace_id,property_id) references public.properties(workspace_id,id),
 foreign key(workspace_id,source_id) references public.sources(workspace_id,id),
 check(expires_at is null or expires_at > verified_at)
);
create table public.assets (
 workspace_id uuid not null,
 id uuid not null default gen_random_uuid(),
 property_id uuid not null, private_storage_key text not null,
 media_type text not null check(media_type in ('image','video')),
 rights_status text not null check(rights_status in ('APPROVED','UNKNOWN','DENIED')),
 staging_status text not null check(staging_status in ('ORIGINAL','VIRTUAL','UNKNOWN')),
 approved_at timestamptz,
 primary key(workspace_id,id),
 unique(workspace_id,property_id,id),
 foreign key(workspace_id,property_id) references public.properties(workspace_id,id),
 check(split_part(private_storage_key,'/',1)=workspace_id::text)
);
create table public.events (
 workspace_id uuid not null, id uuid not null default gen_random_uuid(),
 property_id uuid not null, type text not null, start_at timestamptz not null,
 end_at timestamptz not null, timezone text not null default 'America/Chicago',
 confirmation_status text not null check(confirmation_status in ('CONFIRMED','UNCONFIRMED','CANCELLED')),
 primary key(workspace_id,id),
 foreign key(workspace_id,property_id) references public.properties(workspace_id,id),
 check(end_at > start_at)
);
create table public.strategies (
 workspace_id uuid not null, id uuid not null default gen_random_uuid(),
 property_id uuid not null, angle text not null, goal text not null, revision integer not null,
 primary key(workspace_id,id),
 unique(workspace_id,property_id,id),
 foreign key(workspace_id,property_id) references public.properties(workspace_id,id)
);
create table public.strategy_facts (
 workspace_id uuid not null, strategy_id uuid not null, fact_id uuid not null,
 primary key(workspace_id,strategy_id,fact_id),
 foreign key(workspace_id,strategy_id) references public.strategies(workspace_id,id),
 foreign key(workspace_id,fact_id) references public.property_facts(workspace_id,id)
);
create table public.posts (
 workspace_id uuid not null, id uuid not null default gen_random_uuid(),
 property_id uuid not null, planned_at timestamptz not null, timezone text not null default 'America/Chicago',
 format text not null check(format in ('carousel','photo','reel','story')),
 editorial_state text not null default 'BORRADOR' check(editorial_state in ('BORRADOR','VALIDANDO','LISTO','REQUIERE_ATENCION','BLOQUEADO')),
 workflow_state text not null default 'PENDIENTE' check(workflow_state in ('PENDIENTE','PROGRAMADO','PUBLICADO','CANCELADO')),
 property_revision integer not null, strategy_id uuid,
 primary key(workspace_id,id),
 unique(workspace_id,property_id,id),
 foreign key(workspace_id,property_id) references public.properties(workspace_id,id),
 foreign key(workspace_id,property_id,strategy_id) references public.strategies(workspace_id,property_id,id)
);
create table public.post_variants (
 workspace_id uuid not null, post_id uuid not null, channel text not null check(channel in ('facebook','instagram')),
 body text not null, claim_refs jsonb not null default '[]', cta text not null, link text,
 primary key(workspace_id,post_id,channel),
 foreign key(workspace_id,post_id) references public.posts(workspace_id,id)
);
create table public.post_assets (
 workspace_id uuid not null, property_id uuid not null, post_id uuid not null, asset_id uuid not null,
 ordinal integer not null check(ordinal > 0),
 primary key(workspace_id,post_id,ordinal),
 unique(workspace_id,post_id,asset_id),
 foreign key(workspace_id,property_id,post_id) references public.posts(workspace_id,property_id,id),
 foreign key(workspace_id,property_id,asset_id) references public.assets(workspace_id,property_id,id)
);
create table public.checks (
 workspace_id uuid not null, id uuid not null default gen_random_uuid(), post_id uuid not null,
 rule_id text not null, outcome text not null check(outcome in ('PASS','FAIL','REVIEW')),
 evidence jsonb not null, checked_at timestamptz not null default now(),
 primary key(workspace_id,id),
 foreign key(workspace_id,post_id) references public.posts(workspace_id,id)
);
create table public.audit_log (
 workspace_id uuid not null references public.workspaces, id uuid not null default gen_random_uuid(),
 actor uuid references auth.users, entity_id uuid not null, action text not null,
 timestamp timestamptz not null default now(), change_summary jsonb not null,
 primary key(workspace_id,id)
);
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(public.can_access_workspace(id));
create policy membership_read on public.workspace_members for select to authenticated using(user_id = auth.uid());
-- Default-deny writes. Until the trusted mutation API exists, authenticated clients
-- can only read their own workspace. No browser-side approval or audit mutations.
do $$ declare t text; begin
 foreach t in array array['properties','sources','property_facts','assets','events','strategies','strategy_facts','posts','post_variants','post_assets','checks','audit_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using(public.can_access_workspace(workspace_id))',t);
 end loop;
end $$;
create index posts_calendar_idx on public.posts(workspace_id,planned_at);
create index facts_property_idx on public.property_facts(workspace_id,property_id);
commit;
