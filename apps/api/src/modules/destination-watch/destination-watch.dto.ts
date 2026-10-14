import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class FollowDestinationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  destinationId!: string;
}

export class UpdateWatchPreferencesDto {
  @IsOptional()
  @IsBoolean()
  eventUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  editorialUpdates?: boolean;
}
