-- =========================================================================
-- G12 - Make immutable_unaccent() independent of search_path (backup/restore
-- remediation). Same signature, same result; no table, index or data change.
-- =========================================================================
-- 20260904000005_phase07_discovery created
--   immutable_unaccent(text) = SELECT unaccent('unaccent', $1)
-- with UNQUALIFIED references to the unaccent extension function and
-- dictionary, and built 9 expression trigram indexes on it
-- (*_unaccent_trgm). PostgreSQL evaluates index expressions with a restricted
-- search_path in two places, where the unqualified call cannot be resolved:
-- 1. pg_restore (search_path = ''): restoring a pg_dump of any accepted
--    database fails "function unaccent(unknown, text) does not exist" for all
--    9 CREATE INDEX statements, so a restored database silently lacks them and
--    pg_restore exits non-zero (proven by G12 on a G11-baseline dump);
-- 2. autovacuum/auto-analyze of the 9 indexed tables, which logs the same
--    error on every run and never refreshes those tables' statistics.
-- Qualifying the function and the dictionary with the schema the migrations
-- install the extension into (public: every CREATE EXTENSION here runs with
-- the default search_path) makes both succeed. The function stays a plain
-- inlinable SQL function (no SET clause), and because unaccent(public.unaccent
-- dictionary, x) is exactly what the unqualified form resolved to under the
-- application's search_path, every existing index entry remains valid - no
-- REINDEX is required. Current application code no longer calls this function
-- (G11 search normalizes in TypeScript); it is kept because the accepted
-- indexes depend on it.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text AS
$$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
