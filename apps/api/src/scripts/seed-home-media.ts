import './config/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../modules/media/media.service';

type Target = {
  kind: 'STORY' | 'JOURNEY' | 'DESTINATION';
  slug: string;
};

const MEDIA = [
  {
    title: 'Hoàng thành Thăng Long — Điện Kính Thiên',
    commonsTitle: 'File:Dien Kinh Thien 002.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dien_Kinh_Thien_002.jpg',
    target: [
      { kind: 'STORY', slug: 'vi-sao-thang-long-tro-thanh-kinh-do' },
      { kind: 'DESTINATION', slug: 'hanoi-old-quarter' },
    ] as Target[],
    altText: 'Điện Kính Thiên tại Hoàng thành Thăng Long, Hà Nội',
    creatorName: 'Charles-Edouard Hocquard',
    license: 'Public domain',
    rightsStatus: 'PUBLIC_DOMAIN' as const,
    attributionText: 'Charles-Edouard Hocquard / Wikimedia Commons',
    isHistorical: true,
  },
  {
    title: 'Cố đô Huế — Hoàng thành',
    commonsTitle: 'File:Vietnam, Hue, Imperial City of Hue.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Vietnam,_Hue,_Imperial_City_of_Hue.jpg',
    target: [
      { kind: 'STORY', slug: 'hue-va-dau-an-kinh-do-trieu-nguyen' },
      { kind: 'JOURNEY', slug: 'di-san-mien-trung' },
    ] as Target[],
    altText: 'Hoàng thành Huế, cố đô của Việt Nam',
    creatorName: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    rightsStatus: 'LICENSED' as const,
    attributionText: '© Vyacheslav Argenberg / Wikimedia Commons',
    isHistorical: false,
  },
] as const;

async function commonsImage(title: string) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|user|extmetadata|size|mime|sha1');
  url.searchParams.set('format', 'json');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Wikimedia metadata request failed: ' + response.status);
  const json = await response.json() as any;
  const page = Object.values(json?.query?.pages ?? {})[0] as any;
  const info = page?.imageinfo?.[0];
  if (!info?.url || !info?.mime || !info?.size) throw new Error('Missing Commons image metadata for ' + title);
  return info;
}

async function findTarget(prisma: PrismaService, target: Target) {
  if (target.kind === 'STORY') return prisma.story.findUnique({ where: { canonicalSlug: target.slug }, select: { id: true, heroMediaId: true } });
  if (target.kind === 'JOURNEY') return prisma.journey.findUnique({ where: { canonicalSlug: target.slug }, select: { id: true, heroMediaId: true } });
  return prisma.destination.findUnique({ where: { canonicalSlug: target.slug }, select: { id: true, heroMediaId: true } });
}

async function setHero(prisma: PrismaService, target: Target, mediaId: string) {
  if (target.kind === 'STORY') await prisma.story.update({ where: { canonicalSlug: target.slug }, data: { heroMediaId: mediaId } });
  else if (target.kind === 'JOURNEY') await prisma.journey.update({ where: { canonicalSlug: target.slug }, data: { heroMediaId: mediaId } });
  else await prisma.destination.update({ where: { canonicalSlug: target.slug }, data: { heroMediaId: mediaId } });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const media = app.get(MediaService);
  const editor = await prisma.user.findFirst({ where: { roles: { has: 'EDITOR' } }, select: { id: true } });
  if (!editor) throw new Error('No EDITOR actor exists; run the normal Golden Dataset seed first.');

  for (const item of MEDIA) {
    const info = await commonsImage(item.commonsTitle);
    const targets = await Promise.all(item.target.map(async (target) => ({ target, row: await findTarget(prisma, target) })));
    if (targets.some((x) => !x.row)) throw new Error('Missing Home target entity: ' + JSON.stringify(targets.filter((x) => !x.row).map((x) => x.target)));

    const existing = targets.find((x) => x.row?.heroMediaId)?.row?.heroMediaId;
    if (existing) {
      console.log('Reusing existing hero media', existing, item.title);
      continue;
    }

    const source = await prisma.source.upsert({
      where: { url: item.sourceUrl },
      update: { title: item.title },
      create: {
        sourceType: 'WEBSITE',
        title: item.title,
        url: item.sourceUrl,
        credibilityLevel: 'TERTIARY',
        createdById: editor.id,
      },
      select: { id: true },
    });

    const body = Buffer.from(await (await fetch(info.url)).arrayBuffer());
    if (body.byteLength !== Number(info.size)) {
      throw new Error('Downloaded Commons object size mismatch for ' + item.commonsTitle);
    }

    const upload = await media.requestUpload({
      fileName: item.commonsTitle.replace(/^File:/, ''),
      mimeType: info.mime,
      sizeBytes: body.byteLength,
      type: 'PHOTO',
      purpose: 'photo',
      title: item.title,
      altText: item.altText,
      creatorName: item.creatorName,
      sourceId: source.id,
      license: item.license,
      rightsHolder: item.creatorName,
      attributionText: item.attributionText,
      provenanceNote: 'Downloaded from the exact Wikimedia Commons file after source-page/license review; production does not render the Commons URL directly.',
      isHistorical: item.isHistorical,
      accessPolicy: 'PUBLIC',
    }, editor.id);

    const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'content-type': info.mime }, body });
    if (!put.ok) throw new Error('S3 upload failed: ' + put.status);

    const confirmed = await media.confirmUpload(upload.id, {}, { id: editor.id, roles: ['EDITOR'] });
    console.log('Confirmed upload', confirmed.id);

    let status = 'PENDING_UPLOAD';
    for (let i = 0; i < 30; i++) {
      const row = await prisma.mediaAsset.findUnique({ where: { id: upload.id }, select: { status: true } });
      status = row?.status ?? 'MISSING';
      if (status === 'READY') break;
      if (status === 'FAILED' || status === 'QUARANTINED' || status === 'ARCHIVED') throw new Error('Media processing ended in ' + status);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (status !== 'READY') throw new Error('Media did not reach READY within 30s: ' + upload.id + ' (' + status + ')');

    for (const { target } of targets) await setHero(prisma, target, upload.id);
    console.log('Home hero media READY/PUBLIC and linked:', item.title, upload.id);
  }

  for (const item of MEDIA) {
    const rows = await Promise.all(item.target.map(async (target) => ({ target, row: await findTarget(prisma, target) })));
    for (const { target, row } of rows) {
      if (!row?.heroMediaId) throw new Error('Hero media link missing for ' + JSON.stringify(target));
      const publicMedia = await media.findPublicById(row.heroMediaId);
      if (!publicMedia?.url) throw new Error('Public media URL missing for ' + JSON.stringify(target));
      console.log('VERIFIED', JSON.stringify({ target, mediaId: row.heroMediaId, status: 'READY', accessPolicy: 'PUBLIC', url: publicMedia.url }));
    }
  }

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
