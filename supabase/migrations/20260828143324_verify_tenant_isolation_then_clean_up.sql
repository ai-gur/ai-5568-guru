-- Prove the policies actually isolate tenants, rather than merely existing.
-- RLS that looks right and does not work is worse than no RLS: it buys
-- confidence without buying separation. Seeds two tenants, checks what each can
-- see as the `authenticated` role, raises on any leak, and removes the data.

do $$
declare
  alice uuid := '11111111-1111-1111-1111-111111111111';
  bob   uuid := '22222222-2222-2222-2222-222222222222';
  ws_a  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  ws_b  uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  seen  integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (alice,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','alice@rls.invalid','x',now(),now(),now()),
         (bob,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated','bob@rls.invalid','x',now(),now(),now());

  insert into public.workspaces (id, name, owner_id) values (ws_a,'Alice Ltd',alice), (ws_b,'Bob Ltd',bob);
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_a,alice,'owner'), (ws_b,bob,'owner');
  insert into public.projects (workspace_id, name, target_url) values
    (ws_a,'Alice site','https://alice.rls.invalid/'), (ws_b,'Bob site','https://bob.rls.invalid/');

  -- ── as Alice ─────────────────────────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role','authenticated')::text, true);

  select count(*) into seen from public.workspaces;
  if seen <> 1 then raise exception 'RLS LEAK: Alice sees % workspaces, expected 1', seen; end if;

  select count(*) into seen from public.projects;
  if seen <> 1 then raise exception 'RLS LEAK: Alice sees % projects, expected 1', seen; end if;

  select count(*) into seen from public.projects where target_url like '%bob%';
  if seen <> 0 then raise exception 'RLS LEAK: Alice can read Bob''s project'; end if;

  -- ── as anonymous ─────────────────────────────────────────────────────────
  reset role;
  set local role anon;
  perform set_config('request.jwt.claims', NULL, true);

  select count(*) into seen from public.workspaces;
  if seen <> 0 then raise exception 'RLS LEAK: anon sees % workspaces, expected 0', seen; end if;

  select count(*) into seen from public.projects;
  if seen <> 0 then raise exception 'RLS LEAK: anon sees % projects, expected 0', seen; end if;

  reset role;
  raise notice 'tenant isolation verified';

  -- ── clean up: this is a test, not seed data ──────────────────────────────
  delete from public.workspaces where id in (ws_a, ws_b);
  delete from auth.users where id in (alice, bob);
end $$;
