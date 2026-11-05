import type { SchemaObject } from '@nestjs/swagger';

const instant: SchemaObject = { type: 'string', format: 'date-time' };
const measurement: SchemaObject = {
  type: 'string',
  pattern: '^(0|[1-9]\\d{0,4})(\\.\\d{1,3})?$',
  description:
    'Decimal positivo, máximo 99999.999, hasta tres decimales; límite técnico, no clínico',
};
const anthropometry: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['measuredAt', 'weightKg', 'heightCm'],
  properties: {
    measuredAt: instant,
    weightKg: measurement,
    heightCm: measurement,
    waistCm: { ...measurement, nullable: true },
    hipCm: { ...measurement, nullable: true },
  },
};
export const consultationBody: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['occurredAt', 'reason', 'anthropometry'],
  properties: {
    occurredAt: instant,
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    notes: { type: 'string', minLength: 1, maxLength: 10000, nullable: true },
    anthropometry,
  },
};
export const consultationResponse: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'patientId',
    'occurredAt',
    'reason',
    'notes',
    'createdAt',
    'anthropometry',
    'calculations',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    occurredAt: instant,
    reason: { type: 'string' },
    notes: { type: 'string', nullable: true },
    createdAt: instant,
    anthropometry: {
      ...anthropometry,
      nullable: true,
      required: ['measuredAt', 'weightKg', 'heightCm', 'waistCm', 'hipCm'],
    },
    calculations: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'methodCode',
          'methodVersion',
          'value',
          'unit',
          'calculatedAt',
        ],
        properties: {
          methodCode: { type: 'string', example: 'BMI' },
          methodVersion: { type: 'string', example: '1' },
          value: { type: 'string', example: '22.86' },
          unit: { type: 'string', example: 'kg/m2' },
          calculatedAt: instant,
        },
      },
    },
  },
};
export const consultationsPageResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: consultationResponse },
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
