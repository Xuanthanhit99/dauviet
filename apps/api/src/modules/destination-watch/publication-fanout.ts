import { Prisma, PrismaClient, PublicationStatus, StoryEditorialStatus } from '@prisma/client';

/**
 * Phase 3.1: atomic, idempotent fan-out for a single publication outbox.
 * No external delivery and no NotificationDelivery rows.
 *
 * A transaction locks the outbox row; concurrent invocations serialize.
 * An exception before commit rolls back both inbox rows and outbox status.
 */
export async function fanOutPublication(prisma: PrismaClient, outboxId: string): Promise<'PROCESSED' | 'CANCELLED' | 'SKIPPED'> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "NotificationOutbox" WHERE "id" = ${outboxId} FOR UPDATE`,
    );
    if (!locked.length) return 'SKIPPED';
    const outbox = await tx.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    if (outbox.status !== 'PENDING') return 'SKIPPED';

    const destination = await tx.destination.findUnique({
      where: { id: outbox.destinationId }, select: { status: true },
    });
    let published = destination?.status === PublicationStatus.PUBLISHED;
    let title = '';
    let summary: string | null = null;
    if (published && outbox.sourceType === 'HistoricalEvent') {
      const source = await tx.historicalEvent.findUnique({
        where: { id: outbox.sourceId },
        select: { publicationStatus: true, publicationRevision: true, translations: { where: { locale: 'vi' }, take: 1 } },
      });
      published = source?.publicationStatus === PublicationStatus.PUBLISHED && source.publicationRevision === outbox.sourceVersion;
      title = source?.translations[0]?.title ?? '';
      summary = source?.translations[0]?.summary ?? null;
    } else if (published && outbox.sourceType === 'Story') {
      const source = await tx.story.findUnique({
        where: { id: outbox.sourceId },
        select: { editorialStatus: true, version: true, translations: { where: { locale: 'vi' }, take: 1 } },
      });
      published = source?.editorialStatus === StoryEditorialStatus.PUBLISHED && source.version === outbox.sourceVersion;
      title = source?.translations[0]?.title ?? '';
      summary = source?.translations[0]?.summary ?? null;
    } else if (published && outbox.sourceType === 'Journey') {
      const source = await tx.journey.findUnique({
        where: { id: outbox.sourceId },
        select: { status: true, version: true, translations: { where: { locale: 'vi' }, take: 1 } },
      });
      published = source?.status === PublicationStatus.PUBLISHED && source.version === outbox.sourceVersion;
      title = source?.translations[0]?.title ?? '';
      summary = source?.translations[0]?.summary ?? null;
    } else {
      published = false;
    }

    if (!published || !title || !['eventUpdates', 'editorialUpdates'].includes(outbox.kind)) {
      await tx.notificationOutbox.update({ where: { id: outboxId }, data: { status: 'CANCELLED', processedAt: new Date() } });
      return 'CANCELLED';
    }

    const watches = await tx.destinationWatch.findMany({
      where: { destinationId: outbox.destinationId },
      select: { userId: true, user: { select: { watchPreference: { select: { eventUpdates: true, editorialUpdates: true } } } } },
    });
    const recipients = watches.filter((w) => {
      const p = w.user.watchPreference;
      return outbox.kind === 'eventUpdates' ? (p?.eventUpdates ?? true) : (p?.editorialUpdates ?? false);
    });
    if (recipients.length) {
      await tx.watchNotification.createMany({
        data: recipients.map(({ userId }) => ({
          userId, destinationId: outbox.destinationId, dedupeKey: outbox.eventKey,
          kind: outbox.kind === 'eventUpdates' ? 'EVENT' : 'EDITORIAL', title, summary,
        })),
        skipDuplicates: true,
      });
    }
    await tx.notificationOutbox.update({ where: { id: outboxId }, data: { status: 'PROCESSED', processedAt: new Date() } });
    return 'PROCESSED';
  }, { maxWait: 5000, timeout: 15000 });
}
