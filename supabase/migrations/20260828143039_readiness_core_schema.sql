-- 5568 Readiness — core schema.
--
-- Terminology: there is no "audit" here. An audit is an act of an accredited
-- body; this product produces a readiness review. The names are the first place
-- that discipline either holds or leaks.

create extension if not exists pgcrypto;

create type public.review_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
create type public.review_depth as enum ('shallow', 'full');
create type public.verification_method as enum ('dns_txt', 'well_known_file');

-- ── tenancy ────────────────────────────────────────────────────────────────

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ── domains and the ownership gate ─────────────────────────────────────────

-- A shallow review is open to any public address; a deep one crawls hundreds of
-- pages, downloads every linked document and spends real money on judgement.
-- Depth is gated on proving control of the domain, never on payment.
create table public.domain_verifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  domain text not null check (domain = lower(domain) and domain !~ '[/:]'),
  verified_at timestamptz,
  method public.verification_method,
  -- Re-checked periodically: a domain can change hands, and a verification that
  -- was true in 2026 is not a standing licence to crawl it in 2028.
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, domain)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  target_url text not null,
  -- Reg. 35ו exempts by turnover and 35ד bounds the video duty the same way.
  -- NULL means unknown, and unknown means the duty applies — never read an
  -- absent value as the lenient one.
  obligation_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, target_url)
);

-- ── reviews ────────────────────────────────────────────────────────────────

create table public.review_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status public.review_status not null default 'queued',
  depth public.review_depth not null default 'shallow',
  requested_url text not null,

  -- Reg. 35 binds the standard "כתיקונם מזמן לזמן" — a rolling reference. Two
  -- reviews are comparable only against the same catalogue version, because a
  -- row can change when the site changes OR when the standard does, and those
  -- are different news. Recorded per run so a delta can refuse honestly.
  catalogue_version text,
  contract_version text,

  requested_max_pages integer not null default 5 check (requested_max_pages between 1 and 2000),
  -- What the run was actually allowed to cover, and why it differed. A review
  -- that quietly covered five pages of a two-hundred-page site while looking
  -- like a full one is the failure this product exists to avoid.
  applied_max_pages integer check (applied_max_pages between 1 and 2000),
  capped_reason text,

  ai_provider text,
  ai_budget_usd numeric(8,2) check (ai_budget_usd >= 0),
  ai_cost_usd numeric(8,2) check (ai_cost_usd >= 0),

  scanner_job_id text unique,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.report_artifacts (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references public.review_runs(id) on delete cascade,
  format text not null check (format in ('html', 'xlsx', 'json', 'pdf', 'remediation', 'fix_plan', 'screenshot')),
  -- R2 object key. Never served directly; always behind a signed URL.
  object_key text not null unique,
  bytes bigint check (bytes >= 0),
  created_at timestamptz not null default now()
);

-- ── indexes ────────────────────────────────────────────────────────────────

create index workspace_members_user_workspace_idx on public.workspace_members (user_id, workspace_id);
create index projects_workspace_updated_idx on public.projects (workspace_id, updated_at desc);
create index review_runs_project_status_created_idx on public.review_runs (project_id, status, created_at desc);
create index review_runs_requested_by_created_idx on public.review_runs (requested_by, created_at desc);
create index report_artifacts_run_idx on public.report_artifacts (review_run_id);
create index domain_verifications_workspace_idx on public.domain_verifications (workspace_id, domain);

-- ── row level security ─────────────────────────────────────────────────────

-- SECURITY DEFINER so the membership lookup does not re-enter the policy that
-- called it. Without this, any policy on workspace_members that consults
-- workspace_members recurses.
--
-- NOTE: superseded by 20260828143157, which moves this out of the REST-exposed
-- schema. Living in `public` made it callable at /rest/v1/rpc/.
create or replace function public.is_workspace_member(target uuid)
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

alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.domain_verifications  enable row level security;
alter table public.projects              enable row level security;
alter table public.review_runs           enable row level security;
alter table public.report_artifacts      enable row level security;

create policy workspaces_read on public.workspaces
  for select using (public.is_workspace_member(id));
create policy workspaces_insert on public.workspaces
  for insert with check (owner_id = auth.uid());
create policy workspaces_owner_write on public.workspaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy workspaces_owner_delete on public.workspaces
  for delete using (owner_id = auth.uid());

create policy members_read on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
create policy members_managed_by_owner on public.workspace_members
  for all using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create policy domains_member_all on public.domain_verifications
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy projects_member_all on public.projects
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy runs_member_all on public.review_runs
  for all using (exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.projects p where p.id = project_id and public.is_workspace_member(p.workspace_id)));

-- Artifacts are read-only to clients. Only the scanner, holding the service
-- role, records them — a client that could insert an artifact row could point
-- a report at an object it does not own.
create policy artifacts_member_read on public.report_artifacts
  for select using (exists (
    select 1 from public.review_runs r
    join public.projects p on p.id = r.project_id
    where r.id = review_run_id and public.is_workspace_member(p.workspace_id)
  ));
