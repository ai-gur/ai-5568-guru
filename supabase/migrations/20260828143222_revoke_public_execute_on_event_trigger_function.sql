-- Revoking from anon and authenticated individually was not enough: functions
-- are granted EXECUTE to PUBLIC by default, and PUBLIC covers every role. This
-- takes away the default grant itself.
--
-- Safe for an event-trigger function: event triggers fire as their owner when
-- the DDL happens, and never through a caller's grant. RLS keeps being switched
-- on automatically for new tables in `public`; it simply stops being an
-- endpoint anyone can invoke.
revoke execute on function public.rls_auto_enable() from public;
