import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../config/configuration';
import { safeExtensionFor } from './file-signature.util';

export interface ObjectStats {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

/**
 * S3-compatible object storage abstraction (spec Phase 05 section 9). Every
 * business service (`MediaService`, etc.) goes through this - no vendor SDK
 * call appears anywhere outside this file, so swapping MinIO for a
 * production S3-compatible provider later is a config change, not a
 * business-logic change (spec section 38).
 */
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly uploadUrlTtlSeconds: number;
  private readonly downloadUrlTtlSeconds: number;
  private readonly restrictedDownloadUrlTtlSeconds: number;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const s3 = this.config.get('s3', { infer: true });
    this.bucket = s3.bucket;
    this.publicBaseUrl = s3.publicBaseUrl;
    this.uploadUrlTtlSeconds = s3.uploadUrlTtlSeconds;
    this.downloadUrlTtlSeconds = s3.downloadUrlTtlSeconds;
    this.restrictedDownloadUrlTtlSeconds = s3.restrictedDownloadUrlTtlSeconds;
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      forcePathStyle: s3.forcePathStyle,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
  }

  /**
   * Server-generated, non-user-controlled object key (spec section 10) - the
   * original filename is never used as or embedded verbatim in the key
   * (beyond a policy-derived extension, see `safeExtensionFor`), which rules
   * out path traversal (`../../etc/passwd`) and extension smuggling
   * (`photo.jpg.php`) by construction.
   */
  buildStorageKey(mimeType: string, prefix: string) {
    const ext = safeExtensionFor(mimeType);
    return `${prefix}/${nanoid()}.${ext}`;
  }

  async createUploadUrl(storageKey: string, mimeType: string) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, ContentType: mimeType });
    return getSignedUrl(this.client, command, { expiresIn: this.uploadUrlTtlSeconds });
  }

  /**
   * Never a permanent link (spec section 37) - `restricted: true` uses a
   * shorter TTL than the routine public/preview case.
   */
  async createDownloadUrl(storageKey: string, restricted = false) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    const expiresIn = restricted ? this.restrictedDownloadUrlTtlSeconds : this.downloadUrlTtlSeconds;
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Confirms the object actually exists and reports its real size/declared
   * Content-Type (spec section 11) - never trust "the client says it
   * uploaded" alone. `exists: false` (rather than throwing) lets the caller
   * decide the MediaAsset's FAILED-state message.
   */
  async statObject(storageKey: string): Promise<ObjectStats> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return { exists: true, sizeBytes: result.ContentLength, contentType: result.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') {
        return { exists: false };
      }
      throw err;
    }
  }

  /**
   * Reads only the first `byteCount` bytes of an object (a Range GET) for
   * magic-byte signature checking (spec section 14) - never downloads a full
   * multi-hundred-MB video/PDF just to validate its header. Kept for callers
   * that only need the header (e.g. a future re-check); `confirmUpload`
   * itself uses `getObjectStream` + `hashStream` to get both the signature
   * and the authoritative checksum from a single read (spec section 15).
   */
  async readLeadingBytes(storageKey: string, byteCount = 16): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey, Range: `bytes=0-${byteCount - 1}` });
    const result = await this.client.send(command);
    const body = result.Body;
    if (!body) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * The full object as a Node stream (spec section 16/17) - the only place
   * that reads a whole object does so via a stream, never buffering it
   * whole. `MediaService`/`MediaProcessor` never touch the AWS SDK stream
   * type directly beyond this return value; downstream code treats it as a
   * generic Node `Readable`.
   */
  async getObjectStream(storageKey: string): Promise<Readable> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    const result = await this.client.send(command);
    return result.Body as Readable;
  }

  /**
   * Server-side write of an already-generated buffer (a derivative image) -
   * distinct from `createUploadUrl` (a presigned client PUT). Used only by
   * the media processor for derivatives it has generated in-process; never
   * used for original client uploads, which always go through the presigned
   * flow (spec section 11 - the backend never becomes a generic upload
   * proxy for arbitrary client bytes).
   */
  async putObject(storageKey: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: body, ContentType: contentType }));
  }

  async deleteObject(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }

  publicUrl(storageKey: string) {
    return `${this.publicBaseUrl}/${storageKey}`;
  }
}
