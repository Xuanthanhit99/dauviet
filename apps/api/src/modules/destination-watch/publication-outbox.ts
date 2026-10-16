import { Prisma } from '@prisma/client';

/** Insert one durable outbox row per explicitly curated Destination link. */
export async function enqueuePublication(
  tx: Prisma.TransactionClient,
  sourceType: 'HistoricalEvent' | 'Story' | 'Journey',
  sourceId: string,
  sourceVersion: number,
  kind: 'eventUpdates' | 'editorialUpdates',
): Promise<void> {
  const links = sourceType === 'HistoricalEvent'
    ? await tx.destinationEvent.findMany({ where: { eventId: sourceId }, select: { destinationId: true } })
    : sourceType === 'Story'
      ? await tx.destinationStory.findMany({ where: { storyId: sourceId }, select: { destinationId: true } })
      : await tx.destinationJourney.findMany({ where: { journeyId: sourceId }, select: { destinationId: true } });
  for (const link of links) {
    const eventKey = `${sourceType}:${sourceId}:${sourceVersion}:${link.destinationId}:${kind}`;
    await tx.notificationOutbox.create({
      data: { eventKey, sourceType, sourceId, sourceVersion, destinationId: link.destinationId, kind,
        payload: { sourceType, sourceId, sourceVersion, destinationId: link.destinationId, kind } },
    });
  }
}

/** PostgreSQL row lock serializes publication decisions for the same entity. */
export async function lockPublicationRow(tx: Prisma.TransactionClient, table: 'HistoricalEvent' | 'Destination' | 'Story' | 'Journey', id: string): Promise<void> {
  // Table names are compile-time allowlisted; id is bound, never interpolated.
  const tableName = Prisma.raw(`"${table}"`);
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM ${tableName} WHERE "id" = ${id} FOR UPDATE`);
}
