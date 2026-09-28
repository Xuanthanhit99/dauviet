import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsNumber, Max, Min } from 'class-validator';

/**
 * Explicit, self-service consent start (spec section 7/56/63). The client
 * requests a duration; the server is the sole authority on whether it falls
 * within `AppConfig.tripLocation.sharingMin/MaxDurationMinutes` and on the
 * resulting `expiresAt` - never a client-supplied timestamp (spec section
 * 61). No UI duration *list* is baked in here (spec section 63) - just a
 * plain positive integer, validated against config-driven bounds in
 * `TripLocationSharingService`, not a hardcoded compile-time upper bound
 * that could drift from the deployed config.
 */
export class StartTripLocationSharingDto {
  @ApiProperty({ description: 'Requested sharing duration in minutes - validated against the server-configured min/max at request time.', example: 60 })
  @IsInt()
  @Min(1)
  durationMinutes!: number;
}

/**
 * Client-controlled fields only (spec section 64) - `userId`/`tripId` come
 * from the authenticated caller + route param, never the body; `receivedAt`
 * is server-owned; nothing else is accepted (global `ValidationPipe` runs
 * with `forbidNonWhitelisted: true`, so any extra field 400s outright).
 */
export class UpdateTripLocationDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ description: 'Device-reported horizontal accuracy radius in meters. Never negative/NaN/Infinite.' })
  @IsNumber()
  @Min(0)
  accuracyMeters!: number;

  @ApiProperty({ description: 'Device-reported ISO 8601 instant the coordinate was captured. Rejected if it claims an unreasonable future relative to server time (see AppConfig.tripLocation.maxFutureClockSkewSeconds). Never trusted as audit time - see `receivedAt` in the stored row, which is server-owned.' })
  @IsISO8601({ strict: true })
  capturedAt!: string;
}
