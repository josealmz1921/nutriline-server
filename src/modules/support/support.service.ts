import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
import {
  activeStatuses,
  type ChangeTicket,
  type CreateTicket,
  type Reply,
  type TicketList,
} from './support.schemas.js';

const account = { id: true, email: true, role: true } as const;
const ticketInclude = {
  nutritionist: {
    select: { id: true, displayName: true, user: { select: { email: true } } },
  },
  assignedTo: { select: account },
} as const;
// Internal request hashes are never exposed to clients.
const present = <T extends { requestHash: string; clientRequestId: string }>(
  row: T,
) => {
  const { requestHash: _hash, clientRequestId: _request, ...result } = row;
  return result;
};

@Injectable()
export class SupportService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private scope(user: PublicUser): Prisma.SupportTicketWhereInput {
    if (user.role === 'ADMIN') return {};
    if (user.role !== 'NUTRITIONIST' || !user.nutritionistProfile)
      throw new ForbiddenException('Sin perfil de nutriólogo');
    return { nutritionistId: user.nutritionistProfile.id };
  }
  private async lockProfile(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM nutritionist_profiles WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Nutriólogo no encontrado');
  }
  async list(user: PublicUser, query: TicketList) {
    const where = {
      ...(user.role === 'ADMIN' && query.nutritionistId
        ? { nutritionistId: query.nutritionistId }
        : {}),
      ...this.scope(user),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total, activeCount] = await this.db.$transaction(
      [
        this.db.supportTicket.findMany({
          where,
          include: ticketInclude,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.supportTicket.count({ where }),
        this.db.supportTicket.count({
          where: { ...this.scope(user), status: { in: [...activeStatuses] } },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      data: rows.map(present),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        activeCount,
        activeLimit: user.role === 'ADMIN' ? null : 3,
      },
    };
  }
  async detail(user: PublicUser, ticketId: string) {
    const row = await this.db.supportTicket.findFirst({
      where: { id: ticketId, ...this.scope(user) },
      include: ticketInclude,
    });
    if (!row) throw new NotFoundException('Ticket no encontrado');
    return present(row);
  }
  async conversation(
    user: PublicUser,
    ticketId: string,
    page: { page: number; pageSize: number },
  ) {
    await this.detail(user, ticketId);
    const where = { ticketId };
    const [data, total] = await this.db.$transaction([
      this.db.supportMessage.findMany({
        where,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: account },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.db.supportMessage.count({ where }),
    ]);
    return { data, meta: { ...page, total } };
  }
  async events(
    user: PublicUser,
    ticketId: string,
    page: { page: number; pageSize: number },
  ) {
    await this.detail(user, ticketId);
    const where = { ticketId };
    const [data, total] = await this.db.$transaction([
      this.db.supportEvent.findMany({
        where,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          actor: { select: account },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      this.db.supportEvent.count({ where }),
    ]);
    return { data, meta: { ...page, total } };
  }
  async create(user: PublicUser, input: CreateTicket, targetId?: string) {
    const nutritionistId =
      user.role === 'ADMIN' ? targetId : user.nutritionistProfile?.id;
    if (!nutritionistId) throw new ForbiddenException('Indica el nutriólogo');
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          subject: input.subject,
          category: input.category,
          body: input.body,
          paymentId: input.paymentId ?? null,
          actor: user.id,
        }),
      )
      .digest('hex');
    return this.db.$transaction(
      async (tx) => {
        // All creates and status changes serialize on the same owner row, including admin overrides.
        await this.lockProfile(tx, nutritionistId);
        const previous = await tx.supportTicket.findUnique({
          where: {
            nutritionistId_clientRequestId: {
              nutritionistId,
              clientRequestId: input.clientRequestId,
            },
          },
          include: ticketInclude,
        });
        if (previous) {
          if (previous.requestHash !== hash)
            throw new ConflictException(
              'La referencia ya se utilizó con otro contenido',
            );
          return present(previous);
        }
        if (
          user.role !== 'ADMIN' &&
          (await tx.supportTicket.count({
            where: { nutritionistId, status: { in: [...activeStatuses] } },
          })) >= 3
        )
          throw new ConflictException(
            'Ya tienes 3 tickets activos. Puedes responder a los existentes o cerrar uno antes de crear otro.',
          );
        if (
          input.paymentId &&
          !(await tx.billingPayment.findFirst({
            where: { id: input.paymentId, nutritionistId },
            select: { id: true },
          }))
        )
          throw new NotFoundException(
            'Pago no encontrado para este nutriólogo',
          );
        const row = await tx.supportTicket.create({
          data: {
            nutritionistId,
            subject: input.subject,
            category: input.category,
            paymentId: input.paymentId,
            clientRequestId: input.clientRequestId,
            requestHash: hash,
            messages: {
              create: {
                authorId: user.id,
                body: input.body,
                clientRequestId: input.clientRequestId,
              },
            },
            events: {
              create: {
                actorId: user.id,
                action: 'CREATED',
                details: { adminOverride: user.role === 'ADMIN' },
              },
            },
          },
          include: ticketInclude,
        });
        return present(row);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  async reply(user: PublicUser, ticketId: string, input: Reply) {
    const ticket = await this.detail(user, ticketId);
    return this.db.$transaction(
      async (tx) => {
        await this.lockProfile(tx, ticket.nutritionistId);
        const row = await tx.supportTicket.findUniqueOrThrow({
          where: { id: ticketId },
        });
        const previous = await tx.supportMessage.findUnique({
          where: {
            ticketId_clientRequestId: {
              ticketId,
              clientRequestId: input.clientRequestId,
            },
          },
        });
        if (previous) {
          if (previous.authorId !== user.id || previous.body !== input.body)
            throw new ConflictException('Referencia de respuesta ya utilizada');
          return { id: previous.id };
        }
        if (row.status === 'CLOSED' || row.status === 'RESOLVED')
          throw new ConflictException(
            'El ticket está resuelto o cerrado. Crea otro si necesitas ayuda.',
          );
        const message = await tx.supportMessage.create({
          data: { ticketId, authorId: user.id, ...input },
        });
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: { version: { increment: 1 } },
        });
        await tx.supportEvent.create({
          data: {
            ticketId,
            actorId: user.id,
            action: 'REPLIED',
            details: { messageId: message.id },
          },
        });
        return { id: message.id };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  async change(user: PublicUser, ticketId: string, input: ChangeTicket) {
    const ticket = await this.detail(user, ticketId);
    if (
      user.role !== 'ADMIN' &&
      (input.status !== 'CLOSED' ||
        input.priority !== undefined ||
        input.assignedToId !== undefined)
    )
      throw new ForbiddenException('Solo puedes cerrar tu propio ticket');
    return this.db.$transaction(
      async (tx) => {
        await this.lockProfile(tx, ticket.nutritionistId);
        const row = await tx.supportTicket.findUniqueOrThrow({
          where: { id: ticketId },
        });
        if (row.version !== input.expectedVersion)
          throw new ConflictException(
            'El ticket cambió. Actualiza antes de continuar.',
          );
        if (
          input.assignedToId &&
          !(await tx.user.findFirst({
            where: { id: input.assignedToId, role: 'ADMIN', status: 'ACTIVE' },
            select: { id: true },
          }))
        )
          throw new NotFoundException('Administrador no encontrado');
        const { expectedVersion: _version, ...changes } = input;
        const updated = await tx.supportTicket.update({
          where: { id: ticketId },
          data: { ...changes, version: { increment: 1 } },
          include: ticketInclude,
        });
        await tx.supportEvent.create({
          data: {
            ticketId,
            actorId: user.id,
            action: 'UPDATED',
            details: {
              before: {
                status: row.status,
                priority: row.priority,
                assignedToId: row.assignedToId,
              },
              after: {
                status: updated.status,
                priority: updated.priority,
                assignedToId: updated.assignedToId,
              },
            },
          },
        });
        return present(updated);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
