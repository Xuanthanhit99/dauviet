import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, normalize } from 'path';
import { nanoid } from 'nanoid';
import type { Readable } from 'stream';
import type { AppConfig } from '../../config/configuration';
import type { ObjectStats, StorageProvider } from './storage-provider';
import { safeExtensionFor } from './file-signature.util';

@Injectable()
export class LocalTestStorageService implements StorageProvider {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const port = this.config.get('port', { infer: true });
    this.root = process.env.MEDIA_TEST_STORAGE_ROOT ?? join(process.cwd(), '.test-media-storage');
    this.baseUrl = process.env.MEDIA_TEST_STORAGE_BASE_URL ?? `http://127.0.0.1:${port}/v1/media/test-public`;
  }

  private resolve(storageKey: string) {
    const root = normalize(this.root);
    const target = normalize(join(root, storageKey));
    if (target !== root && !target.startsWith(root + require('path').sep)) throw new Error('Invalid storage key.');
    return target;
  }

  buildStorageKey(mimeType: string, prefix: string) {
    return `${prefix}/${nanoid()}.${safeExtensionFor(mimeType)}`;
  }

  async createUploadUrl(storageKey: string, _mimeType: string) {
    return `${this.baseUrl}/upload/${encodeURIComponent(storageKey)}`;
  }

  async createDownloadUrl(storageKey: string, _restricted = false) {
    return this.publicUrl(storageKey);
  }

  async statObject(storageKey: string): Promise<ObjectStats> {
    try {
      const info = await stat(this.resolve(storageKey));
      return { exists: true, sizeBytes: info.size };
    } catch {
      return { exists: false };
    }
  }

  async readLeadingBytes(storageKey: string, byteCount = 16) {
    return (await readFile(this.resolve(storageKey))).subarray(0, byteCount);
  }

  async getObjectStream(storageKey: string): Promise<Readable> {
    return createReadStream(this.resolve(storageKey));
  }

  async putObject(storageKey: string, body: Buffer, _contentType: string) {
    const target = this.resolve(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async deleteObject(storageKey: string) {
    await rm(this.resolve(storageKey), { force: true });
  }

  publicUrl(storageKey: string) {
    return `${this.baseUrl}/${encodeURIComponent(storageKey)}`;
  }
}
