import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Environment } from '../../config/environment.js';
@Injectable()
export class RecoveryMailer {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}
  async send(to: string, link: string) {
    const get = <K extends keyof Environment>(key: K) =>
      this.config.get(key, { infer: true });
    if (get('MAIL_MODE') !== 'smtp') throw new Error('Correo no habilitado');
    const transport = nodemailer.createTransport({
      host: get('SMTP_HOST'),
      port: get('SMTP_PORT'),
      secure: get('SMTP_SECURE'),
      requireTLS: get('NODE_ENV') === 'production' && !get('SMTP_SECURE'),
      auth: get('SMTP_USER')
        ? { user: get('SMTP_USER'), pass: get('SMTP_PASSWORD') }
        : undefined,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({
        from: get('MAIL_FROM'),
        to,
        subject: 'Restablecer contraseña · Nutriline',
        text: `Solicitaste restablecer tu contraseña de Nutriline.\n\nAbre este enlace en el mismo sitio de Nutriline:\n${link}\n\nVence en 15 minutos desde la solicitud y solo puede usarse una vez. Si no lo solicitaste, ignora este mensaje; tu contraseña no ha cambiado.\nNutriline nunca te pedirá responder este correo con tu contraseña.`,
      });
      if (!result.accepted.length) throw new Error('Entrega no aceptada');
    } finally {
      transport.close();
    }
  }
}
