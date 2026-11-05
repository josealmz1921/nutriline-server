import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';

// Technical DECIMAL(8,3) limits, not medically approved plausibility ranges.
export const measurementSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,4})(\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0, 'La medida debe ser positiva');
const instantSchema = z.iso
  .datetime({ offset: true, precision: 3 })
  .or(z.iso.datetime({ offset: true, precision: 0 }))
  .refine(
    (value) => new Date(value).getUTCFullYear() >= 1000,
    'Fecha fuera de rango',
  );
export const createConsultationSchema = z
  .object({
    occurredAt: instantSchema,
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().min(1).max(10000).nullable().optional(),
    anthropometry: z
      .object({
        measuredAt: instantSchema,
        weightKg: measurementSchema,
        heightCm: measurementSchema,
        waistCm: measurementSchema.nullable().optional(),
        hipCm: measurementSchema.nullable().optional(),
      })
      .strict(),
  })
  .strict();
export const listConsultationsSchema = z.object(paginationShape).strict();
export const consultationParamsSchema = z
  .object({ consultationId: z.uuid() })
  .strict();
export type CreateConsultation = z.infer<typeof createConsultationSchema>;
export type ListConsultations = z.infer<typeof listConsultationsSchema>;
