import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { AffiliateClicksService } from './affiliate-clicks.service';
import { CreateAffiliateClickDto } from './dto/affiliate-click.dto';

/**
 * Public commercial-redirect surface (spec section 71). Anonymous-friendly
 * (spec section 6) - `@Public()` lets the request through the global auth
 * guard unauthenticated; `OptionalJwtAuthGuard` (layered locally, spec
 * section 6/pre-implementation report section 7) captures the caller's
 * identity when they happen to be logged in, without ever requiring it.
 * Deliberately no click-history/list endpoint exists here at all (spec
 * section 51) - enumeration is ADMIN-only, a separate controller.
 */
@ApiTags('affiliate')
@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly clicks: AffiliateClicksService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('clicks')
  createClick(@CurrentUser() user: AuthUser | undefined, @Body() dto: CreateAffiliateClickDto) {
    return this.clicks.createClick(user?.id, dto);
  }

  /** Server-controlled redirect (spec section 72) - resolves an opaque token to its pre-validated destination, never a client-supplied URL. */
  @Public()
  @Get('r/:token')
  async redirect(@Param('token') token: string, @Res() res: Response) {
    const url = await this.clicks.resolveRedirect(token);
    res.redirect(302, url);
  }
}
