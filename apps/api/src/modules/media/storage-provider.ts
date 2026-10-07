import type { Readable } from 'stream';

export interface ObjectStats {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

export interface StorageProvider {
  buildStorageKey(mimeType: string, prefix: string): string;
  createUploadUrl(storageKey: string, mimeType: string): Promise<string>;
  createDownloadUrl(storageKey: string, restricted?: boolean): Promise<string>;
  statObject(storageKey: string): Promise<ObjectStats>;
  readLeadingBytes(storageKey: string, byteCount?: number): Promise<Buffer>;
  getObjectStream(storageKey: string): Promise<Readable>;
  putObject(storageKey: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(storageKey: string): Promise<void>;
  publicUrl(storageKey: string): string;
}