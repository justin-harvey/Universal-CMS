-- mail-first-cms — API-role privileges (M1 fix)
--
-- The 0001–0005 tables are reached by PostgREST as one of the API roles:
-- anon (publishable key), authenticated (a logged-in editor), or service_role
-- (the secret key used by materialize / invite / the email pipeline).
--
-- RLS is the row-level boundary (set up in 0001/0002), but RLS only runs AFTER
-- Postgres' table-level GRANT check passes. Newer Supabase projects do NOT
-- grant DML (select/insert/update/delete) to the API roles by default — the
-- roles start with only REFERENCES/TRIGGER/TRUNCATE — so every request fails
-- with "permission denied for table" before RLS is ever consulted. The 0001–
-- 0005 migrations assumed the older default-privilege behaviour and so never
-- granted these explicitly. This migration makes the grants explicit and
-- idempotent so the spine works on any project, old defaults or new.
--
-- Division of privilege (RLS still decides which ROWS each role sees):
--   service_role  — full DML; bypasses RLS. The trusted build/server role.
--   authenticated — full DML; RLS (public.is_editor()) gates it to editors.
--   anon          — SELECT only; RLS returns the rows a policy allows (none on
--                   the protected tables), so anon is denied by policy, not by
--                   a missing grant. anon never writes.

grant usage on schema public to anon, authenticated, service_role;

-- service_role: everything (it is the bypass-RLS trusted role).
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- authenticated: DML; RLS policies restrict to editors/admins.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- anon: read-only; RLS still filters rows (protected tables expose none).
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon;

-- Future objects created in public (e.g. a later migration) inherit the same.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant execute on functions to anon;
