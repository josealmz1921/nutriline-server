import { z } from 'zod';

export const activeStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_REPLY'] as const;
export const statusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'WAITING_REPLY',
  'RESOLVED',
  'CLOSED',
]);
export const ticketParams = z.object({ ticketId: z.uuid() }).strict();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export const ticketListSchema = pageSchema
  .extend({
    status: statusSchema.optional(),
    nutritionistId: z.uuid().optional(),
  })
  .strict();
export const createTicketSchema = z
  .object({
    clientRequestId: z.uuid(),
    subject: z.string().trim().min(3).max(150),
    category: z.enum(['ERROR', 'QUESTION', 'PAYMENT']),
    body: z.string().trim().min(5).max(4000),
    paymentId: z.uuid().optional(),
  })
  .strict();
export const adminCreateTicketSchema = createTicketSchema.extend({
  nutritionistId: z.uuid(),
});
export const replySchema = z
  .object({
    clientRequestId: z.uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();
export const changeTicketSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    status: statusSchema.optional(),
    priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
    assignedToId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.status !== undefined ||
      v.priority !== undefined ||
      v.assignedToId !== undefined,
    'Indica un cambio',
  );
export const closeTicketSchema = z
  .object({ expectedVersion: z.number().int().min(1) })
  .strict();
export type TicketList = z.infer<typeof ticketListSchema>;
export type CreateTicket = z.infer<typeof createTicketSchema>;
export type Reply = z.infer<typeof replySchema>;
export type ChangeTicket = z.infer<typeof changeTicketSchema>;
