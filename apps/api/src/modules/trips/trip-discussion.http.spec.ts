import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TripDiscussionController } from './trip-discussion.controller';
import { TripDiscussionService } from './trip-discussion.service';
import { TripDiscussionAccessService } from './trip-discussion-access.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
class TestAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const id = req.headers['x-test-user'];
    if (typeof id !== 'string' || !id) return false;
    req.user = { id, email: 'test@example.com', roles: ['USER'] };
    return true;
  }
}

describe('Trip discussion HTTP access boundary (isolated controller E2E)', () => {
  let app: INestApplication;
  const trip = { id: 'trip-1', ownerId: 'owner' };
  const members = new Set(['viewer']);
  const findMany = jest.fn().mockResolvedValue([]);
  const create = jest.fn().mockImplementation(async ({ data }) => ({ id: 'message-1', ...data }));

  beforeAll(async () => {
    const prisma = {
      trip: { findUnique: jest.fn().mockImplementation(async ({ where }) => where.id === trip.id ? trip : null) },
      tripMember: { findUnique: jest.fn().mockImplementation(async ({ where }) => members.has(where.tripId_userId.userId) ? { role: 'VIEWER' } : null) },
      tripDiscussionMessage: { findMany, create },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    (prisma as typeof prisma & { $transaction?: unknown }).$transaction = async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma);
    const { TripAuthorizationService } = await import('./trip-authorization.service');
    const moduleRef = await Test.createTestingModule({
      controllers: [TripDiscussionController],
      providers: [
        TripDiscussionService,
        TripDiscussionAccessService,
        TripAuthorizationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalGuards(new TestAuthenticationGuard());
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(() => {
    findMany.mockClear();
    create.mockClear();
    members.add('viewer');
  });

  it('rejects anonymous requests', async () => {
    await request(app.getHttpServer()).get('/trips/trip-1/discussion/messages').expect(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects a stranger on both HTTP routes without DB message access', async () => {
    await request(app.getHttpServer()).get('/trips/trip-1/discussion/messages').set('x-test-user', 'stranger').expect(403);
    await request(app.getHttpServer()).post('/trips/trip-1/discussion/messages').set('x-test-user', 'stranger').send({ body: 'private' }).expect(403);
    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('revokes access immediately after membership removal', async () => {
    await request(app.getHttpServer()).get('/trips/trip-1/discussion/messages').set('x-test-user', 'viewer').expect(200);
    members.delete('viewer');
    await request(app.getHttpServer()).get('/trips/trip-1/discussion/messages').set('x-test-user', 'viewer').expect(403);
    await request(app.getHttpServer()).post('/trips/trip-1/discussion/messages').set('x-test-user', 'viewer').send({ body: 'private' }).expect(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows a current viewer to post using server-derived author identity', async () => {
    await request(app.getHttpServer()).post('/trips/trip-1/discussion/messages').set('x-test-user', 'viewer').send({ body: 'hello', authorId: 'owner' }).expect(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: { tripId: 'trip-1', authorId: 'viewer', body: 'hello' } }));
  });
});
