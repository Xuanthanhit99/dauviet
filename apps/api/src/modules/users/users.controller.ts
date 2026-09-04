import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BadgeType, Role, UserStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ description: 'Spec section 27 - visited places are private unless the user opts in.' })
  @IsOptional()
  @IsBoolean()
  visitedPlacesPublic?: boolean;
}

class SetRolesDto {
  @IsArray()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}

class SetStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

class GrantBadgeDto {
  @IsEnum(BadgeType)
  type!: BadgeType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @ApiBearerAuth()
  @Get('users/me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @ApiBearerAuth()
  @Patch('users/me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('users/me/visited-places')
  myVisitedPlaces(@CurrentUser() user: AuthUser) {
    return this.users.myVisitedPlaces(user.id);
  }

  @Public()
  @Get('profiles/:id')
  publicProfile(@Param('id') id: string) {
    return this.users.publicProfile(id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch('admin/users/:id/roles')
  setRoles(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: SetRolesDto) {
    return this.users.setRoles(actor.id, id, dto.roles);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch('admin/users/:id/status')
  setStatus(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.users.setStatus(actor.id, id, dto.status);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post('admin/users/:id/badges')
  grantBadge(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: GrantBadgeDto) {
    return this.users.grantBadge(actor.id, id, dto.type, dto.reason);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Delete('admin/users/:id/badges/:type')
  revokeBadge(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Param('type') type: BadgeType) {
    return this.users.revokeBadge(actor.id, id, type);
  }
}
