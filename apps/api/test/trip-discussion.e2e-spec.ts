import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { bootstrapTestApp } from './bootstrap-test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/** Real Nest auth, real PostgreSQL, real member removal HTTP path. */
describe('Trip discussion membership revocation (live e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let memberToken: string;
  let strangerToken: string;
  let tripId: string;
  let memberId: string;
  const stamp = Date.now();
  const emails: string[] = [];

  async function account(label: string) {
    const email = `discussion-${label}-${stamp}@example.com`;
    emails.push(email);
    await request(app.getHttpServer()).post('/v1/auth/register')
      .send({ email, password: 'E2eTest-Pass!1', displayName: label }).expect(201);
    const login = await request(app.getHttpServer()).post('/v1/auth/login')
      .send({ email, password: 'E2eTest-Pass!1' }).expect(201);
    return { token: login.body.data.accessToken as string, email };
  }

  const endpoint = () => `/v1/trips/${tripId}/discussion/messages`;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await bootstrapTestApp();
    prisma = app.get(PrismaService);
    const owner = await account('owner');
    const member = await account('member');
    const stranger = await account('stranger');
    ownerToken = owner.token;
    memberToken = member.token;
    strangerToken = stranger.token;
    const created = await request(app.getHttpServer()).post('/v1/trips').set(auth(ownerToken))
      .send({ title: 'Discussion E2E', startDate: '2026-11-01', endDate: '2026-11-02', primaryCurrency: 'VND' }).expect(201);
    tripId = created.body.data.id;
    // Seed an ACCEPTED member, not an invitation: membership is the authorization source of truth.
    // The actual revocation below uses the production HTTP endpoint and real transaction.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    const membership = await prisma.tripMember.create({ data: { tripId, userId: user.id, role: 'VIEWER' } });
    memberId = membership.id;
  }, 60_000);

  afterAll(async () => {
    if (prisma) {
      // Deleting the owning user cascades the trip and its discussion messages.
      await prisma.tripDiscussionMessage.deleteMany({ where: { tripId } });
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    }
    await app?.close();
  }, 30_000);

  it('enforces authentication and rejects a non-member', async () => {
    await request(app.getHttpServer()).get(endpoint()).expect(401);
    await request(app.getHttpServer()).get(endpoint()).set(auth(strangerToken)).expect(403);
    await request(app.getHttpServer()).post(endpoint()).set(auth(strangerToken)).send({ body: 'No access' }).expect(403);
  });

  it('allows owner and accepted viewer to exchange persisted messages', async () => {
    const posted = await request(app.getHttpServer()).post(endpoint()).set(auth(memberToken))
      .send({ body: 'Hello from viewer' }).expect(201);
    expect(posted.body.data.body).toBe('Hello from viewer');
    const read = await request(app.getHttpServer()).get(endpoint()).set(auth(ownerToken)).expect(200);
    expect(read.body.data.some((message: { id: string }) => message.id === posted.body.data.id)).toBe(true);
    expect(await prisma.tripDiscussionMessage.count({ where: { tripId } })).toBe(1);
  });

  async function addMember(label: string) {
    const user = await account(label);
    const record = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    const membership = await prisma.tripMember.create({ data: { tripId, userId: record.id, role: 'VIEWER' } });
    return { token: user.token, userId: record.id, memberId: membership.id };
  }

  async function removeMember(id: string) {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    return request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${id}`)
      .set(auth(ownerToken)).send({ expectedVersion: trip.version });
  }

  it('post committed before removal remains in history; subsequent posts are forbidden', async () => {
    const actor = await addMember('race-post-first');
    const posted = await request(app.getHttpServer()).post(endpoint()).set(auth(actor.token))
      .send({ body: 'Before removal' }).expect(201);
    expect((await removeMember(actor.memberId)).status).toBe(200);
    expect(await prisma.tripDiscussionMessage.count({ where: { id: posted.body.data.id } })).toBe(1);
    await request(app.getHttpServer()).post(endpoint()).set(auth(actor.token))
      .send({ body: 'After removal' }).expect(403);
    expect(await prisma.tripDiscussionMessage.count({ where: { tripId, body: 'After removal' } })).toBe(0);
  });

  it('DELETE committed first denies both POST and GET with the same valid JWT', async () => {
    const actor = await addMember('race-delete-first');
    expect((await removeMember(actor.memberId)).status).toBe(200);
    await request(app.getHttpServer()).post(endpoint()).set(auth(actor.token))
      .send({ body: 'Delete first must deny' }).expect(403);
    await request(app.getHttpServer()).get(endpoint()).set(auth(actor.token)).expect(403);
    expect(await prisma.tripDiscussionMessage.count({
      where: { tripId, body: 'Delete first must deny' },
    })).toBe(0);
  });

  it('serializes concurrent POST and DELETE under a contended membership lock', async () => {
    // Reuse an existing authenticated account instead of exceeding the
    // registration endpoint's rate limit during this E2E suite.
    const existing = await prisma.user.findUniqueOrThrow({
      where: { email: `discussion-stranger-${stamp}@example.com` },
    });
    const membership = await prisma.tripMember.create({
      data: { tripId, userId: existing.id, role: 'VIEWER' },
    });
    const actor = { token: strangerToken, userId: existing.id, memberId: membership.id };
    let release!: () => void;
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const holding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "TripMember" WHERE "id" = ${actor.memberId} FOR UPDATE`;
      locked();
      await barrier;
    }, { timeout: 15_000 });
    try {
      await acquired;
      const version = (await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).version;
      // .then starts both Supertest HTTP requests before the held lock is released.
      const removal = request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${actor.memberId}`)
        .set(auth(ownerToken)).send({ expectedVersion: version }).then((res) => res);
      const posting = request(app.getHttpServer()).post(endpoint()).set(auth(actor.token))
        .send({ body: 'Racing removal' }).then((res) => res);
      release();
      const [removed, posted] = await Promise.all([removal, posting]);
      expect(removed.status).toBe(200);
      expect([201, 403]).toContain(posted.status);
      // Either a committed post precedes revocation, or a denied post follows it.
      expect(await prisma.tripDiscussionMessage.count({ where: { tripId, body: 'Racing removal' } }))
        .toBe(posted.status === 201 ? 1 : 0);
      await request(app.getHttpServer()).post(endpoint()).set(auth(actor.token))
        .send({ body: 'After concurrent removal' }).expect(403);
      expect(await prisma.tripDiscussionMessage.count({ where: { tripId, body: 'After concurrent removal' } })).toBe(0);
    } finally {
      release();
      await holding;
    }
  }, 30_000);

  it('immediately blocks the same still-valid JWT after owner removes the member', async () => {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    await request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${memberId}`)
      .set(auth(ownerToken)).send({ expectedVersion: trip.version }).expect(200);
    await request(app.getHttpServer()).get(endpoint()).set(auth(memberToken)).expect(403);
    await request(app.getHttpServer()).post(endpoint()).set(auth(memberToken))
      .send({ body: 'Must be denied' }).expect(403);
    expect(await prisma.tripDiscussionMessage.count({ where: { tripId, body: 'Must be denied' } })).toBe(0);
    await request(app.getHttpServer()).get(endpoint()).set(auth(ownerToken)).expect(200);
  });
});
