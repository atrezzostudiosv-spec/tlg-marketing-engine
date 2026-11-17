begin;
alter table public.assets add column filename text, add column mime_type text, add column byte_size integer, add column sha256 text, add column visual_role text not null default 'other' check(visual_role in ('exterior','living','kitchen','bedroom','bathroom','outdoor','other'));
alter table public.assets add unique(workspace_id,private_storage_key);
create function public.media_permission(p_actor uuid,p_workspace uuid,p_property uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor')) then raise exception 'not authorized' using errcode='42501';end if;
 if not exists(select 1 from public.properties where workspace_id=p_workspace and id=p_property) then raise exception 'not found' using errcode='P0002';end if;
 return true;
end $$;
create function public.register_media(p_actor uuid,p_workspace uuid,p_property uuid,p_id uuid,p_filename text,p_mime text,p_size integer,p_hash text,p_staging text,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare object_key text; ext text;
begin
 perform public.media_permission(p_actor,p_workspace,p_property);
 ext:=case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' end;
 if p_id is null or ext is null or p_size is null or p_size not between 1 and 6291456 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_filename is null or length(p_filename) not between 1 and 200 or p_staging is null or p_staging not in ('ORIGINAL','VIRTUAL') or p_role is null or p_role not in ('exterior','living','kitchen','bedroom','bathroom','outdoor','other') then raise exception 'invalid media' using errcode='22023';end if;
 object_key:=p_workspace::text||'/'||p_property::text||'/'||p_id::text||'.'||ext;
 perform 1 from public.properties where workspace_id=p_workspace and id=p_property for update;
 if not exists(select 1 from storage.objects where bucket_id='tlg-private-media' and name=object_key) then raise exception 'storage object missing' using errcode='40001';end if;
 insert into public.assets(workspace_id,id,property_id,private_storage_key,media_type,rights_status,staging_status,approved_at,filename,mime_type,byte_size,sha256,visual_role)
 values(p_workspace,p_id,p_property,object_key,case when ext='mp4' then 'video' else 'image' end,'APPROVED',p_staging,now(),p_filename,p_mime,p_size,p_hash,p_role);
 insert into public.audit_log(workspace_id,actor,entity_id,action,change_summary) values(p_workspace,p_actor,p_id,'REGISTER_MEDIA',jsonb_build_object('property',p_property,'basis','operator_attestation','staging',p_staging,'sha256',p_hash));
 return p_id;
end $$;
create function public.media_preview_context(p_actor uuid,p_workspace uuid,p_asset uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assets%rowtype;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor) then raise exception 'not authorized' using errcode='42501';end if;
 select * into a from public.assets where workspace_id=p_workspace and id=p_asset and rights_status='APPROVED' and staging_status in ('ORIGINAL','VIRTUAL') and approved_at<=now() and sha256 is not null;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 return jsonb_build_object('key',a.private_storage_key,'mime',a.mime_type,'size',a.byte_size,'hash',a.sha256);
end $$;
create function public.select_post_media(p_actor uuid,p_workspace uuid,p_post uuid,p_revision integer,p_expected uuid[],p_assets uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.posts%rowtype; prop public.properties%rowtype; pid uuid; a uuid; current_ids uuid[]; n integer;
begin
 if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor')) then raise exception 'not authorized' using errcode='42501';end if;
 select property_id into pid from public.posts where workspace_id=p_workspace and id=p_post;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into prop from public.properties where workspace_id=p_workspace and id=pid for update;
 select * into p from public.posts where workspace_id=p_workspace and id=p_post for update;
 if prop.status<>'ACTIVE' or prop.revision is distinct from p_revision or p.property_revision is distinct from p_revision or p.workflow_state<>'PENDIENTE' or p.editorial_state not in ('BORRADOR','REQUIERE_ATENCION') then raise exception 'post changed' using errcode='40001';end if;
 select coalesce(array_agg(asset_id order by ordinal),array[]::uuid[]) into current_ids from public.post_assets where workspace_id=p_workspace and post_id=p_post;
 if current_ids is distinct from p_expected then raise exception 'media order changed' using errcode='40001';end if;
 n:=cardinality(p_assets);
 if n is null or n>5 or n<1 or n<>(select count(distinct x) from unnest(p_assets) x) or (p.format in ('photo','reel','story') and n<>1) or (p.format='carousel' and n<2) then raise exception 'invalid selection' using errcode='22023';end if;
 foreach a in array p_assets loop
  perform 1 from public.assets aa where aa.workspace_id=p_workspace and aa.property_id=pid and aa.id=a and aa.rights_status='APPROVED' and aa.staging_status in ('ORIGINAL','VIRTUAL') and aa.approved_at<=now() and aa.sha256 is not null and (p.format='story' or aa.media_type=case when p.format='reel' then 'video' else 'image' end) and exists(select 1 from storage.objects o where o.bucket_id='tlg-private-media' and o.name=aa.private_storage_key) for share;
  if not found then raise exception 'invalid asset' using errcode='22023';end if;
 end loop;
 if current_ids=p_assets then return jsonb_build_object('changed',false);end if;
 delete from public.post_assets where workspace_id=p_workspace and post_id=p_post;
 insert into public.post_assets(workspace_id,property_id,post_id,asset_id,ordinal) select p_workspace,pid,p_post,x,ord::integer from unnest(p_assets) with ordinality t(x,ord);
 delete from public.post_variants where workspace_id=p_workspace and post_id=p_post;
 update public.posts set editorial_state='BORRADOR' where workspace_id=p_workspace and id=p_post;
 insert into public.audit_log(workspace_id,actor,entity_id,action,change_summary) values(p_workspace,p_actor,p_post,'SELECT_MEDIA',jsonb_build_object('previous',current_ids,'selected',p_assets));
 return jsonb_build_object('changed',true);
end $$;
revoke all on function public.media_permission(uuid,uuid,uuid),public.register_media(uuid,uuid,uuid,uuid,text,text,integer,text,text,text),public.media_preview_context(uuid,uuid,uuid),public.select_post_media(uuid,uuid,uuid,integer,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.media_permission(uuid,uuid,uuid),public.register_media(uuid,uuid,uuid,uuid,text,text,integer,text,text,text),public.media_preview_context(uuid,uuid,uuid),public.select_post_media(uuid,uuid,uuid,integer,uuid[],uuid[]) to service_role;
commit;
