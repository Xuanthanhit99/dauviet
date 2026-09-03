import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';
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
}
