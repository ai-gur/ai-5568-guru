# Supabase — 5568 Readiness

Project `ai-5568-guru` · region `eu-west-1` (Ireland — the closest available to Israel).

The migrations here are the record of what was applied. They are kept in the
repository because a schema that exists only in a dashboard is a schema nobody
can review, reproduce, or roll back.

| version | what it does |
|---|---|
| `20260828143039_readiness_core_schema` | tenancy, domains, projects, review runs, artifacts, RLS |
| `20260828143157_move_rls_helper_out_of_the_public_api` | takes the membership helper off the public REST surface |
| `20260828143222_revoke_public_execute_on_event_trigger_function` | removes the default PUBLIC grant that the previous revoke did not cover |
| `20260828143324_verify_tenant_isolation_then_clean_up` | proves the policies isolate tenants, then deletes its own data |

## Two decisions worth knowing

**No table is called anything with "audit" in it.** An audit is an act of an
accredited body; this product produces a readiness review. Naming is the first
place that distinction either holds or leaks.

**`review_runs` records `catalogue_version`.** Regulation 35 binds ת"י 5568
"כתיקונם מזמן לזמן" — a rolling reference — so a row that differs between two
reviews may differ because the site changed or because the standard did. Without
the version on the run, a delta cannot tell those apart, and it should refuse to
try.

## Verification

`get_advisors(type: security)` returns an empty list. That is necessary and not
sufficient: the isolation migration seeds two tenants, asserts that neither can
read the other and that `anon` reads nothing, raises on any leak, and removes
its own data. RLS that looks right and does not work buys confidence without
buying separation.
