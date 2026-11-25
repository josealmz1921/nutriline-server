import { z } from 'zod';
import { pageSchema } from '../support/support.schemas.js';

export const adminListSchema = pageSchema
  .extend({ search: z.string().trim().max(150).optional() })
  .strict();
export const paymentListSchema = pageSchema
  .extend({
    nutritionistId: z.uuid().optional(),
    provider: z.enum(['ADYEN', 'MERCADO_PAGO']).optional(),
    status: z
      .enum([
        'PENDING',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
      ])
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    'Rango de fechas inválido',
  );
export type AdminList = z.infer<typeof adminListSchema>;
export type PaymentList = z.infer<typeof paymentListSchema>;
export const userParamsSchema = z.object({ userId: z.uuid() }).strict();
export const accountStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']),
    expectedStatus: z.enum(['ACTIVE', 'INACTIVE']),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
export const auditListSchema = pageSchema
  .extend({
    userId: z.uuid().optional(),
    action: z
      .enum(['BLOCKED', 'UNBLOCKED', 'CREATED', 'UPDATED', 'REPLIED'])
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || q.from <= q.to,
    'Rango de fechas inválido',
  );
export type AccountStatus = z.infer<typeof accountStatusSchema>;
export type AuditList = z.infer<typeof auditListSchema>;
