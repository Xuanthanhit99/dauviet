import { ApiProperty } from '@nestjs/swagger';

/**
 * Consistent response envelope for every endpoint in the API.
 * See docs/backend/BACKEND_HANDOFF.md "API conventions" for the full contract.
 */
export class ApiMetaDto {
  @ApiProperty({ example: 'vi' })
  requestedLocale?: string;

  @ApiProperty({ example: 'vi' })
  resolvedLocale?: string;

  @ApiProperty({ required: false })
  fallbackApplied?: boolean;
}

export class ApiErrorDto {
  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'The request body failed validation.' })
  message!: string;

  @ApiProperty({ required: false })
  details?: unknown;
}

export class CursorPageInfoDto {
  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;

  @ApiProperty()
  hasMore!: boolean;
}
