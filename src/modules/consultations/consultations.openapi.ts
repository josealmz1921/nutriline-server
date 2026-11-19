import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { assessmentSchema } from './assessment.schemas.js';

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
const legacyConsultationBody: SchemaObject = {
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
const assessmentBody = z.toJSONSchema(assessmentSchema, {
  target: 'openapi-3.0',
}) as SchemaObject;
export const consultationBody: SchemaObject = {
  description:
    'Contrato mínimo original o evaluación completa v1. No mezclar ambos. La evaluación conserva capturas y resultados del cliente, sin aprobación clínica. Reintentos del mismo clientRequestId y contenido devuelven la misma consulta.',
  oneOf: [
    legacyConsultationBody,
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'occurredAt',
        'reason',
        'clientRequestId',
        'patientUpdatedAt',
        'assessment',
      ],
      properties: {
        occurredAt: instant,
        reason: { type: 'string', minLength: 1, maxLength: 500 },
        notes: { type: 'string', nullable: true, maxLength: 10000 },
        clientRequestId: { type: 'string', format: 'uuid' },
        patientUpdatedAt: instant,
        assessment: assessmentBody,
      },
    },
  ],
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
    clientRequestId: { type: 'string', format: 'uuid', nullable: true },
    assessmentVersion: { type: 'integer', nullable: true, example: 1 },
    assessment: {
      ...assessmentBody,
      nullable: true,
      description:
        'Solo detalle/creación. El historial omite esta captura para no multiplicar datos clínicos. Incluye patientSnapshot asignado por el servidor.',
      properties: {
        ...assessmentBody.properties,
        serverCalculations: {
          type: 'object',
          additionalProperties: false,
          description:
            'Solo respuesta, calculado por servidor al crear. Ausente en consultas anteriores; nunca recalculado al leer. No aprobación clínica.',
          required: [
            'engineVersion',
            'catalogVersion',
            'resultsOrigin',
            'clinicalApproval',
            'calculatedAt',
            'inputsHash',
            'arithmetic',
            'results',
          ],
          properties: {
            engineVersion: {
              type: 'string',
              example: 'nutriline-server-assessment-1',
            },
            catalogVersion: { type: 'string', example: 'legacy-six-foods-1' },
            resultsOrigin: { type: 'string', enum: ['server'] },
            clinicalApproval: { type: 'boolean', enum: [false] },
            calculatedAt: instant,
            inputsHash: {
              type: 'string',
              description:
                'SHA-256 de capturas originales y nacimiento asignado por servidor.',
            },
            arithmetic: { type: 'string' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'group',
                  'id',
                  'label',
                  'unit',
                  'value',
                  'detail',
                  'methodCode',
                  'methodVersion',
                  'status',
                ],
                properties: {
                  group: {
                    type: 'string',
                    enum: ['anthropometry', 'formulas', 'recall', 'activities'],
                  },
                  id: { type: 'string' },
                  label: { type: 'string' },
                  unit: { type: 'string' },
                  value: { type: 'number', nullable: true },
                  subtotal: { type: 'number', nullable: true },
                  detail: { type: 'string' },
                  methodCode: { type: 'string' },
                  methodVersion: { type: 'string', example: '1' },
                  status: {
                    type: 'string',
                    enum: ['calculated', 'excluded', 'unavailable'],
                  },
                },
              },
            },
          },
        },
        patientSnapshot: {
          type: 'object',
          required: ['id', 'fullName', 'birthDate', 'updatedAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            birthDate: { type: 'string', format: 'date' },
            updatedAt: instant,
          },
        },
      },
    },
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
export const consultationDirectoryResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta', 'summary'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'patientId', 'occurredAt', 'reason', 'patient'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          occurredAt: instant,
          reason: { type: 'string' },
          patient: {
            type: 'object',
            required: ['fullName', 'archivedAt'],
            properties: {
              fullName: { type: 'string' },
              archivedAt: { ...instant, nullable: true },
            },
          },
        },
      },
    },
    meta: consultationsPageResponse.properties!.meta,
    summary: {
      type: 'object',
      required: ['patients', 'archivedConsultations'],
      description: 'Totales del conjunto filtrado, no solo de esta página',
      properties: {
        patients: { type: 'integer' },
        archivedConsultations: { type: 'integer' },
      },
    },
  },
};
