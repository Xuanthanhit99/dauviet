-- G11 performance dataset (DISPOSABLE, test-only). Loaded into a throwaway database (`dauviet_perf`),
-- never into the dev database and never part of the Golden Dataset seed.
-- Deterministic pseudo-random data (hashtext-based) so runs are reproducible.
-- Scale: 50,000 Place (+50,000 vi and 25,000 en translations, 12,500 aliases) with PostGIS points,
--        10,000 Person, 10,000 HistoricalEvent (+8,000 EventPlace links, chronology ordinals incl. BCE),
--        5,000 City, 2,000 Region, 2,000 Territory polygons, 3,000 Story, 10 Country.
-- The projection is then built by the REAL rebuild (`SearchProjectionService.rebuildAll`), not inserted by hand.
SET session_replication_role = replica; -- skip the queue triggers during bulk load (write overhead is measured separately)

CREATE TEMP TABLE syl AS SELECT ord, s FROM unnest(ARRAY[
  'Hà','Nội','Thăng','Long','Hội','An','Đà','Nẵng','Huế','Cần','Thơ','Sài','Gòn','Bạch','Đằng','Điện','Biên','Phủ','Mỹ','Sơn',
  'Lam','Kinh','Đồng','Tháp','Vĩnh','Nguyễn','Trãi','Trần','Hưng','Đạo','Lê','Lợi','Quang','Trung','Ngọc','Hồi','Đống','Đa','Cổ','Loa',
  'Văn','Miếu','Quốc','Tử','Giám','Hoàng','Thành','Chùa','Một','Cột','Phố','Cổ','Vịnh','Hạ','Cát','Bà','Phú','Quý','Côn','Đảo','Sa','Pa',
  'Tây','Nguyên','Bến','Nghé','Ninh','Bình','Thanh','Hóa','Nghệ','Tĩnh','Quảng','Trị','Bình','Định','Khánh','Hòa','Đắk','Lắk','Kon','Tum']) WITH ORDINALITY AS t(s, ord);
CREATE TEMP TABLE nsyl AS SELECT count(*)::int AS n FROM syl;

CREATE OR REPLACE FUNCTION pg_temp.rnd(i int, salt text, m int) RETURNS int AS $$ SELECT (abs(hashtext(i::text || salt)) % m) $$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION pg_temp.syl(k int) RETURNS text AS $$ SELECT s FROM syl WHERE ord = (k % (SELECT n FROM nsyl)) + 1 $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION pg_temp.name3(i int) RETURNS text AS $$
  SELECT pg_temp.syl(pg_temp.rnd(i,'a',1000)) || ' ' || pg_temp.syl(pg_temp.rnd(i,'b',1000)) || ' ' || pg_temp.syl(pg_temp.rnd(i,'c',1000)) || ' ' || i::text
$$ LANGUAGE sql STABLE;

-- Countries
INSERT INTO "Country" (id, "canonicalSlug", iso2, iso3, "defaultLocale", "defaultCurrency", latitude, longitude, status, "updatedAt")
SELECT 'pc' || g, 'perf-country-' || g, 'P' || chr(64 + g), 'PF' || chr(64 + g), 'vi', 'USD', 10 + g, 100 + g, 'PUBLISHED', now() FROM generate_series(1, 10) g;
INSERT INTO "CountryTranslation" (id, "countryId", locale, name, slug, "updatedAt")
SELECT 'pct' || g, 'pc' || g, 'vi', 'Quốc Gia ' || pg_temp.syl(g) || ' ' || g, 'perf-country-vi-' || g, now() FROM generate_series(1, 10) g;

-- Regions
INSERT INTO "Region" (id, "canonicalSlug", "countryId", type, latitude, longitude, status, "updatedAt")
SELECT 'pr' || g, 'perf-region-' || g, 'pc' || (1 + g % 10), 'PROVINCE', -20 + (g % 60), 90 + (g % 60), 'PUBLISHED', now() FROM generate_series(1, 2000) g;
INSERT INTO "RegionTranslation" (id, "regionId", locale, name, slug, "updatedAt")
SELECT 'prt' || g, 'pr' || g, 'vi', 'Tỉnh ' || pg_temp.name3(g), 'perf-region-vi-' || g, now() FROM generate_series(1, 2000) g;

-- Cities
INSERT INTO "City" (id, "canonicalSlug", "countryId", "regionId", timezone, latitude, longitude, importance, status, "updatedAt")
SELECT 'pcy' || g, 'perf-city-' || g, 'pc' || (1 + g % 10), 'pr' || (1 + g % 2000), 'UTC', -40 + (pg_temp.rnd(g,'la',8000) / 100.0), 60 + (pg_temp.rnd(g,'lo',12000) / 100.0), pg_temp.rnd(g,'im',11), 'PUBLISHED', now() FROM generate_series(1, 5000) g;
INSERT INTO "CityTranslation" (id, "cityId", locale, name, slug, "updatedAt")
SELECT 'pcyt' || g, 'pcy' || g, 'vi', 'Thành Phố ' || pg_temp.name3(g), 'perf-city-vi-' || g, now() FROM generate_series(1, 5000) g;

-- Places (50k) with points spread across a wide area (Asia-Pacific), importance 0..10
INSERT INTO "Place" (id, "canonicalSlug", type, location, "historicalImportance", "publicationStatus", "currentCountryId", "currentRegionId", "updatedAt")
SELECT 'pp' || g, 'perf-place-' || g,
       (ARRAY['HISTORICAL_SITE','TEMPLE','PAGODA','PALACE','CITADEL','MUSEUM','VILLAGE','ISLAND','MONUMENT','TOMB'])[1 + pg_temp.rnd(g,'ty',10)]::"PlaceType",
       ST_SetSRID(ST_MakePoint(90 + pg_temp.rnd(g,'x',6000) / 100.0, -10 + pg_temp.rnd(g,'y',4000) / 100.0), 4326),
       CASE WHEN pg_temp.rnd(g,'imp',100) < 3 THEN 9 + pg_temp.rnd(g,'i2',2) WHEN pg_temp.rnd(g,'imp',100) < 15 THEN 7 + pg_temp.rnd(g,'i3',2) ELSE pg_temp.rnd(g,'i4',7) END,
       CASE WHEN pg_temp.rnd(g,'pub',100) < 92 THEN 'PUBLISHED' ELSE 'DRAFT' END::"PublicationStatus",
       'pc' || (1 + g % 10), 'pr' || (1 + g % 2000), now()
FROM generate_series(1, 50000) g;
INSERT INTO "PlaceTranslation" (id, "placeId", locale, name, slug, summary, "updatedAt")
SELECT 'ppt' || g, 'pp' || g, 'vi', pg_temp.name3(g), 'perf-place-vi-' || g, 'Di tích lịch sử ' || pg_temp.name3(g + 7) || ' nằm bên dòng sông cổ.', now() FROM generate_series(1, 50000) g;
INSERT INTO "PlaceTranslation" (id, "placeId", locale, name, slug, "updatedAt")
SELECT 'ppe' || g, 'pp' || g, 'en', 'Historic Site ' || g || ' ' || pg_temp.syl(pg_temp.rnd(g,'e',1000)), 'perf-place-en-' || g, now() FROM generate_series(1, 50000, 2) g;
INSERT INTO "EntityAlias" (id, "entityType", "entityId", locale, alias, "aliasType")
SELECT 'pa' || g, 'PLACE', 'pp' || g, '', 'Tên Cũ ' || pg_temp.name3(g + 3), 'HISTORICAL_NAME' FROM generate_series(1, 50000, 4) g;

-- People, events, territories, stories
INSERT INTO "Person" (id, "canonicalSlug", "historicalImportance", "publicationStatus", "updatedAt")
SELECT 'ppe' || g, 'perf-person-' || g, pg_temp.rnd(g,'i',11), 'PUBLISHED', now() FROM generate_series(1, 10000) g;
INSERT INTO "PersonTranslation" (id, "personId", locale, "displayName", slug, summary, "updatedAt")
SELECT 'pper' || g, 'ppe' || g, 'vi', 'Nhân Vật ' || pg_temp.name3(g), 'perf-person-vi-' || g, 'Nhân vật lịch sử thời ' || pg_temp.syl(g), now() FROM generate_series(1, 10000) g;

INSERT INTO "HistoricalEvent" (id, "canonicalSlug", importance, "publicationStatus", "dateChronologyStart", "dateChronologyEnd", "updatedAt")
SELECT 'pev' || g, 'perf-event-' || g, pg_temp.rnd(g,'i',11), 'PUBLISHED',
       CASE WHEN pg_temp.rnd(g,'k',10) < 8 THEN (-500 + pg_temp.rnd(g,'y',2500)) * 372 END,
       CASE WHEN pg_temp.rnd(g,'k',10) < 8 THEN (-500 + pg_temp.rnd(g,'y',2500)) * 372 + 371 END, now()
FROM generate_series(1, 10000) g;
INSERT INTO "HistoricalEventTranslation" (id, "eventId", locale, title, slug, summary, "updatedAt")
SELECT 'pevt' || g, 'pev' || g, 'vi', 'Sự Kiện ' || pg_temp.name3(g), 'perf-event-vi-' || g, 'Sự kiện lịch sử năm ' || g, now() FROM generate_series(1, 10000) g;
INSERT INTO "EventPlace" (id, "eventId", "placeId")
SELECT 'pep' || g, 'pev' || g, 'pp' || (1 + pg_temp.rnd(g,'p',50000)) FROM generate_series(1, 8000) g;

INSERT INTO "Territory" (id, "canonicalSlug", type, "geometryStatus", "chronologyStart", "chronologyEnd", "updatedAt")
SELECT 'ptr' || g, 'perf-territory-' || g, 'KINGDOM', 'PUBLISHED', (-300 + pg_temp.rnd(g,'s',2000)) * 372, (-300 + pg_temp.rnd(g,'s',2000)) * 372 + 372 * (50 + pg_temp.rnd(g,'d',300)), now() FROM generate_series(1, 2000) g;
UPDATE "Territory" SET geometry = ST_SetSRID(ST_Buffer(ST_MakePoint(90 + (abs(hashtext(id)) % 6000) / 100.0, -10 + (abs(hashtext(id || 'z')) % 4000) / 100.0), 0.5 + (abs(hashtext(id || 'r')) % 30) / 10.0, 32), 4326);
INSERT INTO "TerritoryTranslation" (id, "territoryId", locale, name, slug, "updatedAt")
SELECT 'ptrt' || g, 'ptr' || g, 'vi', 'Vương Quốc ' || pg_temp.name3(g), 'perf-territory-vi-' || g, now() FROM generate_series(1, 2000) g;

INSERT INTO "Story" (id, "canonicalSlug", "editorialStatus", "updatedAt")
SELECT 'pst' || g, 'perf-story-' || g, 'PUBLISHED', now() FROM generate_series(1, 3000) g;
INSERT INTO "StoryTranslation" (id, "storyId", locale, title, slug, summary, "updatedAt")
SELECT 'pstt' || g, 'pst' || g, 'vi', 'Câu Chuyện ' || pg_temp.name3(g), 'perf-story-vi-' || g, 'Câu chuyện về ' || pg_temp.name3(g + 11), now() FROM generate_series(1, 3000) g;

SET session_replication_role = origin;
ANALYZE;
SELECT 'Place' k, count(*) FROM "Place" UNION ALL SELECT 'Territory', count(*) FROM "Territory" UNION ALL SELECT 'Event', count(*) FROM "HistoricalEvent" UNION ALL SELECT 'City', count(*) FROM "City";
