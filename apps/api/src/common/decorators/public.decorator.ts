import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks an endpoint as not requiring authentication (JwtAuthGuard is applied globally). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
