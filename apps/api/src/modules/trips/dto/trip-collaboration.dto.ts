import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TripMemberRole } from '@prisma/client';
import { OffsetPaginationQuery } from '../../../common/dto/pagination.dto';

const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Invitations may only ever grant EDITOR/VIEWER - never OWNER directly (spec section 19); ownership only ever moves via explicit transfer. */
export class CreateTripInvitationDto {
  @ApiProperty({ example: 'friend@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: TripMemberRole })
  @IsIn(['EDITOR', 'VIEWER'])
  role!: 'EDITOR' | 'VIEWER';
}

export class AcceptTripInvitationDto {
  @ApiProperty({ description: 'Raw bearer token from the invitation email - never accepted as a URL path/query parameter (see G07_PRE_IMPLEMENTATION_REPORT.md section 13).' })
  @IsString()
  token!: string;
}

export class DeclineTripInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;
}

export class UpdateTripMemberRoleDto {
  @ApiProperty({ enum: TripMemberRole })
  @IsIn(['EDITOR', 'VIEWER'])
  role!: 'EDITOR' | 'VIEWER';

  @ApiProperty({ description: 'Trip.version at read time - reuses G06 optimistic concurrency (spec section 27/36).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class RemoveTripMemberDto {
  @ApiProperty({ description: 'Trip.version at read time.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class LeaveTripDto {
  @ApiProperty({ description: 'Trip.version at read time.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class TransferTripOwnershipDto {
  @ApiProperty({ description: 'userId of an existing ACCEPTED member - never a pending invitee, never a non-member (spec section 30/31).' })
  @IsString()
  newOwnerUserId!: string;

  @ApiProperty({ description: 'Trip.version at read time.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class ListTripActivityQuery extends OffsetPaginationQuery {}

export class ListTripInvitationsQuery extends OffsetPaginationQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
