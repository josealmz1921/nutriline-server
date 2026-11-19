import type { SchemaObject } from '@nestjs/swagger';

export const publicUserSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'email', 'role', 'status', 'nutritionistProfile'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['ADMIN', 'NUTRITIONIST'] },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    nutritionistProfile: {
      type: 'object',
      nullable: true,
      required: ['id', 'displayName', 'timezone'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        displayName: { type: 'string' },
        timezone: { type: 'string' },
      },
    },
  },
};
export const sessionSchema: SchemaObject = {
  type: 'object',
  required: [
    'accessToken',
    'tokenType',
    'expiresIn',
    'sessionExpiresAt',
    'user',
  ],
  properties: {
    accessToken: { type: 'string' },
    tokenType: { type: 'string', enum: ['Bearer'] },
    expiresIn: {
      type: 'integer',
      description: 'Segundos de vigencia del access token',
    },
    user: publicUserSchema,
    sessionExpiresAt: {
      type: 'string',
      format: 'date-time',
      description:
        'Vencimiento absoluto UTC, máximo 24 h desde el login; no se extiende al renovar.',
    },
  },
};
