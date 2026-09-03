import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const smtp = this.config.get('smtp', { infer: true });
    this.from = smtp.from;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
    });
  }

  async sendEmailVerification(to: string, token: string) {
    const appUrl = this.config.get('appUrl', { infer: true });
    const link = `${appUrl}/verify-email?token=${token}`;
    await this.send(to, 'Xac thuc email Dau Viet', `<p>Nhan vao lien ket de xac thuc email: <a href="${link}">${link}</a></p>`);
  }

  async sendPasswordReset(to: string, token: string) {
    const appUrl = this.config.get('appUrl', { infer: true });
    const link = `${appUrl}/reset-password?token=${token}`;
    await this.send(to, 'Dat lai mat khau Dau Viet', `<p>Nhan vao lien ket de dat lai mat khau: <a href="${link}">${link}</a></p>`);
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (error) {
      this.logger.warn(`Failed to send email to ${to}: ${(error as Error).message}`);
    }
  }
}
