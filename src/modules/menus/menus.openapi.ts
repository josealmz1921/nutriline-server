import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createMenuSchema,
  editMenuSchema,
  menuCaptureSchema,
} from './menus.schemas.js';
export const createMenuBody = z.toJSONSchema(createMenuSchema, {
  target: 'openapi-3.0',
}) as SchemaObject;
export const editMenuBody = z.toJSONSchema(editMenuSchema, {
  target: 'openapi-3.0',
}) as SchemaObject;
const id: SchemaObject = { type: 'string', format: 'uuid' },
  instant: SchemaObject = { type: 'string', format: 'date-time' },
  revision: SchemaObject = { type: 'integer', minimum: 1 };
const summary: SchemaObject = {
  type: 'object',
  required: ['id', 'patientId', 'date', 'revision', 'createdAt', 'updatedAt'],
  properties: {
    id,
    patientId: id,
    date: { type: 'string', format: 'date' },
    revision,
    createdAt: instant,
    updatedAt: instant,
  },
};
export const menuResponse: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'patientId',
    'schemaVersion',
    'revision',
    'currentRevision',
    'createdAt',
    'updatedAt',
    'revisionCreatedAt',
    'menu',
    'patientSnapshot',
    'professionalSnapshot',
  ],
  properties: {
    id,
    patientId: id,
    schemaVersion: { type: 'integer', enum: [1, 2, 3] },
    revision,
    currentRevision: revision,
    createdAt: instant,
    updatedAt: instant,
    revisionCreatedAt: instant,
    menu: z.toJSONSchema(menuCaptureSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
    patientSnapshot: {
      type: 'object',
      required: ['id', 'fullName', 'birthDate', 'updatedAt'],
      properties: {
        id,
        fullName: { type: 'string' },
        birthDate: { type: 'string', format: 'date' },
        updatedAt: instant,
      },
    },
    professionalSnapshot: {
      type: 'object',
      required: ['id', 'displayName', 'timezone'],
      properties: {
        id,
        displayName: { type: 'string' },
        timezone: { type: 'string' },
      },
    },
  },
};
export const menusPageResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: { type: 'array', items: summary },
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
