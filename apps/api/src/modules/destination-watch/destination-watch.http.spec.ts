import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { DestinationWatchController } from './destination-watch.controller';
import { DestinationWatchService } from './destination-watch.service';

/** In-memory Prisma boundary; real Nest HTTP, Passport JWT strategy and validation. No DB/Redis. */
describe('Destination Watch HTTP contract (no database)', () => {
  const secret = 'destination-watch-contract-test-secret-32-chars';
  let app: INestApplication;
  let jwt: JwtService;
  const prisma = {
    session: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    destination: { findFirst: jest.fn() },
    destinationWatch: { upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    watchPreference: { findUnique: jest.fn(), upsert: jest.fn() },
    watchNotification: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
  };
  const token = (userId: string, sessionId = `session-${userId}`) =>
    jwt.sign({ sub: userId, sid: sessionId });
  const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret })],
      controllers: [DestinationWatchController],
      providers: [
        DestinationWatchService,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => ({ accessSecret: secret }) } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
    jwt = module.get(JwtService);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.session.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      userId: where.id.replace(/^session-/, ''),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    }));
    prisma.user.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id, email: `${where.id}@example.com`, roles: ['USER'], status: UserStatus.ACTIVE,
    }));
  });

  afterAll(async () => { await app?.close(); });

  it('rejects a missing Bearer token with 401', async () => {
    await request(app.getHttpServer()).get('/v1/me/destination-watches').expect(401);
  });

  it('rejects a tampered JWT with 401', async () => {
    await request(app.getHttpServer()).get('/v1/me/destination-watches')
      .set(auth(token('alice') + 'tampered')).expect(401);
  });

  it('rejects a revoked session with 401', async () => {
    prisma.session.findUnique.mockResolvedValueOnce({
      id: 'session-alice', userId: 'alice', revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await request(app.getHttpServer()).get('/v1/me/destination-watches')
      .set(auth(token('alice'))).expect(401);
  });

  it('validates required destinationId and rejects unknown body fields with 400', async () => {
    await request(app.getHttpServer()).post('/v1/me/destination-watches')
      .set(auth(token('alice'))).send({}).expect(400);
    await request(app.getHttpServer()).post('/v1/me/destination-watches')
      .set(auth(token('alice'))).send({ destinationId: 'dest-1', userId: 'bob' }).expect(400);
    expect(prisma.destinationWatch.upsert).not.toHaveBeenCalled();
  });

  it('follows idempotently using the authenticated user and unique key', async () => {
    prisma.destination.findFirst.mockResolvedValue({ id: 'dest-1' });
    prisma.destinationWatch.upsert.mockResolvedValue({ id: 'watch-1', destinationId: 'dest-1' });
    for (let i = 0; i < 2; i++) {
      const res = await request(app.getHttpServer()).post('/v1/me/destination-watches')
        .set(auth(token('alice'))).send({ destinationId: 'dest-1' }).expect(201);
      expect(res.body.destinationId).toBe('dest-1');
    }
    expect(prisma.destinationWatch.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.destinationWatch.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_destinationId: { userId: 'alice', destinationId: 'dest-1' } },
      create: { userId: 'alice', destinationId: 'dest-1' },
      update: {},
    }));
  });

  it('does not expose another user notification through mark-read', async () => {
    prisma.watchNotification.updateMany.mockResolvedValue({ count: 0 });
    prisma.watchNotification.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer()).patch('/v1/me/watch-notifications/bob-notification/read')
      .set(auth(token('alice'))).expect(404);
    expect(prisma.watchNotification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bob-notification', userId: 'alice', readAt: null },
    }));
    expect(prisma.watchNotification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bob-notification', userId: 'alice' },
    }));
  });

  it('scopes notification listing to authenticated user', async () => {
    prisma.watchNotification.findMany.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/v1/me/watch-notifications')
      .set(auth(token('alice'))).expect(200);
    expect(prisma.watchNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'alice' }, take: 20,
    }));
  });

  it('rejects invalid notification limits and clamps high limits', async () => {
    await request(app.getHttpServer()).get('/v1/me/watch-notifications?limit=bad')
      .set(auth(token('alice'))).expect(400);
    prisma.watchNotification.findMany.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/v1/me/watch-notifications?limit=999')
      .set(auth(token('alice'))).expect(200);
    expect(prisma.watchNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('rejects unknown preference fields', async () => {
    await request(app.getHttpServer()).patch('/v1/me/watch-preferences')
      .set(auth(token('alice'))).send({ eventUpdates: true, userId: 'bob' }).expect(400);
    expect(prisma.watchPreference.upsert).not.toHaveBeenCalled();
  });
});
