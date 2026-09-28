import { BadRequestException } from '@nestjs/common';

export interface ParsedBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Strict `west,south,east,north` (EPSG:4326) bbox parsing shared by search
 * and map. A malformed / non-finite / out-of-range value never reaches SQL.
 * An antimeridian-crossing bbox (west > east) is EXPLICITLY REJECTED rather
 * than silently mis-queried (G11 spec 46); clients split it into two calls.
 */
export function parseBbox(bbox: string | undefined, code: string): ParsedBbox {
  const fail = (message: string) => new BadRequestException({ code, message });
  if (!bbox) throw fail('bbox is required, formatted as west,south,east,north (minLng,minLat,maxLng,maxLat).');
  const parts = bbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw fail('bbox must be four finite numbers: west,south,east,north.');
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) throw fail('bbox coordinates out of range (lng in [-180,180], lat in [-90,90]).');
  if (minLng >= maxLng || minLat >= maxLat) throw fail('bbox must have west < east and south < north (an antimeridian-crossing bbox is not supported - split it into two requests).');
  return { minLng, minLat, maxLng, maxLat };
}
