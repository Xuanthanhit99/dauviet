-- G12 certification snapshot (read-only). Emits one NOTICE line per fact:
--   TABLE|<table>|<rowCount>|<md5 of every row, order-independent>
--   TABLE_EXCL|<table>|<rowCount>|<md5 excluding the columns G12 is expected to change>
--   SCHEMA|<facet>|<md5>
--   MIGRATION|<name>|<checksum>|<finished>|<rolledBack>
-- Creates no object and writes nothing, so it can be run BEFORE and AFTER a
-- migration on the same database (Path B) and on a fresh one (Path A).
-- Usage: docker exec -i <pg-container> psql -U <user> -d <db> -q -f - < scripts/g12/db-snapshot.sql 2>&1
SET client_min_messages = notice;
DO $$
DECLARE
  r record;
  c bigint;
  h text;
  excl jsonb := jsonb_build_object(
    'HistoricalEvent', ARRAY['dateChronologyStart', 'dateChronologyEnd'],
    'HistoricalFact', ARRAY['dateChronologyStart', 'dateChronologyEnd'],
    'Person', ARRAY['birthChronologyStart', 'birthChronologyEnd', 'deathChronologyStart', 'deathChronologyEnd'],
    'HistoricalEra', ARRAY['chronologyStart', 'chronologyEnd'],
    'Dynasty', ARRAY['chronologyStart', 'chronologyEnd'],
    'Territory', ARRAY['chronologyStart', 'chronologyEnd'],
    'SearchDocument', ARRAY['id', 'chronologyStart', 'chronologyEnd', 'projectedAt']
  );
  cols text[];
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
    EXECUTE format(
      'SELECT count(*), coalesce(md5(string_agg(x, '','' ORDER BY x)), ''empty'') FROM (SELECT md5(t::text) AS x FROM %I t) s',
      r.tablename) INTO c, h;
    RAISE NOTICE 'TABLE|%|%|%', r.tablename, c, h;
    -- Content without bookkeeping timestamps (seed re-runs legitimately re-stamp updatedAt).
    EXECUTE format(
      'SELECT count(*), coalesce(md5(string_agg(x, '','' ORDER BY x)), ''empty'') FROM (SELECT md5((to_jsonb(t) - ''updatedAt'' - ''projectedAt'' - ''enqueuedAt'' - ''lockedAt'')::text) AS x FROM %I t) s',
      r.tablename) INTO c, h;
    RAISE NOTICE 'TABLE_CONTENT|%|%|%', r.tablename, c, h;
    IF excl ? r.tablename THEN
      SELECT array_agg(v) INTO cols FROM jsonb_array_elements_text(excl -> r.tablename) v;
      EXECUTE format(
        'SELECT count(*), coalesce(md5(string_agg(x, '','' ORDER BY x)), ''empty'') FROM (SELECT md5((to_jsonb(t) - $1)::text) AS x FROM %I t) s',
        r.tablename) INTO c, h USING cols;
      RAISE NOTICE 'TABLE_EXCL|%|%|%', r.tablename, c, h;
    END IF;
  END LOOP;

  -- SearchTerm rows are re-created (new surrogate ids) whenever the projection refreshes an entity;
  -- hash their content keyed by the owning document's (entityKind, entityId) instead of ids.
  IF to_regclass('public."SearchTerm"') IS NOT NULL THEN
    SELECT count(*), coalesce(md5(string_agg(x, ',' ORDER BY x)), 'empty') INTO c, h FROM (
      SELECT md5((to_jsonb(t) - 'id' - 'documentId' || jsonb_build_object('doc', d."entityKind" || ':' || d."entityId"))::text) AS x
      FROM "SearchTerm" t JOIN "SearchDocument" d ON d.id = t."documentId") s;
    RAISE NOTICE 'TABLE_EXCL|SearchTerm|%|%', c, h;
  END IF;

  SELECT md5(string_agg(format('%s.%s:%s:%s:%s', table_name, column_name, data_type, udt_name, is_nullable) || ':' || coalesce(column_default, ''), ',' ORDER BY table_name, column_name))
    INTO h FROM information_schema.columns WHERE table_schema = 'public';
  RAISE NOTICE 'SCHEMA|columns|%', h;
  SELECT md5(string_agg(indexdef, ',' ORDER BY indexname)) INTO h FROM pg_indexes WHERE schemaname = 'public';
  RAISE NOTICE 'SCHEMA|indexes|%', h;
  SELECT md5(string_agg(conname || ':' || pg_get_constraintdef(oid), ',' ORDER BY conname)) INTO h
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace;
  RAISE NOTICE 'SCHEMA|constraints|%', h;
  SELECT md5(string_agg(tgname || ':' || pg_get_triggerdef(oid), ',' ORDER BY tgname)) INTO h
    FROM pg_trigger WHERE NOT tgisinternal;
  RAISE NOTICE 'SCHEMA|triggers|%', h;
  SELECT md5(string_agg(proname || ':' || md5(prosrc), ',' ORDER BY proname)) INTO h
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prokind = 'f'
      AND proname NOT IN (SELECT p.proname FROM pg_proc p JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e');
  RAISE NOTICE 'SCHEMA|functions|%', h;
  SELECT md5(string_agg(t.typname || ':' || e.enumlabel, ',' ORDER BY t.typname, e.enumsortorder)) INTO h
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid;
  RAISE NOTICE 'SCHEMA|enums|%', h;
  SELECT string_agg(extname || '@' || extversion, ',' ORDER BY extname) INTO h FROM pg_extension;
  RAISE NOTICE 'SCHEMA|extensions|%', h;

  FOR r IN SELECT migration_name, checksum, finished_at IS NOT NULL AS fin, rolled_back_at IS NOT NULL AS rb FROM _prisma_migrations ORDER BY migration_name LOOP
    RAISE NOTICE 'MIGRATION|%|%|%|%', r.migration_name, r.checksum, r.fin, r.rb;
  END LOOP;
END $$;
