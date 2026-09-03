import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Optional on purpose: mobile/API clients send the refresh token in the body,
 * web clients in cookie mode omit it and rely on the httpOnly `dv_refresh`
 * cookie instead (see AuthController). One or the other must be present -
 * enforced in the controller, not here, since it depends on the cookie.
 */
export class RefreshTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
