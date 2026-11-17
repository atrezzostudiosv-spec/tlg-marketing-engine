-- Minimal Supabase-compatible scaffolding for PostgreSQL CI only.
-- Does not emulate the full Supabase Auth, PostgREST or Storage APIs.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
-- Deliberately permissive policy verifies the restrictive private bucket rule wins.
create policy test_permissive on storage.objects for all to authenticated,anon using(true) with check(true);
