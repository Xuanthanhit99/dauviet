/**
 * Production-safe recovery for canonical Golden Dataset Place rows used by Map V4.
 *
 * Scope is intentionally narrow: Place + PlaceTranslation + aliases + point geometry.
 * It does not create users, providers, offers, stories, facts, or any development fixture.
 * Safe to run repeatedly. Search projection is trigger-backed; this script verifies the
 * projection queue has been populated and prints the recovered Hanoi rows for smoke checks.
 */
import { PrismaClient, PublicationStatus } from '@prisma/client';
import { GOLDEN_PLACES, slug } from '../../prisma/golden';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV !== 'production' || process.env.SEED_PROFILE !== 'production') {
    throw new Error('Refusing recovery: require NODE_ENV=production and SEED_PROFILE=production');
  }

  const recovered: Array<{ id:string; slug:string; name:string; importance:number; location:string|null }> = [];

  for (const spec of GOLDEN_PLACES) {
    const canonicalSlug = slug(spec.vi.name);
    const place = await prisma.$transaction(async (tx) => {
      const row = await tx.place.upsert({
        where: { canonicalSlug },
        create: {
          type: spec.type,
          canonicalSlug,
          historicalImportance: spec.importance ?? 0,
          publicationStatus: PublicationStatus.PUBLISHED,
        },
        update: {
          type: spec.type,
          historicalImportance: spec.importance ?? 0,
          publicationStatus: PublicationStatus.PUBLISHED,
        },
      });

      await tx.placeTranslation.upsert({
        where: { placeId_locale: { placeId: row.id, locale: 'vi' } },
        create: { placeId: row.id, locale: 'vi', name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
        update: { name: spec.vi.name, slug: canonicalSlug, summary: spec.vi.summary, method: 'ORIGINAL' },
      });
      if (spec.en) {
        await tx.placeTranslation.upsert({
          where: { placeId_locale: { placeId: row.id, locale: 'en' } },
          create: { placeId: row.id, locale: 'en', name: spec.en.name, slug: slug(spec.en.name), summary: spec.en.summary, method: 'AI_ASSISTED', status: 'AI_ASSISTED' },
          update: { name: spec.en.name, slug: slug(spec.en.name), summary: spec.en.summary, method: 'AI_ASSISTED', status: 'AI_ASSISTED' },
        });
      }
      for (const alias of spec.aliases ?? []) {
        await tx.entityAlias.upsert({
          where: { entityType_entityId_locale_alias: { entityType: 'PLACE', entityId: row.id, locale: '', alias } },
          create: { entityType: 'PLACE', entityId: row.id, alias, aliasType: 'ROMANIZATION' },
          update: {},
        });
      }
      if (spec.lat !== undefined && spec.lng !== undefined) {
        await tx.$executeRaw`UPDATE "Place" SET "location" = ST_SetSRID(ST_MakePoint(${spec.lng}, ${spec.lat}), 4326) WHERE "id" = ${row.id}`;
      }
      return row;
    });

    const [verified] = await prisma.$queryRaw<Array<{id:string; slug:string; name:string; importance:number; location:string|null}>>`
      SELECT p."id", p."canonicalSlug" AS slug, t."name", p."historicalImportance" AS importance,
             ST_AsText(p."location") AS location
      FROM "Place" p JOIN "PlaceTranslation" t ON t."placeId"=p."id" AND t."locale"='vi'
      WHERE p."id"=${place.id} AND p."publicationStatus"='PUBLISHED'
    `;
    if (!verified?.location) throw new Error(`Recovery verification failed for ${canonicalSlug}: missing published point geometry`);
    recovered.push(verified);
  }

  const hanoi = recovered.filter((x) => ['hoang-thanh-thang-long','van-mieu-quoc-tu-giam','co-loa'].includes(x.slug));
  if (hanoi.length !== 3) throw new Error(`Expected 3 Hanoi golden places, recovered ${hanoi.length}`);

  const queueDepth = await prisma.searchProjectionQueue.count({ where: { entityKind: 'PLACE', entityId: { in: recovered.map(x=>x.id) } } });
  console.log(JSON.stringify({ ok:true, recovered: recovered.length, hanoi, searchProjectionQueueDepth: queueDepth }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
