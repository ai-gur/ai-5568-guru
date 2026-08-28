-- The membership helper is an internal part of RLS, not an endpoint.
--
-- Anything in `public` is published by PostgREST, so `is_workspace_member` was
-- reachable at /rest/v1/rpc/is_workspace_member — by anon, unauthenticated. It
-- is SECURITY DEFINER (it has to be, or a policy on workspace_members that
-- consults workspace_members recurses), which makes an exposed membership
-- oracle exactly the kind of thing not to leave lying around.
--
-- Moving it to a schema PostgREST does not serve removes the endpoint while
-- leaving RLS able to call it: policies need USAGE on the schema and EXECUTE on
-- the function, both of which are granted below.

create schema if not exists private;
grant usage on schema private to authenticated, anon, service_role;

create or replace function private.is_workspace_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target and m.user_id = auth.uid()
  );
$fn$;

-- Policies must be rebuilt to point at the new location before the old
-- function can go.
drop policy if exists workspaces_read       on public.workspaces;
drop policy if exists members_read          on public.workspace_members;
drop policy if exists domains_member_all    on public.domain_verifications;
drop policy if exists projects_member_all   on public.projects;
drop policy if exists runs_member_all       on public.review_runs;
drop policy if exists artifacts_member_read on public.report_artifacts;

create policy workspaces_read on public.workspaces
  for select using (private.is_workspace_member(id));

create policy members_read on public.workspace_members
  for select using (private.is_workspace_member(workspace_id));

create policy domains_member_all on public.domain_verifications
  for all using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy projects_member_all on public.projects
  for all using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy runs_member_all on public.review_runs
  for all using (exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and private.is_workspace_member(p.workspace_id)));

create policy artifacts_member_read on public.report_artifacts
  for select using (exists (
    select 1 from public.review_runs r
    join public.projects p on p.id = r.project_id
    where r.id = review_run_id and private.is_workspace_member(p.workspace_id)
  ));

drop function if exists public.is_workspace_member(uuid);

-- Not ours: an event-trigger function that switches RLS on for every new table
-- in `public`. Left in place because that is a useful safety net, but it has no
-- business being callable over the API — an event trigger fires as its owner
-- and does not need these grants.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
