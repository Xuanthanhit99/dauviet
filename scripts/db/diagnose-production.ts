/**
 * Read-only production database diagnostic for Dấu Việt.
 * Refuses all writes. Uses the API container's runtime DATABASE_URL.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV !== 'production' || process.env.DB_DIAGNOSTIC !== 'true') {
    throw new Error('Refusing diagnostic: require NODE_ENV=production and DB_DIAGNOSTIC=true');
  }

  const extensions = await prisma.$queryRaw<Array<{extname:string; extversion:string}>>`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname IN ('postgis','pg_trgm','unaccent')
    ORDER BY extname
  `;

  const golden = await prisma.$queryRaw<Array<{
    id:string; canonicalSlug:string; publicationStatus:string; historicalImportance:number;
    location:string|null; name:string|null
  }>>`
    SELECT p."id", p."canonicalSlug", p."publicationStatus", p."historicalImportance",
           ST_AsText(p."location") AS location, t."name"
    FROM "Place" p
    LEFT JOIN "PlaceTranslation" t ON t."placeId" = p."id" AND t."locale" = 'vi'
    WHERE p."canonicalSlug" IN ('hoang-thanh-thang-long','van-mieu-quoc-tu-giam','co-loa')
    ORDER BY p."canonicalSlug"
  `;

  const [hanoi] = await prisma.$queryRaw<Array<{count:bigint}>>`
    SELECT COUNT(*)::bigint AS count
    FROM "Place" p
    WHERE p."publicationStatus" = 'PUBLISHED'
      AND p."historicalImportance" >= 4
      AND p."location" IS NOT NULL
      AND ST_Within(
        p."location",
        ST_MakeEnvelope(105.70, 20.90, 106.00, 21.20, 4326)
      )
  `;

  const [spatial] = await prisma.$queryRaw<Array<{count:bigint}>>`
    SELECT COUNT(*)::bigint AS count
    FROM "Place"
    WHERE "publicationStatus" = 'PUBLISHED' AND "location" IS NOT NULL
  `;

  const projection = await prisma.searchProjectionQueue.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: { entityKind: 'PLACE' },
  });

  console.log(JSON.stringify({
    ok: true,
    readOnly: true,
    databaseHost: (() => { try { return new URL(process.env.DATABASE_URL ?? '').hostname; } catch { return 'unparseable'; } })(),
    extensions,
    goldenPlaces: golden,
    hanoiPublishedSpatialImportance4Plus: Number(hanoi?.count ?? 0),
    publishedSpatialPlaces: Number(spatial?.count ?? 0),
    searchProjectionQueueByStatus: projection,
  }, null, 2));
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
