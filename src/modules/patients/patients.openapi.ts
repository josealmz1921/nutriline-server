import type { SchemaObject } from '@nestjs/swagger';
import { patientNationalities } from './patient-nationalities.js';

const fields: Record<string, SchemaObject> = {
  fullName: { type: 'string', minLength: 1, maxLength: 150 },
  birthDate: {
    type: 'string',
    format: 'date',
    description:
      'YYYY-MM-DD real, entre 1000-01-01 y hoy (UTC); sin límite clínico de edad',
  },
  email: { type: 'string', format: 'email', maxLength: 254, nullable: true },
  phone: { type: 'string', minLength: 1, maxLength: 32, nullable: true },
  occupation: { type: 'string', minLength: 1, maxLength: 150, nullable: true },
  gender: { type: 'string', enum: ['Hombre', 'Mujer'], nullable: true },
  nationality: {
    type: 'string',
    enum: [...patientNationalities],
    nullable: true,
    description:
      'Código del catálogo original, incluidos códigos históricos; no se infiere.',
  },
};
export const createPatientBody: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['fullName', 'birthDate'],
  properties: fields,
};
export const updatePatientBody: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    ...fields,
    expectedUpdatedAt: {
      type: 'string',
      format: 'date-time',
      description:
        'Versión leída del expediente; devuelve 409 si otro proceso la modificó. No cuenta como campo editable.',
    },
  },
};
export const patientResponse: SchemaObject = {
  type: 'object',
  required: [
    'id',
    ...Object.keys(fields),
    'archivedAt',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    ...fields,
    archivedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
export const patientsPageResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: patientResponse },
    meta: {
      type: 'object',
      required: ['page', 'pageSize', 'total'],
      properties: {
        page: { type: 'integer' },
        pageSize: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
  },
};
