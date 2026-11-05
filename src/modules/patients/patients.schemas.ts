import { z } from 'zod';
import { paginationShape } from '../../common/pagination.js';

// Date-only, never locale-dependent parsing or automatic calendar rollover.
export const birthDateSchema = z.iso
  .date()
  .refine(
    (value) =>
      value >= '1000-01-01' && value <= new Date().toISOString().slice(0, 10),
    'Fecha de nacimiento fuera de rango',
  );
const patientFields = {
  fullName: z.string().trim().min(1).max(150),
  birthDate: birthDateSchema,
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  phone: z.string().trim().min(1).max(32).nullable().optional(),
  occupation: z.string().trim().min(1).max(150).nullable().optional(),
};
export const createPatientSchema = z.object(patientFields).strict();
export const updatePatientSchema = createPatientSchema
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'Enviar al menos un campo editable',
  );
export const listPatientsSchema = z
  .object({
    ...paginationShape,
    search: z.string().trim().min(1).max(150).optional(),
    archived: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .strict();
export const patientParamsSchema = z.object({ patientId: z.uuid() }).strict();
export const emptyBodySchema = z.object({}).strict().optional();
export type CreatePatient = z.infer<typeof createPatientSchema>;
export type UpdatePatient = z.infer<typeof updatePatientSchema>;
export type ListPatients = z.infer<typeof listPatientsSchema>;
