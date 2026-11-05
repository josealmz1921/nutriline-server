import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import type { Environment } from '../../config/environment.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PasswordService } from './password.service.js';
import {
  publicUserSelect,
  type AuthIdentity,
  type PublicUser,
  type SessionGrant,
} from './auth.types.js';

const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  exp: z.number(),
  iat: z.number(),
});
const refreshSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}
  async login(email: string, password: string): Promise<SessionGrant> {
    const row = await this.db.user.findUnique({
      where: { email },
      select: { ...publicUserSelect, passwordHash: true },
    });
    const matches = await this.passwords.verify(password, row?.passwordHash);
    if (!row || !matches || row.status !== 'ACTIVE')
      throw new UnauthorizedException('Credenciales inválidas');
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(
      Date.now() +
        this.config.get('AUTH_REFRESH_TTL_DAYS', { infer: true }) * 86400000,
    );
    const session = await this.db.authSession.create({
      data: {
        userId: row.id,
        refreshTokenHash: tokenHash(refreshToken),
        familyId: randomUUID(),
        expiresAt: refreshExpiresAt,
      },
    });
    const { passwordHash: _passwordHash, ...user } = row;
    return this.grant(user, session.id, refreshToken, refreshExpiresAt);
  }
  async authenticate(token: string): Promise<AuthIdentity> {
    let claims: z.infer<typeof claimsSchema>;
    try {
      claims = claimsSchema.parse(
        await this.jwt.verifyAsync(token, {
          secret: this.config.get('AUTH_ACCESS_SECRET', { infer: true }),
          algorithms: ['HS256'],
          issuer: 'nutriline-api',
          audience: 'nutriline-web',
        }),
      );
    } catch {
      throw new UnauthorizedException('Sesión inválida');
    }
    const session = await this.db.authSession.findUnique({
      where: { id: claims.sid },
      include: { user: { select: publicUserSelect } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Sesión inválida');
    }
    return { user: session.user, sessionId: session.id };
  }
  async refresh(rawToken: unknown): Promise<SessionGrant> {
    const parsed = refreshSchema.safeParse(rawToken);
    if (!parsed.success) throw new UnauthorizedException('Sesión inválida');
    const hash = tokenHash(parsed.data);
    const nextToken = randomBytes(32).toString('base64url');
    const result = await this.db.$transaction(async (tx) => {
      // Serializar rotaciones concurrentes del mismo token en MySQL.
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE refresh_token_hash = ${hash} FOR UPDATE`;
      const now = new Date();
      const session = await tx.authSession.findUnique({
        where: { refreshTokenHash: hash },
        include: { user: { select: publicUserSelect } },
      });
      if (!session) return null;
      if (
        session.revokedAt ||
        session.expiresAt <= now ||
        session.user.status !== 'ACTIVE'
      ) {
        await tx.authSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        // Retornar, no lanzar aquí: la revocación debe hacer COMMIT.
        return null;
      }
      await tx.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      const next = await tx.authSession.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: tokenHash(nextToken),
          expiresAt: session.expiresAt,
        },
      });
      return {
        user: session.user,
        sessionId: next.id,
        expiresAt: next.expiresAt,
      };
    });
    if (!result) throw new UnauthorizedException('Sesión inválida');
    return this.grant(
      result.user,
      result.sessionId,
      nextToken,
      result.expiresAt,
    );
  }
  async logout(rawToken: unknown): Promise<void> {
    const parsed = refreshSchema.safeParse(rawToken);
    if (!parsed.success) return;
    const session = await this.db.authSession.findUnique({
      where: { refreshTokenHash: tokenHash(parsed.data) },
    });
    if (session)
      await this.db.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
  }
  private async grant(
    user: PublicUser,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<SessionGrant> {
    const expiresIn = this.config.get('AUTH_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    const accessToken = await this.jwt.signAsync(
      { sid: sessionId },
      {
        secret: this.config.get('AUTH_ACCESS_SECRET', { infer: true }),
        algorithm: 'HS256',
        subject: user.id,
        issuer: 'nutriline-api',
        audience: 'nutriline-web',
        expiresIn,
      },
    );
    return {
      refreshToken,
      refreshExpiresAt,
      body: { accessToken, tokenType: 'Bearer', expiresIn, user },
    };
  }
}
