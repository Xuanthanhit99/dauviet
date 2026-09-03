import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
/** Restricts an endpoint to users holding at least one of the given roles. Enforced server-side by RolesGuard - never trust a hidden button (spec section 35). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
