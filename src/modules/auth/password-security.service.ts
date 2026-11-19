import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Environment } from '../../config/environment.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PasswordService } from './password.service.js';
import { RecoveryMailer } from './recovery-mailer.service.js';
import { recoveryMessage } from './password-security.schemas.js';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
@Injectable()
export class PasswordSecurityService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private delivering = false;
  private readonly logger = new Logger(PasswordSecurityService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(RecoveryMailer) private readonly mail: RecoveryMailer,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}
  onModuleInit() {
    if (
      this.config.get('NODE_ENV', { infer: true }) !== 'test' &&
      this.config.get('MAIL_MODE', { infer: true }) === 'smtp'
    ) {
      this.timer = setInterval(() => {
        void this.deliverPending().catch(() =>
          this.logger.warn(
            'No se pudo procesar la cola de recuperación; no se registran enlaces ni destinatarios.',
          ),
        );
      }, 5000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private key() {
    return createHash('sha256')
      .update('nutriline-reset-delivery-v1\0')
      .update(this.config.get('AUTH_ACCESS_SECRET', { infer: true }))
      .digest();
  }
  private encrypt(token: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv),
      bytes = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
      'base64url',
    );
  }
  private decrypt(payload: string) {
    const bytes = Buffer.from(payload, 'base64url'),
      cipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        bytes.subarray(0, 12),
      );
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString('utf8');
  }
  async forgot(email: string) {
    if (this.config.get('MAIL_MODE', { infer: true }) !== 'smtp')
      throw new ServiceUnavailableException(
        'La recuperación por correo no está disponible. Contacta al administrador.',
      );
    // Same response and baseline work for existing, inactive, suppressed or absent
    // accounts. SMTP delivery happens separately, not on the public request path.
    const baseline = delay(250);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE email = ${email} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { email },
          select: { id: true, status: true },
        });
        if (!user || user.status !== 'ACTIVE') return;
        const recent = await tx.passwordReset.findFirst({
          where: {
            userId: user.id,
            createdAt: { gt: new Date(Date.now() - 60000) },
          },
          select: { id: true },
        });
        if (recent) return;
        const token = randomBytes(32).toString('base64url');
        await tx.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: hash(token),
            deliveryPayload: this.encrypt(token),
            expiresAt: new Date(Date.now() + 15 * 60000),
          },
        });
      });
    } finally {
      await baseline;
    }
    return recoveryMessage;
  }
  async reset(token: string, newPassword: string) {
    const tokenHash = hash(token),
      candidate = await this.db.passwordReset.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });
    if (!candidate)
      throw new BadRequestException(
        'El enlace no es válido o ya venció. Solicita uno nuevo.',
      );
    const nextHash = await this.passwords.hash(newPassword);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId} FOR UPDATE`;
      const row = await tx.passwordReset.findUnique({
          where: { tokenHash },
          include: { user: { select: { status: true, passwordHash: true } } },
        }),
        now = new Date();
      if (
        !row ||
        row.usedAt ||
        row.expiresAt <= now ||
        row.user.status !== 'ACTIVE'
      )
        throw new BadRequestException(
          'El enlace no es válido o ya venció. Solicita uno nuevo.',
        );
      if (await this.passwords.verify(newPassword, row.user.passwordHash))
        throw new BadRequestException(
          'La nueva contraseña debe ser diferente de la actual.',
        );
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash: nextHash },
      });
      await tx.authSession.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordReset.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: now, deliveryPayload: null },
      });
    });
  }
  async change(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const nextHash = await this.passwords.hash(newPassword);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
          where: { id: userId },
          select: { status: true, passwordHash: true },
        }),
        now = new Date();
      const session = await tx.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
      });
      const start = session
        ? await tx.authSession.aggregate({
            where: { familyId: session.familyId },
            _min: { createdAt: true },
          })
        : null;
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !session ||
        !start?._min.createdAt ||
        now.getTime() - start._min.createdAt.getTime() >= 86400000
      )
        throw new BadRequestException(
          'No se pudo verificar la sesión. Inicia sesión de nuevo.',
        );
      if (!(await this.passwords.verify(currentPassword, user.passwordHash)))
        throw new BadRequestException('La contraseña actual no es correcta.');
      if (await this.passwords.verify(newPassword, user.passwordHash))
        throw new BadRequestException(
          'La nueva contraseña debe ser diferente de la actual.',
        );
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: nextHash },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.passwordReset.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now, deliveryPayload: null },
      });
    });
  }
  async deliverPending() {
    if (
      this.delivering ||
      this.config.get('MAIL_MODE', { infer: true }) !== 'smtp'
    )
      return;
    this.delivering = true;
    try {
      await this.db.passwordReset.updateMany({
        where: {
          expiresAt: { lte: new Date() },
          deliveryPayload: { not: null },
        },
        data: { deliveryPayload: null },
      });
      const rows = await this.db.passwordReset.findMany({
        where: {
          deliveredAt: null,
          usedAt: null,
          expiresAt: { gt: new Date() },
          deliveryPayload: { not: null },
          deliveryAttempts: { lt: 3 },
          OR: [
            { lastDeliveryAttemptAt: null },
            { lastDeliveryAttemptAt: { lt: new Date(Date.now() - 30000) } },
          ],
        },
        select: { id: true, userId: true },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });
      for (const candidate of rows)
        await this.db.$transaction(
          async (tx) => {
            // Same user-first lock as password changes/login/refresh; parallel workers
            // cannot send the same queued item concurrently or race a consumed token.
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.userId} FOR UPDATE`;
            const row = await tx.passwordReset.findUnique({
              where: { id: candidate.id },
              include: { user: { select: { email: true, status: true } } },
            });
            const now = new Date();
            if (
              !row ||
              row.usedAt ||
              row.deliveredAt ||
              !row.deliveryPayload ||
              row.expiresAt <= now ||
              row.deliveryAttempts >= 3 ||
              (row.lastDeliveryAttemptAt &&
                now.getTime() - row.lastDeliveryAttemptAt.getTime() < 30000)
            )
              return;
            if (row.user.status !== 'ACTIVE') {
              await tx.passwordReset.update({
                where: { id: row.id },
                data: { deliveryPayload: null },
              });
              return;
            }
            try {
              const token = this.decrypt(row.deliveryPayload),
                url = new URL(
                  '/restablecer-contrasena',
                  this.config.get('PASSWORD_RESET_ORIGIN', { infer: true }),
                );
              url.hash = 'token=' + token;
              await this.mail.send(row.user.email, url.toString());
              await tx.passwordReset.update({
                where: { id: row.id },
                data: {
                  deliveredAt: new Date(),
                  deliveryPayload: null,
                  deliveryAttempts: { increment: 1 },
                  lastDeliveryAttemptAt: now,
                },
              });
            } catch {
              await tx.passwordReset.update({
                where: { id: row.id },
                data: {
                  deliveryAttempts: { increment: 1 },
                  lastDeliveryAttemptAt: now,
                  ...(row.deliveryAttempts >= 2
                    ? { deliveryPayload: null }
                    : {}),
                },
              });
              this.logger.warn(
                'Falló una entrega de recuperación; sin datos sensibles. Reintentos limitados.',
              );
            }
          },
          { timeout: 20000 },
        );
    } finally {
      this.delivering = false;
    }
  }
}
