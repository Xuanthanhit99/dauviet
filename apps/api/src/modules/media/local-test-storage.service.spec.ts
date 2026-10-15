import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { LocalTestStorageService } from './local-test-storage.service';

describe('LocalTestStorageService', () => {
  let root: string;
  let service: LocalTestStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dauviet-media-'));
    const config = { get: jest.fn().mockReturnValue(3010) } as unknown as ConfigService<any, true>;
    process.env.MEDIA_TEST_STORAGE_ROOT = root;
    process.env.MEDIA_TEST_STORAGE_BASE_URL = 'http://127.0.0.1:3010/v1/media/test-public';
    service = new LocalTestStorageService(config);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    delete process.env.MEDIA_TEST_STORAGE_ROOT;
    delete process.env.MEDIA_TEST_STORAGE_BASE_URL;
  });

  it('writes, stats, streams, deletes, and exposes a browser-readable URL', async () => {
    const key = service.buildStorageKey('image/jpeg', 'original');
    const body = Buffer.from('local-media-fixture');
    await service.putObject(key, body, 'image/jpeg');

    await expect(service.statObject(key)).resolves.toEqual({ exists: true, sizeBytes: body.length });
    await expect(service.readLeadingBytes(key, 6)).resolves.toEqual(body.subarray(0, 6));

    const stream = await service.getObjectStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    expect(Buffer.concat(chunks)).toEqual(body);

    expect(service.publicUrl(key)).toContain('/v1/media/test-public?key=');
    await expect(stat(join(root, key))).resolves.toEqual(expect.objectContaining({ size: body.length }));
    expect(await readFile(join(root, key))).toEqual(body);

    await service.deleteObject(key);
    await expect(service.statObject(key)).resolves.toEqual({ exists: false });
  });

  it('rejects path traversal', async () => {
    await expect(service.statObject('../outside')).resolves.toEqual({ exists: false });
    await expect(service.putObject('../outside', Buffer.from('x'), 'text/plain')).rejects.toThrow('Invalid storage key.');
  });
});
