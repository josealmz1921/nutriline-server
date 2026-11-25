import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import { PrismaService } from '../../database/prisma.service.js';
import { activeStatuses } from '../support/support.schemas.js';
import type {
  AccountStatus,
  AdminList,
  AuditList,
  PaymentList,
} from './admin.schemas.js';

const adminUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  nutritionistProfile: { select: { id: true, displayName: true } },
} as const satisfies Prisma.UserSelect;
export interface AuditRow {
  id: string;
  actorId: string;
  userId: string;
  actorEmail: string;
  userEmail: string;
  action: string;
  reason: string | null;
  createdAt: Date;
  ticketId: string | null;
}

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async users(query: AdminList) {
    const search = query.search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search } },
            { nutritionistProfile: { displayName: { contains: search } } },
          ],
        }
      : {};
    const [data, total] = await this.db.$transaction(
      [
        this.db.user.findMany({
          where,
          select: adminUserSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.user.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
  async user(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: adminUserSelect,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }
  async setStatus(actor: PublicUser, userId: string, input: AccountStatus) {
    if (actor.role !== 'ADMIN')
      throw new ForbiddenException('Acceso administrativo requerido');
    if (actor.id === userId)
      throw new ForbiddenException('No puedes bloquear tu propia cuenta');
    return this.db.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string; role: string; status: string }[]
        >`SELECT id, role, status FROM users WHERE id = ${userId} FOR UPDATE`;
        const row = rows[0];
        if (!row) throw new NotFoundException('Usuario no encontrado');
        // Administrators are protected to avoid losing administrative access.
        if (row.role === 'ADMIN')
          throw new ForbiddenException(
            'No se permite bloquear cuentas administradoras',
          );
        if (row.status !== input.expectedStatus)
          throw new ConflictException(
            'La cuenta cambió. Actualiza antes de continuar.',
          );
        if (row.status === input.status)
          throw new ConflictException('La cuenta ya tiene ese estado');
        const user = await tx.user.update({
          where: { id: userId },
          data: { status: input.status },
          select: adminUserSelect,
        });
        if (input.status === 'INACTIVE') {
          await tx.authSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.passwordReset.updateMany({
            where: { userId, usedAt: null },
            data: { usedAt: new Date() },
          });
        }
        await tx.adminAccountEvent.create({
          data: {
            actorId: actor.id,
            userId,
            reason: input.reason,
            action: input.status === 'INACTIVE' ? 'BLOCKED' : 'UNBLOCKED',
          },
        });
        return user;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  async audit(query: AuditList) {
    // Include existing support history without duplicating or exposing message bodies.
    const union = Prisma.sql`
      SELECT e.id, e.actor_id AS actorId, e.user_id AS userId, e.action, e.reason, e.created_at AS createdAt, NULL AS ticketId FROM admin_account_events e
      UNION ALL
      SELECT e.id, e.actor_id, p.user_id, e.action, NULL, e.created_at, e.ticket_id FROM support_events e JOIN support_tickets t ON t.id = e.ticket_id JOIN nutritionist_profiles p ON p.id = t.nutritionist_id`;
    const conditions = [Prisma.sql`1 = 1`];
    if (query.userId)
      conditions.push(Prisma.sql`history.userId = ${query.userId}`);
    if (query.action)
      conditions.push(Prisma.sql`history.action = ${query.action}`);
    if (query.from)
      conditions.push(
        Prisma.sql`history.createdAt >= ${new Date(`${query.from}T00:00:00Z`)}`,
      );
    if (query.to)
      conditions.push(
        Prisma.sql`history.createdAt < ${new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86400000)}`,
      );
    const where = Prisma.join(conditions, ' AND ');
    const [data, count] = await this.db.$transaction(
      [
        this.db.$queryRaw<AuditRow[]>(
          Prisma.sql`SELECT history.*, actor.email AS actorEmail, target.email AS userEmail FROM (${union}) history JOIN users actor ON actor.id = history.actorId JOIN users target ON target.id = history.userId WHERE ${where} ORDER BY history.createdAt DESC, history.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
        ),
        this.db.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT COUNT(*) AS total FROM (${union}) history WHERE ${where}`,
        ),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: Number(count[0].total),
      },
    };
  }
  async summary() {
    const [users, blockedUsers, nutritionists, activeTickets] =
      await this.db.$transaction(
        [
          this.db.user.count(),
          this.db.user.count({ where: { status: 'INACTIVE' } }),
          this.db.nutritionistProfile.count(),
          this.db.supportTicket.count({
            where: { status: { in: [...activeStatuses] } },
          }),
        ],
        { isolationLevel: 'RepeatableRead' },
      );
    return {
      users,
      blockedUsers,
      nutritionists,
      activeTickets,
    };
  }
  async nutritionists(query: AdminList) {
    const search = query.search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.NutritionistProfileWhereInput = search
      ? {
          OR: [
            { displayName: { contains: search } },
            { user: { email: { contains: search } } },
          ],
        }
      : {};
    const [data, total] = await this.db.$transaction(
      [
        this.db.nutritionistProfile.findMany({
          where,
          select: {
            id: true,
            displayName: true,
            createdAt: true,
            user: { select: { email: true, status: true } },
            subscription: true,
            _count: {
              select: {
                billingPayments: true,
                supportTickets: {
                  where: { status: { in: [...activeStatuses] } },
                },
              },
            },
          },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.nutritionistProfile.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
  async payments(query: PaymentList) {
    const where: Prisma.BillingPaymentWhereInput = {
      ...(query.nutritionistId ? { nutritionistId: query.nutritionistId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from
                ? { gte: new Date(`${query.from}T00:00:00Z`) }
                : {}),
              ...(query.to
                ? {
                    lt: new Date(
                      new Date(`${query.to}T00:00:00Z`).getTime() + 86400000,
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction(
      [
        this.db.billingPayment.findMany({
          where,
          include: {
            nutritionist: { select: { id: true, displayName: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.billingPayment.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
      warning:
        'Solo lectura. Adyen y Mercado Pago pendientes de integrar. Estos registros no modifican acceso ni permisos.',
    };
  }
}
