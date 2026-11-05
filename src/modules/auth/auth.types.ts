import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';

export const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  nutritionistProfile: {
    select: { id: true, displayName: true, timezone: true },
  },
} as const satisfies Prisma.UserSelect;
export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;
export type AuthIdentity = { user: PublicUser; sessionId: string };
export type AuthRequest = Request & { auth?: AuthIdentity };
export type SessionGrant = {
  refreshToken: string;
  refreshExpiresAt: Date;
  body: {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
    user: PublicUser;
  };
};
