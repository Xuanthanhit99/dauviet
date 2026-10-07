import type { Readable } from 'stream';

export interface ObjectStats {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

export abstract class StorageProvider {
  abstract buildStorageKey(mimeType: string, prefix: string): string;
  abstract createUploadUrl(storageKey: string, mimeType: string): Promise<string>;
  abstract createDownloadUrl(storageKey: string, restricted?: boolean): Promise<string>;
  abstract statObject(storageKey: string): Promise<ObjectStats>;
  abstract readLeadingBytes(storageKey: string, byteCount?: number): Promise<Buffer>;
  abstract getObjectStream(storageKey: string): Promise<Readable>;
  abstract putObject(storageKey: string, body: Buffer, contentType: string): Promise<void>;
  abstract deleteObject(storageKey: string): Promise<void>;
  abstract publicUrl(storageKey: string): string;
}