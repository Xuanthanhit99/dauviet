import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../modules/media/media.service';
import { StorageProvider } from '../modules/media/storage-provider';

type Target = { kind: 'STORY' | 'JOURNEY' | 'DESTINATION'; slug: string };
type Fixture = {
  commonsTitle: string;
  sourcePage: string;
  target: Target[];
  title: string;
  altText: string;
  creatorName: string;
  license: string;
  rightsStatus: 'LICENSED' | 'PUBLIC_DOMAIN';
  attributionText: string;
  isHistorical: boolean;
};

const FIXTURES: Fixture[] = [
  {
    commonsTitle: 'File:Dien Kinh Thien 002.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Dien_Kinh_Thien_002.jpg',
    target: [
      { kind: 'STORY', slug: 'vi-sao-thang-long-tro-thanh-kinh-do' },
    ],
    title: 'Điện Kính Thiên tại Hoàng thành Thăng Long',
    altText: 'Điện Kính Thiên tại Hoàng thành Thăng Long, Hà Nội',
    creatorName: 'Charles-Edouard Hocquard',
    license: 'Public domain',
    rightsStatus: 'PUBLIC_DOMAIN',
    attributionText: 'Charles-Edouard Hocquard / Wikimedia Commons',
    isHistorical: true,
  },
  {
    commonsTitle: 'File:Vietnam, Hue, Imperial City of Hue.jpg',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Vietnam,_Hue,_Imperial_City_of_Hue.jpg',
    target: [
      { kind: 'STORY', slug: 'hue-va-dau-an-kinh-do-trieu-nguyen' },
      { kind: 'JOURNEY', slug: 'di-san-mien-trung' },
    ],
    title: 'Cố đô Huế — Hoàng thành',
    altText: 'Hoàng thành Huế, cố đô của Việt Nam',
    creatorName: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    rightsStatus: 'LICENSED',
    attributionText: '© Vyacheslav Argenberg / Wikimedia Commons',
    isHistorical: false,
  },
];

async function commonsImage(title: string) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime|sha1');
  url.searchParams.set('format', 'json');
  const response = await fetch(url, { headers: { 'User-Agent': 'DauViet-Consumer-QA/1.0' } });
  if (!response.ok) throw new Error('Commons metadata request failed: ' + response.status);
  const json = await response.json() as any;
  const info = Object.values(json?.query?.pages ?? {})[0] as any;
  const image = info?.imageinfo?.[0];
  if (!image?.url || !image?.mime || !image?.size) throw new Error('Missing Commons metadata for ' + title);
  return image as { url: string; mime: string; size: number };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const media = app.get(MediaService);
  const storage = app.get(StorageProvider);
  const editor = await prisma.user.findFirst({ where: { roles: { has: 'EDITOR' } }, select: { id: true } });
  if (!editor) throw new Error('Golden seed did not create an EDITOR actor.');

  for (const fixture of FIXTURES) {
    const info = await commonsImage(fixture.commonsTitle);
    const source = await prisma.source.findFirst({ where: { url: fixture.sourcePage, archivedAt: null }, select: { id: true } })
      ?? await prisma.source.create({
        data: { sourceType: 'WEBSITE', title: fixture.title, url: fixture.sourcePage, credibilityLevel: 'TERTIARY', createdById: editor.id },
        select: { id: true },
      });

    const body = Buffer.from(await (await fetch(info.url, { headers: { 'User-Agent': 'DauViet-Consumer-QA/1.0' } })).arrayBuffer());
    if (body.length !== Number(info.size)) throw new Error('Commons byte-size mismatch for ' + fixture.commonsTitle);

    const upload = await media.requestUpload({
      fileName: fixture.commonsTitle.replace(/^File:/, ''),
      mimeType: info.mime,
      sizeBytes: body.length,
      type: 'PHOTO',
      purpose: 'photo',
      title: fixture.title,
      altText: fixture.altText,
      creatorName: fixture.creatorName,
      sourceId: source.id,
      license: fixture.license,
      rightsHolder: fixture.creatorName,
      attributionText: fixture.attributionText,
      provenanceNote: 'CI-only fixture: exact curated Wikimedia Commons source copied into local MinIO; production never renders the source URL.',
      isHistorical: fixture.isHistorical,
      accessPolicy: 'PUBLIC',
    }, editor.id);

    await storage.putObject(upload.storageKey, body, info.mime);
    await media.confirmUpload(upload.id, {}, { id: editor.id, roles: ['EDITOR'] });

    for (let i = 0; i < 30; i++) {
      const row = await prisma.mediaAsset.findUnique({ where: { id: upload.id }, select: { status: true } });
      if (row?.status === 'READY') break;
      if (['FAILED', 'QUARANTINED', 'ARCHIVED'].includes(row?.status ?? '')) throw new Error('Media fixture failed: ' + upload.id + ' status=' + row?.status);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (i === 29) throw new Error('Media fixture did not reach READY: ' + upload.id);
    }

    for (const target of fixture.target) {
      if (target.kind === 'STORY') await prisma.story.update({ where: { canonicalSlug: target.slug }, data: { heroMediaId: upload.id } });
      else if (target.kind === 'JOURNEY') await prisma.journey.update({ where: { canonicalSlug: target.slug }, data: { heroMediaId: upload.id } });
      else await prisma.destination.update({ where: { canonicalSlug: target.slug }, data: { heroMediaId: upload.id } });

      const publicMedia = await media.findPublicById(upload.id);
      if (!publicMedia.url) throw new Error('Fixture public URL missing for ' + JSON.stringify(target));
      console.log('HOME_MEDIA_VERIFIED', JSON.stringify({ target, mediaId: upload.id, status: 'READY', accessPolicy: 'PUBLIC', url: publicMedia.url }));
    }
  }
  await app.close();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
