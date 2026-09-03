import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const s3 = this.config.get('s3', { infer: true });
    this.bucket = s3.bucket;
    this.publicBaseUrl = s3.publicBaseUrl;
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      forcePathStyle: s3.forcePathStyle,
      credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
    });
  }

  buildStorageKey(originalName: string, prefix: string) {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : undefined;
    return `${prefix}/${nanoid()}${ext ? `.${ext}` : ''}`;
  }

  async createUploadUrl(storageKey: string, mimeType: string) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, ContentType: mimeType });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });
    return uploadUrl;
  }

  async createDownloadUrl(storageKey: string) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    return getSignedUrl(this.client, command, { expiresIn: 900 });
  }

  publicUrl(storageKey: string) {
    return `${this.publicBaseUrl}/${storageKey}`;
  }
}
