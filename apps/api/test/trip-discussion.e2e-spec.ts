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

  it('immediately blocks the same still-valid JWT after owner removes the member', async () => {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    await request(app.getHttpServer()).delete(`/v1/trips/${tripId}/members/${memberId}`)
      .set(auth(ownerToken)).send({ expectedVersion: trip.version }).expect(200);
    await request(app.getHttpServer()).get(endpoint()).set(auth(memberToken)).expect(403);
    await request(app.getHttpServer()).post(endpoint()).set(auth(memberToken))
      .send({ body: 'Must be denied' }).expect(403);
    expect(await prisma.tripDiscussionMessage.count({ where: { tripId } })).toBe(1);
    await request(app.getHttpServer()).get(endpoint()).set(auth(ownerToken)).expect(200);
  });
});
