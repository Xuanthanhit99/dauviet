import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessPolicy } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from './s3.service';
import { RegisterMediaDto, RequestUploadDto } from './dto/media.dto';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
  ) {}

  async requestUpload(dto: RequestUploadDto, actorId: string) {
    const storageKey = this.s3.buildStorageKey(dto.fileName, 'uploads');
    const uploadUrl = await this.s3.createUploadUrl(storageKey, dto.mimeType);
    await this.audit.log({ actorId, action: 'media.upload.requested', metadata: { storageKey, mimeType: dto.mimeType } });
    return { uploadUrl, storageKey, expiresInSeconds: 900 };
  }

  async register(dto: RegisterMediaDto, actorId: string) {
    if (dto.isAiGenerated && !dto.aiDisclosure) {
      throw new BadRequestException('AI-generated or reconstructed media requires an aiDisclosure note.');
    }

    const media = await this.prisma.mediaAsset.create({
      data: {
        type: dto.type,
        storageKey: dto.storageKey,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        title: dto.title,
        caption: dto.caption,
        creatorName: dto.creatorName,
        sourceId: dto.sourceId,
        license: dto.license,
        rightsHolder: dto.rightsHolder,
        isHistorical: dto.isHistorical ?? false,
        isAiGenerated: dto.isAiGenerated ?? false,
        aiDisclosure: dto.aiDisclosure,
        accessPolicy: dto.accessPolicy ?? AccessPolicy.PUBLIC,
        uploadedById: actorId,
      },
    });

    await this.audit.log({ actorId, action: 'media.registered', entityType: 'MEDIA_ASSET', entityId: media.id });
    return this.withPublicUrl(media);
  }

  async findById(id: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media asset not found.');
    return this.withPublicUrl(media);
  }

  async attachToEntity(entityType: string, entityId: string, mediaAssetId: string, role = 'gallery', order = 0) {
    return this.prisma.entityMedia.create({
      data: { entityType: entityType as any, entityId, mediaAssetId, role, order },
    });
  }

  private withPublicUrl<T extends { storageKey: string; accessPolicy: AccessPolicy }>(media: T) {
    if (media.accessPolicy === AccessPolicy.RESTRICTED) {
      return { ...media, url: null };
    }
    return { ...media, url: this.s3.publicUrl(media.storageKey) };
  }
}
