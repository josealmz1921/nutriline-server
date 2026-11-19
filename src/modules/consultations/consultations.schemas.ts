import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';
import { assessmentSchema } from './assessment.schemas.js';

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
export const legacyConsultationSchema = z
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
export const completeConsultationSchema = z
  .object({
    occurredAt: instantSchema,
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().min(1).max(10000).nullable().optional(),
    clientRequestId: z.uuid(),
    patientUpdatedAt: z.iso.datetime({ offset: true }),
    assessment: assessmentSchema,
  })
  .strict()
  .refine(
    (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 95 * 1024,
    'La evaluación y las notas superan el límite técnico del envío',
  );
export const createConsultationSchema = z.union([
  legacyConsultationSchema,
  completeConsultationSchema,
]);
export const listConsultationsSchema = z.object(paginationShape).strict();
const directoryDate = z.iso.date().refine((value) => value >= '1000-01-01');
export const consultationDirectorySchema = z
  .object({
    ...paginationShape,
    search: z.string().trim().min(1).max(150).optional(),
    status: z.enum(['all', 'active', 'archived']).default('all'),
    order: z.enum(['recent', 'oldest', 'patient']).default('recent'),
    fromDate: directoryDate.optional(),
    toDate: directoryDate.optional(),
  })
  .strict()
  .refine((v) => !v.fromDate || !v.toDate || v.fromDate <= v.toDate, {
    message: 'Desde no puede ser posterior a Hasta',
    path: ['toDate'],
  });
export type ConsultationDirectoryQuery = z.infer<
  typeof consultationDirectorySchema
>;
export const consultationParamsSchema = z
  .object({ consultationId: z.uuid() })
  .strict();
export type CreateConsultation = z.infer<typeof createConsultationSchema>;
export type ListConsultations = z.infer<typeof listConsultationsSchema>;
