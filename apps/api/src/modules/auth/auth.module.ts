import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { CsrfService } from './csrf.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailerModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, CsrfService],
  exports: [AuthService],
})
export class AuthModule {}
